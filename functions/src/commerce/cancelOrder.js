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
const { invalidatePublicCatalogCache } = require('../public/catalog');

const db = admin.firestore();

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
        if (['cancelled_by_client', 'shipped', 'completed'].includes(orderData.status)) {
            throw new functions.https.HttpsError('failed-precondition', 'Cette commande ne peut plus être annulée.');
        }

        // Vérifier le délai de 7 jours
        const createdAt = orderData.createdAt?.toDate ? orderData.createdAt.toDate() : new Date(orderData.createdAt);
        const diffDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays > 7) {
            throw new functions.https.HttpsError('failed-precondition', 'Le délai d\'annulation de 7 jours est dépassé.');
        }

        // Toujours restaurer le stock depuis order.items (y compris virement deferred
        // où stockReserved peut être absent/false alors que le stock a bien été décrémenté).
        if (orderData.items && Array.isArray(orderData.items)) {
            for (const item of orderData.items) {
                const itemId = item.originalId || item.id;
                const col = item.collection || item.collectionName || 'furniture';

                if (itemId) {
                    const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${col}/${itemId}`);
                    const itemSnap = await transaction.get(itemRef);

                    if (itemSnap.exists) {
                        const itemData = itemSnap.data();
                        const currentStock = itemData.stock !== undefined ? Number(itemData.stock) : 0;
                        const qtyToRestore = item.quantity || 1;
                        // Meubles uniques : stock fixe à 1. Planches : stock cumulatif.
                        const restoredStock = col === 'furniture' ? 1 : currentStock + qtyToRestore;
                        const sold = col === 'furniture' ? false : restoredStock <= 0;
                        transaction.update(itemRef, {
                            stock: restoredStock,
                            sold,
                            soldAt: admin.firestore.FieldValue.delete(),
                            buyerId: admin.firestore.FieldValue.delete(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    }
                }
            }
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
