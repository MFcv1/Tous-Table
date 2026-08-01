/**
 * COMMERCE: Webhook Stripe (Validation paiement)
 * 
 * Type: onRequest (HTTP endpoint, pas onCall)
 * Vérifie la signature cryptographique du webhook Stripe.
 * Crée la commande dans Firestore + marque les produits comme vendus.
 * 
 * SÉCURITÉ: Signature Stripe obligatoire (pas de fallback non-sécurisé)
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { STRIPE_SECRET_KEY, STRIPE_WH_SECRET } = require('../../helpers/secrets');
const { APP_ID } = require('../../helpers/config');

const db = admin.firestore();
const Stripe = require('stripe');

exports.stripeWebhook = functions.runWith({ secrets: [STRIPE_SECRET_KEY, STRIPE_WH_SECRET] }).https.onRequest(async (req, res) => {
    const stripe = Stripe(STRIPE_SECRET_KEY.value());
    const sig = req.headers['stripe-signature'];
    const endpointSecret = STRIPE_WH_SECRET.value();

    if (!endpointSecret) {
        console.error("❌ STRIPE_WH_SECRET not configured. Rejecting webhook.");
        return res.status(500).send('Webhook secret not configured');
    }

    let event;
    try {
        const rawBody = req.rawBody || req.body;
        if (endpointSecret && sig) {
            event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
        } else {
            console.error("❌ Missing signature. Blocking unsigned webhook.");
            return res.status(400).send('Missing signature');
        }
    } catch (err) {
        console.error(`❌ Webhook Security Error: ${err.message}`);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // ============================================================
    // HANDLER: payment_intent.succeeded (Stripe Elements / PaymentElement)
    // ============================================================
    if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data.object;
        console.log("💰 Webhook: PaymentIntent Succeeded:", paymentIntent.id);

        const orderId = paymentIntent.metadata?.orderId;
        const userId = paymentIntent.metadata?.userId;

        if (!orderId) {
            console.warn("PaymentIntent sans orderId dans metadata.");
            return res.json({ received: true });
        }

        try {
            const orderRef = db.collection('orders').doc(orderId);
            const orderSnap = await orderRef.get();

            if (!orderSnap.exists) {
                console.error("Commande introuvable pour orderId:", orderId);
                return res.json({ received: true });
            }

            const order = orderSnap.data();

            // Protection idempotence: ne pas traiter 2 fois
            if (order.status === 'paid') {
                console.log("Commande déjà marquée paid, skip:", orderId);
                return res.json({ received: true });
            }

            await db.runTransaction(async (transaction) => {
                // Si stockReserved=true, le stock a déjà été décrémenté lors de la création
                // de la commande — ne pas décrémenter une seconde fois (fix anti-survente)
                if (!order.stockReserved) {
                    for (const item of (order.items || [])) {
                        const itemId = item.id || item.originalId;
                        const col = item.collectionName || item.collection || 'furniture';

                        if (!itemId) {
                            console.warn("Item sans ID:", item.name);
                            continue;
                        }

                        const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${col}/${itemId}`);
                        const itemDoc = await transaction.get(itemRef);

                        if (!itemDoc.exists) {
                            console.warn("Item introuvable:", itemId);
                            continue;
                        }

                        const currentStock = itemDoc.data().stock !== undefined ? Number(itemDoc.data().stock) : 1;
                        const qtyPurchased = item.quantity || 1;
                        const isUniqueFurniture = col === 'furniture';
                        const newStock = isUniqueFurniture ? 0 : Math.max(0, currentStock - qtyPurchased);

                        const updates = { stock: newStock, buyerId: userId };
                        if (isUniqueFurniture || newStock === 0) {
                            updates.sold = true;
                            updates.soldAt = admin.firestore.FieldValue.serverTimestamp();
                            console.log(`🔒 Item SOLD OUT: ${itemId}`);
                        }

                        transaction.update(itemRef, updates);
                    }
                }

                // Confirmer la commande
                transaction.update(orderRef, {
                    status: 'paid',
                    paidAt: admin.firestore.FieldValue.serverTimestamp(),
                    stripePaymentIntentId: paymentIntent.id,
                    paymentMethod: 'stripe'
                });
            });

            console.log("✅ Commande confirmée (paid):", orderId);

            // [NEW] Vidage du panier côté serveur après paiement Stripe (Sécurité maximale)
            try {
                const cartRef = db.collection('users').doc(userId).collection('cart');
                const cartSnaps = await cartRef.get();
                if (!cartSnaps.empty) {
                    const batch = db.batch();
                    cartSnaps.forEach(doc => batch.delete(doc.ref));
                    await batch.commit();
                }
            } catch (err) {
                console.error("Erreur vidage panier côté serveur après Stripe:", err);
            }

        } catch (error) {
            console.error("❌ CRITICAL Webhook Error (payment_intent.succeeded):", error);
        }
    }

    // ============================================================
    // HANDLER: checkout.session.completed (Stripe Checkout — rétrocompatibilité)
    // ============================================================
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        console.log("💰 Webhook: Session Completed:", session.id);

        const userId = session.metadata.userId;
        const shippingMeta = session.metadata.shippingMeta ? JSON.parse(session.metadata.shippingMeta) : {};
        const total = session.amount_total / 100;

        try {
            console.log("🔍 Fetching line items with product expansion...");
            const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
                expand: ['data.price.product']
            });

            const items = lineItems.data.map(li => {
                const product = li.price.product;
                return {
                    id: product.metadata?.id || product.metadata?.firestoreId || null,
                    collectionName: product.metadata?.collection || product.metadata?.collectionName || 'furniture',
                    name: product.name,
                    price: li.amount_total / 100,
                    quantity: li.quantity,
                };
            });

            console.log("🛒 Items extracted:", JSON.stringify(items));

            const orderRef = db.collection('orders').doc();
            const orderData = {
                userId: userId,
                userEmail: session.customer_details.email || session.customer_email,
                items: items,
                total: total,
                shipping: shippingMeta,
                paymentMethod: 'stripe',
                stripeSessionId: session.id,
                status: 'paid',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            await db.runTransaction(async (transaction) => {
                // Check if an existing order already reserved stock (stockReserved flag)
                // If so, skip stock decrement to avoid double-decrement
                const existingOrderSnap = await transaction.get(orderRef);
                const skipStockDecrement = existingOrderSnap.exists && existingOrderSnap.data().stockReserved === true;

                if (!skipStockDecrement) {
                    for (const item of items) {
                        if (!item.id) {
                            console.warn("⚠️ Item sans ID Firestore (Metadata manquantes ?):", item.name);
                            continue;
                        }
                        const colName = item.collectionName || 'furniture';
                        const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${colName}/${item.id}`);
                        const itemSnap = await transaction.get(itemRef);

                        if (!itemSnap.exists) continue;
                        const itemDb = itemSnap.data();
                        const currentStock = itemDb.stock !== undefined ? itemDb.stock : 1;

                        const updates = {};
                        if (colName === 'furniture' || currentStock <= 1) {
                            updates.sold = true;
                            updates.buyerId = userId;
                            updates.soldAt = admin.firestore.FieldValue.serverTimestamp();
                            updates.stock = 0;
                            console.log(`🔒 Item SOLD OUT: ${item.id}`);
                        } else {
                            updates.stock = currentStock - 1;
                        }

                        transaction.update(itemRef, updates);
                    }
                } else {
                    console.log("⚡ Stock already reserved (stockReserved=true), skipping decrement for session:", session.id);
                }
                transaction.set(orderRef, orderData);
            });

            console.log("✅ Commande Stripe créée avec succès:", orderRef.id);
        } catch (error) {
            console.error("❌ Erreur CRITIQUE Webhook:", error);
        }
    }

    // ============================================================
    // HANDLER: payment_intent.payment_failed (Log + restauration stock)
    // ============================================================
    if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object;
        const orderId = pi.metadata?.orderId;
        console.error(`❌ Payment FAILED for PI ${pi.id}, Order: ${orderId || 'N/A'}, Reason: ${pi.last_payment_error?.message || 'unknown'}`);

        if (orderId) {
            try {
                const orderRef = db.collection('orders').doc(orderId);
                const orderSnap = await orderRef.get();

                if (!orderSnap.exists) return res.json({ received: true });
                const order = orderSnap.data();

                // Si le stock a été réservé à la création de la commande, le restaurer
                if (order.stockReserved && order.status !== 'paid') {
                    await db.runTransaction(async (transaction) => {
                        for (const item of (order.items || [])) {
                            const itemId = item.id || item.originalId;
                            const col = item.collectionName || item.collection || 'furniture';
                            if (!itemId) continue;

                            const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${col}/${itemId}`);
                            const itemDoc = await transaction.get(itemRef);
                            if (!itemDoc.exists) continue;

                            const currentStock = itemDoc.data().stock !== undefined ? Number(itemDoc.data().stock) : 0;
                            const qtyToRestore = item.quantity || 1;
                            const restoredStock = col === 'furniture' ? 1 : currentStock + qtyToRestore;
                            transaction.update(itemRef, {
                                stock: restoredStock,
                                sold: false,
                                soldAt: admin.firestore.FieldValue.delete(),
                                buyerId: admin.firestore.FieldValue.delete()
                            });
                        }
                        transaction.update(orderRef, {
                            status: 'payment_failed',
                            failedAt: admin.firestore.FieldValue.serverTimestamp(),
                            failureReason: pi.last_payment_error?.message || 'Payment failed',
                            stockReserved: false
                        });
                    });
                    console.log(`♻️ Stock restauré après échec de paiement: ${orderId}`);
                } else {
                    await orderRef.update({
                        status: 'payment_failed',
                        failedAt: admin.firestore.FieldValue.serverTimestamp(),
                        failureReason: pi.last_payment_error?.message || 'Payment failed'
                    });
                }
            } catch (e) {
                console.error("Error handling payment_failed:", e);
            }
        }
    }

    // ============================================================
    // HANDLER: payment_intent.canceled (PaymentIntent expiré ou annulé)
    // ============================================================
    if (event.type === 'payment_intent.canceled') {
        const pi = event.data.object;
        const orderId = pi.metadata?.orderId;
        console.warn(`⏰ Payment CANCELED for PI ${pi.id}, Order: ${orderId || 'N/A'}`);

        if (orderId) {
            try {
                const orderRef = db.collection('orders').doc(orderId);
                const orderSnap = await orderRef.get();

                if (!orderSnap.exists) return res.json({ received: true });
                const order = orderSnap.data();

                // Si le stock a été réservé à la création de la commande, le restaurer
                if (order.stockReserved && order.status !== 'paid') {
                    await db.runTransaction(async (transaction) => {
                        for (const item of (order.items || [])) {
                            const itemId = item.id || item.originalId;
                            const col = item.collectionName || item.collection || 'furniture';
                            if (!itemId) continue;

                            const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${col}/${itemId}`);
                            const itemDoc = await transaction.get(itemRef);
                            if (!itemDoc.exists) continue;

                            const currentStock = itemDoc.data().stock !== undefined ? Number(itemDoc.data().stock) : 0;
                            const qtyToRestore = item.quantity || 1;
                            const restoredStock = col === 'furniture' ? 1 : currentStock + qtyToRestore;
                            transaction.update(itemRef, {
                                stock: restoredStock,
                                sold: false,
                                soldAt: admin.firestore.FieldValue.delete(),
                                buyerId: admin.firestore.FieldValue.delete()
                            });
                        }
                        transaction.update(orderRef, {
                            status: 'canceled',
                            canceledAt: admin.firestore.FieldValue.serverTimestamp(),
                            stockReserved: false
                        });
                    });
                    console.log(`♻️ Stock restauré après annulation/expiration PI: ${orderId}`);
                } else {
                    await orderRef.update({
                        status: 'canceled',
                        canceledAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            } catch (e) {
                console.error("Error handling payment_intent.canceled:", e);
            }
        }
    }

    res.json({ received: true });
});
