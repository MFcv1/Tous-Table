/**
 * COMMERCE: Création de commande (Stripe Checkout + Manuel)
 * 
 * INPUT: { items: [{ id, collectionName, quantity }], paymentMethod: 'stripe'|'manual', shipping: {...} }
 * OUTPUT: { success: true, url: string } (Stripe) ou { success: true, orderId: string } (Manuel)
 * 
 * SÉCURITÉ:
 * - Auth requise + email_verified
 * - Prix recalculé côté serveur (jamais confiance au front)
 * - Stock vérifié en transaction atomique
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { checkIsAdmin } = require('../../helpers/security');
const { STRIPE_SECRET_KEY, GMAIL_EMAIL, GMAIL_PASSWORD } = require('../../helpers/secrets');
const { APP_ID, getSiteUrl } = require('../../helpers/config');

const db = admin.firestore();
const Stripe = require('stripe');

exports.createOrder = functions.runWith({ secrets: [STRIPE_SECRET_KEY, GMAIL_EMAIL, GMAIL_PASSWORD] }).https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Auth requise.');

    // Sécurité: Email vérifié obligatoire
    if (!context.auth.token.email_verified) {
        throw new functions.https.HttpsError('failed-precondition',
            'Veuillez vérifier votre email avant de passer commande. Consultez votre boîte de réception (ou spams).'
        );
    }

    const stripe = Stripe(STRIPE_SECRET_KEY.value());

    const userId = context.auth.uid;
    const { orderData } = data;

    if (!orderData || !orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Format de commande invalide.');
    }

    // 1. Validation de stock et calcul du prix TOTAL réel (côté serveur)
    // Note: pour stripe_elements, cette étape est intégrée dans la transaction de réservation unique (section 4)
    let totalAmount = 0;

    if (orderData.paymentMethod === 'manual' || orderData.paymentMethod === 'deferred') {
        try {
            await db.runTransaction(async (transaction) => {
                const stockTracker = {};

                for (const item of orderData.items) {
                    const colName = item.collectionName || 'furniture';
                    const realItemId = item.originalId || item.id;
                    const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${colName}/${realItemId}`);
                    const itemSnap = await transaction.get(itemRef);

                    if (!itemSnap.exists) {
                        throw new functions.https.HttpsError('not-found', `Produit "${realItemId}" introuvable.`);
                    }

                    const itemDb = itemSnap.data();
                    const alreadyTaken = stockTracker[realItemId] || 0;
                    const currentDbStock = itemDb.stock !== undefined ? Number(itemDb.stock) : 1;
                    const isUniqueFurniture = colName === 'furniture';
                    const qtyToReserve = item.quantity || 1;
                    const availableStock = isUniqueFurniture
                        ? (alreadyTaken > 0 ? 0 : currentDbStock)
                        : currentDbStock - alreadyTaken;

                    if (availableStock < qtyToReserve || itemDb.sold) {
                        throw new functions.https.HttpsError('failed-precondition', `Article indisponible (Stock épuisé): ${itemDb.name}`);
                    }

                    stockTracker[realItemId] = alreadyTaken + qtyToReserve;

                    // Prix prioritaire : Enchère gagnante > Prix actuel > Prix départ
                    let realPrice = itemDb.currentPrice || itemDb.startingPrice || 0;
                    totalAmount += realPrice;
                }
            });
        } catch (e) {
            console.error("Stock Check Error", e);
            throw e;
        }
    }

    const SITE_URL = getSiteUrl();

    // 2. Paiement Différé (Manuel: Virement/Chèque)
    if (orderData.paymentMethod === 'manual' || orderData.paymentMethod === 'deferred') {
        const orderRef = db.collection('orders').doc();
        try {
            await db.runTransaction(async (transaction) => {
                const stockTrackerManual = {};
                const serverItems = [];
                let txTotal = 0;
                for (const item of orderData.items) {
                    const colName = item.collectionName || 'furniture';
                    const realItemId = item.originalId || item.id;
                    const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${colName}/${realItemId}`);

                    const itemDoc = await transaction.get(itemRef);
                    if (!itemDoc.exists) throw new Error("Item not found");
                    const itemDb = itemDoc.data();

                    const currentStock = itemDb.stock !== undefined ? Number(itemDb.stock) : 1;
                    const alreadyTaken = stockTrackerManual[realItemId] || 0;
                    const isUniqueFurniture = colName === 'furniture';
                    const qtyToReserve = item.quantity || 1;
                    const availableStock = isUniqueFurniture
                        ? (alreadyTaken > 0 ? 0 : currentStock)
                        : currentStock - alreadyTaken;

                    if (availableStock < qtyToReserve || itemDb.sold) {
                        throw new functions.https.HttpsError('failed-precondition', `Article indisponible (Stock épuisé): ${itemDb.name}`);
                    }

                    const newStock = isUniqueFurniture ? 0 : Math.max(0, currentStock - qtyToReserve - alreadyTaken);
                    const realPrice = itemDb.currentPrice || itemDb.startingPrice || 0;

                    txTotal += realPrice * qtyToReserve;
                    serverItems.push({
                        id: realItemId,
                        originalId: realItemId,
                        collectionName: colName,
                        name: itemDb.name,
                        price: realPrice,
                        quantity: qtyToReserve,
                        image: item.image || (itemDb.images && itemDb.images.length > 0 ? itemDb.images[0] : (itemDb.imageUrl || null))
                    });

                    const updates = { stock: newStock, buyerId: userId };
                    if (isUniqueFurniture || newStock === 0) {
                        updates.sold = true;
                        updates.soldAt = admin.firestore.FieldValue.serverTimestamp();
                    }

                    transaction.update(itemRef, updates);
                    stockTrackerManual[realItemId] = alreadyTaken + qtyToReserve;
                }
                transaction.set(orderRef, {
                    ...orderData,
                    items: serverItems,
                    userId: userId,
                    userEmail: context.auth.token.email || orderData.shipping?.email,
                    paymentMethod: 'deferred',
                    total: txTotal,
                    status: 'pending_payment',
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    stripeSessionId: null
                });
            });

            // [NEW] Vidage du panier côté serveur (Sécurité maximale)
            try {
                const cartRef = db.collection('users').doc(userId).collection('cart');
                const cartSnaps = await cartRef.get();
                if (!cartSnaps.empty) {
                    const batch = db.batch();
                    cartSnaps.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            } catch (err) {
                console.error("Erreur vidage panier côté serveur:", err);
            }

            return { success: true, orderId: orderRef.id };
        } catch (e) {
            console.error("Manual Order Error", e);
            throw new functions.https.HttpsError('internal', "Erreur enregistrement commande.");
        }
    }

    // 3. Stripe Checkout Session — SUPPRIMÉ (Mars 2026)
    // Mode externe supprimé au profit du PaymentElement inline (stripe_elements)

    // 4. Stripe Elements (PaymentElement intégré — PaymentIntent)
    // Architecture anti-survente (fix Mars 2026):
    // 1. Transaction atomique unique: valide stock + calcule prix serveur + réserve stock + crée commande
    // 2. Crée le PaymentIntent Stripe avec l'orderId en metadata
    // 3. En cas d'échec Stripe: restaure le stock + supprime la commande en transaction
    // 4. Le webhook payment_intent.succeeded confirme la commande (sans re-décrémenter le stock)
    // 5. Le webhook payment_intent.payment_failed restaure le stock
    if (orderData.paymentMethod === 'stripe_elements') {
        const orderRef = db.collection('orders').doc();

        // Transaction unique : valider stock + calculer prix serveur + réserver stock + créer commande
        // Remplace l'ancienne double-transaction (validation puis réservation) par une seule opération atomique
        let serverTotalAmount = 0;
        try {
            await db.runTransaction(async (transaction) => {
                const stockTracker = {};
                let txTotal = 0;
                const serverItems = [];

                for (const item of orderData.items) {
                    const colName = item.collectionName || 'furniture';
                    const realItemId = item.originalId || item.id;
                    const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${colName}/${realItemId}`);
                    const itemDoc = await transaction.get(itemRef);

                    if (!itemDoc.exists) throw new functions.https.HttpsError('not-found', `Produit "${realItemId}" introuvable.`);

                    const itemDb = itemDoc.data();
                    const alreadyTaken = stockTracker[realItemId] || 0;
                    const currentStock = itemDb.stock !== undefined ? Number(itemDb.stock) : 1;
                    const isUniqueFurniture = colName === 'furniture';
                    const qtyToReserve = item.quantity || 1;
                    const availableStock = isUniqueFurniture
                        ? (alreadyTaken > 0 ? 0 : currentStock)
                        : currentStock - alreadyTaken;

                    if (availableStock < qtyToReserve || itemDb.sold) {
                        throw new functions.https.HttpsError('failed-precondition', `Article indisponible (Stock épuisé): ${itemDb.name}`);
                    }

                    // Prix recalculé côté serveur (jamais confiance au client)
                    const realPrice = itemDb.currentPrice || itemDb.startingPrice || 0;
                    txTotal += realPrice;

                    serverItems.push({
                        id: realItemId,
                        collectionName: colName,
                        name: itemDb.name,
                        price: realPrice,
                        quantity: item.quantity || 1,
                        image: item.image || (item.images && item.images.length > 0 ? item.images[0] : (item.imageUrl || null))
                    });

                    const newStock = isUniqueFurniture ? 0 : Math.max(0, currentStock - qtyToReserve - alreadyTaken);
                    const updates = { stock: newStock };
                    if (isUniqueFurniture || newStock === 0) {
                        updates.sold = true;
                        updates.soldAt = admin.firestore.FieldValue.serverTimestamp();
                        updates.buyerId = userId;
                    }

                    transaction.update(itemRef, updates);
                    stockTracker[realItemId] = alreadyTaken + qtyToReserve;
                }

                serverTotalAmount = txTotal;

                transaction.set(orderRef, {
                    userId: userId,
                    userEmail: context.auth.token.email || orderData.shipping?.email,
                    items: serverItems,
                    shipping: orderData.shipping || {},
                    total: txTotal,
                    paymentMethod: 'stripe_elements',
                    status: 'pending_payment',
                    stockReserved: true,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    stripePaymentIntentId: null
                });
            });
        } catch (e) {
            console.error("Stock Reservation Error:", e);
            throw e;
        }

        // Créer le PaymentIntent (après la réservation du stock)
        const shippingData = orderData.shipping || {};
        try {
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Math.round(serverTotalAmount * 100),
                currency: 'eur',
                automatic_payment_methods: { enabled: true },
                receipt_email: context.auth.token.email,
                shipping: {
                    name: shippingData.fullName || '',
                    address: {
                        line1: shippingData.address || '',
                        city: shippingData.city || '',
                        postal_code: shippingData.zip || '',
                        country: 'FR',
                    },
                    phone: shippingData.phone || '',
                },
                metadata: {
                    userId: userId,
                    userEmail: context.auth.token.email || '',
                    orderId: orderRef.id,
                    shippingMeta: JSON.stringify(shippingData).substring(0, 500),
                    itemsMeta: JSON.stringify(orderData.items.map(i => ({ id: i.originalId || i.id, col: i.collectionName || 'furniture', qty: i.quantity || 1 }))).substring(0, 500)
                }
            });

            await orderRef.update({ stripePaymentIntentId: paymentIntent.id });

            return {
                success: true,
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                orderId: orderRef.id
            };
        } catch (error) {
            // Échec Stripe : restaurer le stock + supprimer la commande en transaction
            console.error("PaymentIntent Error, restoring stock:", error);
            try {
                await db.runTransaction(async (transaction) => {
                    for (const item of orderData.items) {
                        const colName = item.collectionName || 'furniture';
                        const realItemId = item.originalId || item.id;
                        const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${colName}/${realItemId}`);
                        const itemDoc = await transaction.get(itemRef);
                        if (!itemDoc.exists) continue;
                        const currentStock = itemDoc.data().stock !== undefined ? Number(itemDoc.data().stock) : 0;
                        const qtyToRestore = item.quantity || 1;
                        transaction.update(itemRef, {
                            stock: currentStock + qtyToRestore,
                            sold: false,
                            soldAt: admin.firestore.FieldValue.delete(),
                            buyerId: admin.firestore.FieldValue.delete()
                        });
                    }
                    transaction.delete(orderRef);
                });
            } catch (restoreError) {
                console.error("CRITICAL: Stock restore failed after PI error:", restoreError);
            }
            throw new functions.https.HttpsError('internal', "Erreur initialisation paiement sécurisé.");
        }
    }

    // Fallback: méthode de paiement non reconnue
    throw new functions.https.HttpsError('invalid-argument', 'Méthode de paiement non supportée.');
});
