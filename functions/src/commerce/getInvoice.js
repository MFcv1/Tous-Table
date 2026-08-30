const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { ensureInvoicePdf } = require('./invoiceStorage');

const db = admin.firestore();
const SUPER_ADMIN_EMAIL = 'matthis.fradin2@gmail.com';

function normalizeEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function canReadOrderInvoice(order, auth) {
    if (!auth) return false;
    const authEmail = normalizeEmail(auth.token?.email);
    const orderEmail = normalizeEmail(order.userEmail || order.shipping?.email);
    return order.userId === auth.uid
        || (authEmail && orderEmail && authEmail === orderEmail)
        || auth.token?.admin === true
        || authEmail === SUPER_ADMIN_EMAIL;
}

exports.getInvoicePdf = functions
    .runWith({ enforceAppCheck: true, memory: '256MB' })
    .https.onCall(async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
        }
        if (!context.auth.token.email_verified) {
            throw new functions.https.HttpsError('failed-precondition', 'Adresse email non vérifiée.');
        }

        const orderId = String(data?.orderId || '').trim();
        if (!orderId || orderId.includes('/') || orderId.length > 128) {
            throw new functions.https.HttpsError('invalid-argument', 'Commande invalide.');
        }

        const orderSnap = await db.collection('orders').doc(orderId).get();
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Commande introuvable.');
        }

        const order = orderSnap.data();
        if (!canReadOrderInvoice(order, context.auth)) {
            throw new functions.https.HttpsError('permission-denied', 'Accès refusé à cette facture.');
        }

        try {
            const invoice = await ensureInvoicePdf(orderId, { ...order, id: orderId });
            return {
                filename: invoice.filename,
                contentType: 'application/pdf',
                base64: invoice.buffer.toString('base64'),
                sha256: invoice.sha256,
            };
        } catch (error) {
            functions.logger.error('invoice_pdf_failed', {
                orderId,
                code: error?.code || 'unknown',
            });
            throw new functions.https.HttpsError('internal', 'La facture est temporairement indisponible.');
        }
    });

module.exports.canReadOrderInvoice = canReadOrderInvoice;
