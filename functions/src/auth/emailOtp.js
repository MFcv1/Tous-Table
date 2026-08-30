const crypto = require('crypto');
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { GMAIL_EMAIL, GMAIL_PASSWORD, OTP_HMAC_SECRET } = require('../../helpers/secrets');
const { sendOtpEmail } = require('../email/otpEmail');

const db = admin.firestore();
const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_DELAY_MS = 60 * 1000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const MAX_SENDS_PER_EMAIL = 5;
const MAX_SENDS_PER_IP = 20;
const MAX_VERIFY_ATTEMPTS = 5;
const MAX_TOKEN_ISSUES = 2;

function normalizeEmail(value) {
    const email = String(value || '').trim().toLowerCase();
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new functions.https.HttpsError('invalid-argument', 'Adresse email invalide.');
    }
    return email;
}

function normalizeCode(value) {
    const code = String(value || '').replace(/\D/g, '');
    if (!/^\d{6}$/.test(code)) {
        throw new functions.https.HttpsError('invalid-argument', 'Le code doit contenir 6 chiffres.');
    }
    return code;
}

function sha256(value) {
    return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function hmac(scope, email, code) {
    const secret = OTP_HMAC_SECRET.value();
    if (!secret) {
        throw new functions.https.HttpsError('failed-precondition', 'Configuration de connexion incomplète.');
    }
    return crypto.createHmac('sha256', secret).update(`${scope}:${email}:${code}`).digest('hex');
}

function timingSafeEqual(left, right) {
    if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
    return crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
}

function requestIp(context) {
    return String(context?.rawRequest?.ip || context?.rawRequest?.socket?.remoteAddress || 'unknown');
}

function otpRef(email) {
    return db.doc(`sys_ratelimit/email_otp_${sha256(email)}`);
}

function ipRef(context) {
    return db.doc(`sys_ratelimit/email_otp_ip_${sha256(requestIp(context))}`);
}

function retentionDate() {
    return admin.firestore.Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000);
}

