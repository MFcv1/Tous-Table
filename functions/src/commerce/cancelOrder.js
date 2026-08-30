/**
 * COMMERCE: Annulation commande par le client
 * 
 * INPUT: { orderId: string }
 * Règle: Annulation possible dans les 7 jours suivant la commande.
 * Restaure le stock des produits si applicable.
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { APP_ID } = require('../../helpers/config');
const { checkIsSuperAdmin } = require('../../helpers/security');
const { invalidatePublicCatalogCache } = require('../public/catalog');

const db = admin.firestore();
const STOCK_ALREADY_RELEASED_STATUSES = new Set([
    'cancelled_by_client',
    'canceled',
    'payment_failed'
]);

const orderStillOwnsReservedStock = (orderData) => (
    orderData?.stockReserved !== false
    && !STOCK_ALREADY_RELEASED_STATUSES.has(orderData?.status)
);

const getStockRestoreRequests = (items) => {
    const restoreByProduct = new Map();

    for (const item of Array.isArray(items) ? items : []) {
        const itemId = item?.originalId || item?.id;
        const collectionName = item?.collection || item?.collectionName || 'furniture';
        if (!itemId || !['furniture', 'cutting_boards'].includes(collectionName) || String(itemId).includes('/')) continue;

        const key = `${collectionName}/${itemId}`;
        const previous = restoreByProduct.get(key);
        restoreByProduct.set(key, {
            itemId,
            collectionName,
            quantity: (previous?.quantity || 0) + Math.max(1, Number(item?.quantity) || 1)
        });
    }

    return [...restoreByProduct.values()].map(request => ({
        ...request,
        itemRef: db.doc(`artifacts/${APP_ID}/public/data/${request.collectionName}/${request.itemId}`)
    }));
};

const restoreOrderStockInTransaction = async (transaction, orderData) => {
    const restoreRequests = getStockRestoreRequests(orderData.items);
    const itemSnaps = await Promise.all(restoreRequests.map(({ itemRef }) => transaction.get(itemRef)));

    restoreRequests.forEach(({ collectionName, quantity, itemRef }, index) => {
        const itemSnap = itemSnaps[index];
        if (!itemSnap.exists) return;

        const currentStock = Number(itemSnap.data().stock) || 0;
        const restoredStock = collectionName === 'furniture' ? 1 : currentStock + quantity;
        transaction.update(itemRef, {
            stock: restoredStock,
            sold: false,
            soldAt: admin.firestore.FieldValue.delete(),
            buyerId: admin.firestore.FieldValue.delete(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
};

exports.cancelOrderClient = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');

    const { orderId } = data;
    if (!orderId) throw new functions.https.HttpsError('invalid-argument', 'ID de commande manquant.');

    const userId = context.auth.uid;
    const orderRef = db.collection('orders').doc(orderId);

    const result = await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Commande introuvable.');
        }

        const orderData = orderSnap.data();

        // Vérifier que c'est bien SA commande
        if (orderData.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Cette commande ne vous appartient pas.');
        }

        // Vérifier que la commande n'est pas déjà annulée/expédiée
        if (['paid', 'cancelled_by_client', 'canceled', 'payment_failed', 'shipped', 'completed'].includes(orderData.status)) {
            throw new functions.https.HttpsError('failed-precondition', 'Cette commande ne peut plus être annulée.');
        }

        // Vérifier le délai de 7 jours
        const createdAt = orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(orderData.createdAt);
        const diffDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
            throw new functions.https.HttpsError('failed-precondition', 'Le délai d\'annulation de 7 jours est dépassé.');
        }

        // Les anciennes commandes sans flag sont considérées réservées. En revanche,
        // `false` ou un statut d'échec Stripe signifie que le webhook a déjà restauré.
        if (orderStillOwnsReservedStock(orderData)) {
            await restoreOrderStockInTransaction(transaction, orderData);
        }

        // Annuler la commande
        transaction.update(orderRef, {
            status: 'cancelled_by_client',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            clientNote: "Annulée par l'acheteur",
            stockReserved: false
        });

        return { success: true };
    });

    // Best-effort : cold load publicCatalog plus frais après restore stock.
    invalidatePublicCatalogCache();
    return result;
});

exports.cancelAndDeleteOrderAdmin = functions.https.onCall(async (data, context) => {
    checkIsSuperAdmin(context);

    const orderId = String(data?.orderId || '').trim();
    if (!orderId || orderId.includes('/')) {
        throw new functions.https.HttpsError('invalid-argument', 'ID de commande invalide.');
    }

    const orderRef = db.collection('orders').doc(orderId);
    const result = await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Commande introuvable.');
        }

        const orderData = orderSnap.data();
        if (orderStillOwnsReservedStock(orderData)) {
            await restoreOrderStockInTransaction(transaction, orderData);
        }
        transaction.delete(orderRef);
        return { success: true, orderId };
    });

    invalidatePublicCatalogCache();
    return result;
});
