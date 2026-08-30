/**
 * AUTH: Ajouter/Révoquer un admin + Log connexion + Stats utilisateurs
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { checkIsAdmin, checkIsSuperAdmin, SUPER_ADMIN_EMAIL } = require('../../helpers/security');

const db = admin.firestore();

// --- AJOUTER UN ADMIN ---
exports.addAdminUser = functions.https.onCall(async (data, context) => {
    checkIsSuperAdmin(context);
    const { email, name } = data;
    if (!email) throw new functions.https.HttpsError('invalid-argument', 'Email requis.');

    let targetUid = null;
    let userExists = false;

    try {
        try {
            const userRecord = await admin.auth().getUserByEmail(email);
            targetUid = userRecord.uid;
            userExists = true;
            await admin.auth().setCustomUserClaims(userRecord.uid, { admin: true });
        } catch (e) {
            targetUid = `pending_${Date.now()}`;
        }

        const callerEmail = context.auth.token.email;
        await db.doc('sys_metadata/admin_users').set({
            users: {
                [targetUid]: {
                    uid: targetUid,
                    email: email,
                    name: name || 'Admin',
                    addedBy: callerEmail,
                    status: userExists ? 'active' : 'pending'
                }
            }
        }, { merge: true });

        if (userExists && targetUid) {
            await db.collection('users').doc(targetUid).set({
                role: 'admin',
                email: email,
                name: name || 'Admin',
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }
        return { success: true, userExists, uid: targetUid };
    } catch (error) {
        console.error("Erreur Add Admin:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- RÉVOQUER UN ADMIN ---
exports.removeAdminUser = functions.https.onCall(async (data, context) => {
    checkIsSuperAdmin(context);
    const { uid, email } = data;

    if (email === SUPER_ADMIN_EMAIL) {
        throw new functions.https.HttpsError('failed-precondition', 'Impossible de révoquer le super-administrateur.');
    }

    try {
        let targetUid = uid;
        if (email && (!targetUid || targetUid.startsWith('pending_'))) {
            try {
                const userRecord = await admin.auth().getUserByEmail(email);
                targetUid = userRecord.uid;
            } catch (e) { /* User might not exist yet */ }
        }

        if (targetUid && !targetUid.startsWith('pending_')) {
            await admin.auth().setCustomUserClaims(targetUid, { admin: false });
            await db.collection('users').doc(targetUid).update({ role: 'user' }).catch(() => { });
        }

        await db.doc('sys_metadata/admin_users').update({
            [`users.${uid || targetUid}`]: admin.firestore.FieldValue.delete()
        });

        return { success: true };
    } catch (error) {
        console.error("Erreur Remove Admin:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

// --- LOG CONNEXION (IP + Device) ---
exports.logUserConnection = functions.https.onCall(async (data, context) => {
    if (!context.auth) return { success: false, message: "Unauthenticated" };

    const userId = context.auth.uid;
    const rateLimitRef = db.doc(`sys_ratelimit/log_${userId}`);
    const rlSnap = await rateLimitRef.get();
    const rlData = rlSnap.exists ? rlSnap.data() : { count: 0, resetAt: 0 };

    if (Date.now() < rlData.resetAt && rlData.count >= 3) {
        return { success: true, rateLimited: true };
    }
    rateLimitRef.set({ count: 1, resetAt: Date.now() + 600000 }).catch(() => { });

    try {
        const rawIp = context.rawRequest.headers['x-forwarded-for'] || context.rawRequest.connection.remoteAddress;
        const ip = rawIp ? rawIp.split(',')[0].trim() : 'Unknown';
        const userAgent = context.rawRequest.headers['user-agent'] || 'Unknown';

        await db.collection('users').doc(userId).set({
            email: context.auth.token.email || null,
            lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
            securityData: {
                ip: ip,
                ua: userAgent,
                detectedAt: admin.firestore.FieldValue.serverTimestamp()
            }
        }, { merge: true });

        return { success: true, ip: ip };
    } catch (error) {
        console.error("❌ Erreur LogConnection:", error);
        return { success: false, error: error.message };
    }
});

// --- STATS UTILISATEURS (Admin) ---
exports.getUserStats = functions.runWith({ timeoutSeconds: 300, memory: '512MB' }).https.onCall(async (data, context) => {
    checkIsAdmin(context);

    try {
        let nextPageToken;
        const allUsers = [];
        const userDocsSnapshot = await db.collection('users').get();
        const userMetadataMap = {};
        userDocsSnapshot.forEach(doc => { userMetadataMap[doc.id] = doc.data(); });

        do {
            const listUsersResult = await admin.auth().listUsers(1000, nextPageToken);
            listUsersResult.users.forEach((userRecord) => {
                if (!userRecord.email || userRecord.providerData.length === 0) return;
                const meta = userMetadataMap[userRecord.uid] || {};
                allUsers.push({
                    uid: userRecord.uid,
                    email: userRecord.email,
                    displayName: userRecord.displayName || '',
                    emailVerified: userRecord.emailVerified,
                    creationTime: userRecord.metadata.creationTime,
                    lastSignInTime: userRecord.metadata.lastSignInTime,
                    ip: meta.securityData?.ip || 'N/A',
                    device: meta.securityData?.ua || 'N/A'
                });
            });
            nextPageToken = listUsersResult.pageToken;
        } while (nextPageToken);

        allUsers.sort((a, b) => new Date(b.creationTime) - new Date(a.creationTime));
        return { success: true, count: allUsers.length, users: allUsers };
    } catch (error) {
        console.error("❌ Erreur getUserStats:", error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