async function getOrCreateVerifiedUser(email) {
    let userRecord;
    let created = false;
    try {
        userRecord = await admin.auth().getUserByEmail(email);
    } catch (error) {
        if (error?.code !== 'auth/user-not-found') throw error;
    }

    if (!userRecord) {
        userRecord = await admin.auth().createUser({ email, emailVerified: true });
        created = true;
    } else if (!userRecord.emailVerified) {
        userRecord = await admin.auth().updateUser(userRecord.uid, { emailVerified: true });
    }

    const profile = {
        email,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (created) profile.role = 'client';
    await db.collection('users').doc(userRecord.uid).set(profile, { merge: true });
    return userRecord;
}

exports.requestEmailOtp = functions
    .runWith({ secrets: [GMAIL_EMAIL, GMAIL_PASSWORD, OTP_HMAC_SECRET], enforceAppCheck: true })
    .https.onCall(async (data, context) => {
        const email = normalizeEmail(data?.email);
        const code = String(crypto.randomInt(100000, 1000000));
        const now = Date.now();
        const emailRef = otpRef(email);
        const sourceIpRef = ipRef(context);

        await db.runTransaction(async (transaction) => {
            const [emailSnap, ipSnap] = await Promise.all([
                transaction.get(emailRef),
                transaction.get(sourceIpRef)
            ]);
            const emailState = emailSnap.exists ? emailSnap.data() : {};
            const ipState = ipSnap.exists ? ipSnap.data() : {};

            if (Number(emailState.nextSendAtMillis || 0) > now) {
                throw new functions.https.HttpsError('resource-exhausted', 'Patientez avant de demander un nouveau code.');
            }

            const emailWindowActive = Number(emailState.windowEndsAtMillis || 0) > now;
            const emailCount = emailWindowActive ? Number(emailState.sendCount || 0) : 0;
            if (emailCount >= MAX_SENDS_PER_EMAIL) {
                throw new functions.https.HttpsError('resource-exhausted', 'Trop de codes demandés. Réessayez plus tard.');
            }

            const ipWindowActive = Number(ipState.windowEndsAtMillis || 0) > now;
            const ipCount = ipWindowActive ? Number(ipState.sendCount || 0) : 0;
            if (ipCount >= MAX_SENDS_PER_IP) {
                throw new functions.https.HttpsError('resource-exhausted', 'Trop de demandes. Réessayez plus tard.');
            }

            transaction.set(emailRef, {
                emailHash: sha256(email),
                otpHash: hmac('otp', email, code),
                status: 'active',
                attempts: 0,
                sendCount: emailCount + 1,
                windowEndsAtMillis: emailWindowActive ? emailState.windowEndsAtMillis : now + RATE_WINDOW_MS,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                expiresAtMillis: now + OTP_TTL_MS,
                nextSendAtMillis: now + RESEND_DELAY_MS,
                responseHash: admin.firestore.FieldValue.delete(),
                operationUid: admin.firestore.FieldValue.delete(),
                tokenIssueCount: 0,
                expireAt: retentionDate()
            }, { merge: true });
            transaction.set(sourceIpRef, {
                sendCount: ipCount + 1,
                windowEndsAtMillis: ipWindowActive ? ipState.windowEndsAtMillis : now + RATE_WINDOW_MS,
                expireAt: retentionDate()
            }, { merge: true });
        });

        try {
            await sendOtpEmail(email, code);
        } catch (error) {
            await emailRef.set({
                otpHash: admin.firestore.FieldValue.delete(),
                status: 'mail_failed',
                expireAt: retentionDate()
            }, { merge: true }).catch(() => {});
            functions.logger.error('email_otp_send_failed', {
                emailFingerprint: sha256(email).slice(0, 12),
                code: error?.code || 'mail-error'
            });
            throw new functions.https.HttpsError('unavailable', "Impossible d'envoyer le code pour le moment.");
        }

        functions.logger.info('email_otp_sent', { emailFingerprint: sha256(email).slice(0, 12) });
        return { success: true, expiresInSeconds: OTP_TTL_MS / 1000, resendAfterSeconds: RESEND_DELAY_MS / 1000 };
    });

exports.verifyEmailOtp = functions
    .runWith({ secrets: [OTP_HMAC_SECRET], enforceAppCheck: true })
    .https.onCall(async (data) => {
        const email = normalizeEmail(data?.email);
        const code = normalizeCode(data?.code);
        const now = Date.now();
        const emailRef = otpRef(email);
        const responseHash = hmac('response', email, code);

        const state = await db.runTransaction(async (transaction) => {
            const snap = await transaction.get(emailRef);
            if (!snap.exists) {
                throw new functions.https.HttpsError('failed-precondition', 'Code invalide ou expiré.');
            }
            const current = snap.data();
            if (!current.expiresAtMillis || now > current.expiresAtMillis) {
                throw new functions.https.HttpsError('deadline-exceeded', 'Ce code a expiré.');
            }
            if (Number(current.attempts || 0) >= MAX_VERIFY_ATTEMPTS) {
                throw new functions.https.HttpsError('resource-exhausted', 'Trop de tentatives. Demandez un nouveau code.');
            }

            if (current.status === 'active') {
                const receivedHash = hmac('otp', email, code);
                if (!timingSafeEqual(current.otpHash, receivedHash)) {
                    transaction.update(emailRef, {
                        attempts: admin.firestore.FieldValue.increment(1),
                        expireAt: retentionDate()
                    });
                    return { valid: false };
                }
                transaction.update(emailRef, {
                    status: 'verified',
                    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
                    responseHash,
                    otpHash: admin.firestore.FieldValue.delete(),
                    attempts: 0,
                    expireAt: retentionDate()
                });
                return { valid: true, uid: null };
            }

            if (!['verified', 'token_issued'].includes(current.status)
                || !timingSafeEqual(current.responseHash, responseHash)
                || Number(current.tokenIssueCount || 0) >= MAX_TOKEN_ISSUES) {
                throw new functions.https.HttpsError('failed-precondition', 'Ce code a déjà été utilisé. Demandez-en un nouveau.');
            }
            return { valid: true, uid: current.operationUid || null };
        });

        if (!state.valid) {
            throw new functions.https.HttpsError('permission-denied', 'Code incorrect.');
        }

        let uid = state.uid;
        if (!uid) {
            try {
                const userRecord = await getOrCreateVerifiedUser(email);
                uid = userRecord.uid;
                await emailRef.set({ operationUid: uid, expireAt: retentionDate() }, { merge: true });
            } catch (error) {
                functions.logger.error('email_otp_user_failed', {
                    emailFingerprint: sha256(email).slice(0, 12),
                    code: error?.code || 'auth-error'
                });
                throw new functions.https.HttpsError('unavailable', 'Connexion interrompue. Ressaisissez le même code.');
            }
        }

        try {
            const token = await admin.auth().createCustomToken(uid, {
                authMethod: 'email_otp',
                authAssurance: 'aal1'
            });
            await emailRef.set({
                status: 'token_issued',
                usedAt: admin.firestore.FieldValue.serverTimestamp(),
                tokenIssueCount: admin.firestore.FieldValue.increment(1),
                expireAt: retentionDate()
            }, { merge: true });
            functions.logger.info('email_otp_verified', { emailFingerprint: sha256(email).slice(0, 12) });
            return { success: true, token };
        } catch (error) {
            functions.logger.error('email_otp_token_failed', {
                emailFingerprint: sha256(email).slice(0, 12),
                code: error?.code || 'token-error'
            });
            throw new functions.https.HttpsError('unavailable', 'Connexion interrompue. Ressaisissez le même code.');
        }
    });

module.exports.normalizeEmail = normalizeEmail;
module.exports.normalizeCode = normalizeCode;
