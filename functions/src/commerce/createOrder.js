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
const crypto = require('crypto');
const { STRIPE_SECRET_KEY, GMAIL_EMAIL, GMAIL_PASSWORD } = require('../../helpers/secrets');
const { APP_ID } = require('../../helpers/config');
const { invalidatePublicCatalogCache } = require('../public/catalog');
const {
    getInvoiceCounterRef,
    getNextInvoiceIdentity,
    writeInvoiceCounter,
} = require('./invoiceNumber');

const db = admin.firestore();
const Stripe = require('stripe');
const ALLOWED_STOCK_COLLECTIONS = new Set(['furniture', 'cutting_boards']);
const CARD_PAYMENTS_ENABLED = false;

const getAttemptId = (data) => {
    const value = typeof data?.attemptId === 'string' ? data.attemptId.trim() : '';
    return /^[a-zA-Z0-9-]{8,80}$/.test(value) ? value : 'missing';
};

const getUserFingerprint = (uid) => uid
    ? crypto.createHash('sha256').update(uid).digest('hex').slice(0, 12)
    : 'anonymous';

const getIdempotentOrderId = (uid, attemptId) => `checkout_${crypto
    .createHash('sha256')
    .update(`${uid}:${attemptId}`)
    .digest('hex')
    .slice(0, 40)}`;

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const validateShipping = (shipping) => {
    if (!shipping || typeof shipping !== 'object' || Array.isArray(shipping)) return ['shipping'];
    const missing = [];
    const requiredFields = ['fullName', 'email', 'phone', 'address', 'zip', 'city'];
    requiredFields.forEach(field => {
        if (typeof shipping[field] !== 'string' || !shipping[field].trim()) missing.push(field);
    });
    if (!shipping.billing || typeof shipping.billing !== 'object') {
        missing.push('billing');
    } else {
        ['name', 'address', 'zip', 'city'].forEach(field => {
            if (typeof shipping.billing[field] !== 'string' || !shipping.billing[field].trim()) {
                missing.push(`billing.${field}`);
            }
        });
    }
    if (shipping.clientType === 'entreprise') {
        ['companyName', 'firstName', 'lastName', 'siret'].forEach(field => {
            if (typeof shipping[field] !== 'string' || !shipping[field].trim()) missing.push(field);
        });
        if (String(shipping.siret || '').replace(/\D/g, '').length !== 14) missing.push('siret_format');
        if (normalizeEmail(String(shipping.billing?.name || '').replace(/\s+/g, ' '))
            !== normalizeEmail(String(shipping.companyName || '').replace(/\s+/g, ' '))) {
            missing.push('billing_company_mismatch');
        }
    }
    return [...new Set(missing)];
};

const buildItemRequests = (items) => items.map((sourceItem) => {
    const colName = sourceItem?.collectionName || 'furniture';
    const realItemId = sourceItem?.originalId || sourceItem?.id;
    const quantity = Number(sourceItem?.quantity || 1);
    if (!ALLOWED_STOCK_COLLECTIONS.has(colName)
        || typeof realItemId !== 'string'
        || !realItemId
        || realItemId.includes('/')
        || !Number.isInteger(quantity)
        || quantity < 1
        || quantity > 100) {
        throw new functions.https.HttpsError('invalid-argument', 'Article de commande invalide.');
    }
    return {
        sourceItem,
        colName,
        realItemId,
        quantity,
        itemRef: db.doc(`artifacts/${APP_ID}/public/data/${colName}/${realItemId}`)
    };
});

const getCatalogPrice = (itemData) => {
    const currentPrice = itemData?.currentPrice;
    const rawPrice = currentPrice !== undefined
        && currentPrice !== null
        && String(currentPrice).trim() !== ''
        ? currentPrice
        : itemData?.startingPrice;
    const price = Number(rawPrice ?? 0);
    if (!Number.isFinite(price) || price < 0) {
        throw new functions.https.HttpsError('failed-precondition', 'Prix catalogue invalide pour un article.');
    }
    return price;
};

const logCheckoutEvent = (level, event, details = {}) => {
    functions.logger[level]('checkout_order_event', {
        checkoutEvent: event,
        ...details
    });
};

exports.createOrder = functions.runWith({ secrets: [STRIPE_SECRET_KEY, GMAIL_EMAIL, GMAIL_PASSWORD] }).https.onCall(async (data, context) => {
    const attemptId = getAttemptId(data);
    const userFingerprint = getUserFingerprint(context.auth?.uid);
    const logContext = {
        attemptId,
        userFingerprint,
        paymentMethod: data?.orderData?.paymentMethod || 'missing',
        itemCount: Array.isArray(data?.orderData?.items) ? data.orderData.items.length : 0
    };

    if (!context.auth) {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'unauthenticated' });
        throw new functions.https.HttpsError('unauthenticated', 'Auth requise.');
    }

    // Sécurité: Email vérifié obligatoire
    if (!context.auth.token.email_verified) {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'email_unverified' });
        throw new functions.https.HttpsError('failed-precondition',
            'Veuillez vérifier votre email avant de passer commande. Consultez votre boîte de réception (ou spams).'
        );
    }

    const userId = context.auth.uid;
    const { orderData } = data || {};

    if (attemptId === 'missing') {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'invalid_attempt_id' });
        throw new functions.https.HttpsError('invalid-argument', 'Identifiant de tentative invalide.');
    }

    if (!orderData || !orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'invalid_order' });
        throw new functions.https.HttpsError('invalid-argument', 'Format de commande invalide.');
    }

    let itemRequests;
    try {
        itemRequests = buildItemRequests(orderData.items);
    } catch (error) {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'invalid_items' });
        throw error;
    }

    const invalidShippingFields = validateShipping(orderData.shipping);
    if (invalidShippingFields.length > 0) {
        logCheckoutEvent('warn', 'rejected', {
            ...logContext,
            reason: 'invalid_shipping',
            invalidFields: invalidShippingFields
        });
        throw new functions.https.HttpsError('invalid-argument', 'Informations de livraison ou de facturation incomplètes.');
    }

    const authenticatedEmail = normalizeEmail(context.auth.token.email);
    const checkoutEmail = normalizeEmail(orderData.shipping.email);
    if (!authenticatedEmail || checkoutEmail !== authenticatedEmail) {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'email_identity_mismatch' });
        throw new functions.https.HttpsError(
            'failed-precondition',
            'Validez le code envoyé à l’adresse email utilisée pour cette commande.'
        );
    }

    // 2. Paiement Différé (Manuel: Virement/Chèque)
    if (orderData.paymentMethod === 'manual' || orderData.paymentMethod === 'deferred') {
        const orderRef = db.collection('orders').doc(getIdempotentOrderId(userId, attemptId));
        const invoiceDate = new Date();
        const invoiceCounter = getInvoiceCounterRef(db, invoiceDate);
        try {
            const transactionOutcome = await db.runTransaction(async (transaction) => {
                const existingOrderSnap = await transaction.get(orderRef);
                if (existingOrderSnap.exists) {
                    const existingOrder = existingOrderSnap.data();
                    if (existingOrder.userId !== userId || existingOrder.checkoutAttemptId !== attemptId) {
                        throw new functions.https.HttpsError('already-exists', 'Conflit de tentative de commande.');
                    }
                    return { replayed: true, invoiceNumber: existingOrder.invoiceNumber || null };
                }

                const stockTrackerManual = {};
                const serverItems = [];
                let txTotal = 0;
                // Firestore impose toutes les lectures avant la première écriture.
                const [itemDocs, cartSnapshot, invoiceCounterSnap] = await Promise.all([
                    Promise.all(itemRequests.map(({ itemRef }) => transaction.get(itemRef))),
                    transaction.get(db.collection('users').doc(userId).collection('cart')),
                    transaction.get(invoiceCounter.ref),
                ]);
                const invoiceIdentity = getNextInvoiceIdentity(invoiceCounterSnap, invoiceCounter.series);
                const submittedQuantityByProduct = new Map();
                itemRequests.forEach(({ colName, realItemId, quantity }) => {
                    const productKey = `${colName}:${realItemId}`;
                    submittedQuantityByProduct.set(
                        productKey,
                        (submittedQuantityByProduct.get(productKey) || 0) + quantity
                    );
                });
                const cartDocsByProduct = new Map();
                cartSnapshot.docs.forEach((cartDoc) => {
                    const cartData = cartDoc.data();
                    const collectionName = cartData.collectionName || 'furniture';
                    const productId = cartData.originalId || cartData.id;
                    if (!productId) return;
                    const productKey = `${collectionName}:${productId}`;
                    const entries = cartDocsByProduct.get(productKey) || [];
                    entries.push({ ref: cartDoc.ref, data: cartData });
                    cartDocsByProduct.set(productKey, entries);
                });

                for (let index = 0; index < itemRequests.length; index += 1) {
                    const { sourceItem, colName, realItemId, quantity: qtyToReserve, itemRef } = itemRequests[index];
                    const itemDoc = itemDocs[index];
                    if (!itemDoc.exists) {
                        throw new functions.https.HttpsError('not-found', 'Un article de la commande est introuvable.');
                    }
                    const itemDb = itemDoc.data();

                    const currentStock = itemDb.stock !== undefined ? Number(itemDb.stock) : 1;
                    const stockKey = `${colName}/${realItemId}`;
                    const alreadyTaken = stockTrackerManual[stockKey] || 0;
                    const isUniqueFurniture = colName === 'furniture';
                    const availableStock = isUniqueFurniture
                        ? (alreadyTaken > 0 ? 0 : currentStock)
                        : currentStock - alreadyTaken;

                    if (availableStock < qtyToReserve || itemDb.sold) {
                        throw new functions.https.HttpsError('failed-precondition', `Article indisponible (Stock épuisé): ${itemDb.name}`);
                    }

                    const newStock = isUniqueFurniture ? 0 : Math.max(0, currentStock - qtyToReserve - alreadyTaken);
                    const realPrice = getCatalogPrice(itemDb);

                    txTotal += realPrice * qtyToReserve;
                    serverItems.push({
                        id: realItemId,
                        originalId: realItemId,
                        collectionName: colName,
                        name: itemDb.name,
                        price: realPrice,
                        quantity: qtyToReserve,
                        image: sourceItem.image || (itemDb.images && itemDb.images.length > 0 ? itemDb.images[0] : (itemDb.imageUrl || null))
                    });

                    const updates = { stock: newStock, buyerId: userId, updatedAt: admin.firestore.FieldValue.serverTimestamp() };
                    if (isUniqueFurniture || newStock === 0) {
                        updates.sold = true;
                        updates.soldAt = admin.firestore.FieldValue.serverTimestamp();
                    }

                    transaction.update(itemRef, updates);
                    stockTrackerManual[stockKey] = alreadyTaken + qtyToReserve;
                }

                // Retirer uniquement les quantités présentes dans cette
                // commande. Une quantité ajoutée dans un autre onglet pendant
                // la requête reste dans le panier.
                submittedQuantityByProduct.forEach((submittedQuantity, productKey) => {
                    let quantityToRemove = submittedQuantity;
                    const matchingDocs = cartDocsByProduct.get(productKey) || [];
                    matchingDocs.forEach(({ ref, data }) => {
                        if (quantityToRemove <= 0) return;
                        const currentQuantity = Math.max(1, Number(data.quantity) || 1);
                        const removedQuantity = Math.min(currentQuantity, quantityToRemove);
                        const remainingQuantity = currentQuantity - removedQuantity;
                        quantityToRemove -= removedQuantity;
                        if (remainingQuantity > 0) {
                            transaction.update(ref, { quantity: remainingQuantity });
                        } else {
                            transaction.delete(ref);
                        }
                    });
                });
                writeInvoiceCounter(transaction, invoiceCounter.ref, invoiceIdentity, admin);
                transaction.set(orderRef, {
                    items: serverItems,
                    userId: userId,
                    userEmail: context.auth.token.email || orderData.shipping?.email,
                    shipping: orderData.shipping,
                    paymentMethod: 'deferred',
                    total: txTotal,
                    status: 'pending_payment',
                    // Stock déjà décrémenté atomiquement (pièces uniques / planches).
                    stockReserved: true,
                    checkoutAttemptId: attemptId,
                    ...invoiceIdentity,
                    invoiceIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    stripeSessionId: null
                });
                return { replayed: false, invoiceNumber: invoiceIdentity.invoiceNumber };
            });

            invalidatePublicCatalogCache();
            logCheckoutEvent('info', transactionOutcome.replayed ? 'replayed' : 'created', {
                ...logContext,
                orderId: orderRef.id,
                status: 'pending_payment'
            });
            return { success: true, orderId: orderRef.id, invoiceNumber: transactionOutcome.invoiceNumber || null };
        } catch (e) {
            const isKnownError = e instanceof functions.https.HttpsError;
            logCheckoutEvent(isKnownError ? 'warn' : 'error', 'failed', {
                ...logContext,
                reason: isKnownError ? e.code : 'manual_order_internal',
                orderId: orderRef.id
            });
            if (isKnownError) throw e;
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
    if (orderData.paymentMethod === 'stripe_elements' && !CARD_PAYMENTS_ENABLED) {
        logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'card_payments_disabled' });
        throw new functions.https.HttpsError(
            'failed-precondition',
            'Le paiement par carte est désactivé. Utilisez le virement bancaire.'
        );
    }

    if (orderData.paymentMethod === 'stripe_elements') {
        // Branche historique inactive dans le parcours client actuel. L'initialisation
        // reste locale à cette branche afin que le virement ne dépende jamais de Stripe.
        const stripe = Stripe(STRIPE_SECRET_KEY.value());
        const orderRef = db.collection('orders').doc(getIdempotentOrderId(userId, attemptId));
        const invoiceDate = new Date();
        const invoiceCounter = getInvoiceCounterRef(db, invoiceDate);

        // Transaction unique : valider stock + calculer prix serveur + réserver stock + créer commande
        // Remplace l'ancienne double-transaction (validation puis réservation) par une seule opération atomique
        let serverTotalAmount = 0;
        try {
            await db.runTransaction(async (transaction) => {
                const stockTracker = {};
                let txTotal = 0;
                const serverItems = [];
                const [itemDocs, invoiceCounterSnap] = await Promise.all([
                    Promise.all(itemRequests.map(({ itemRef }) => transaction.get(itemRef))),
                    transaction.get(invoiceCounter.ref),
                ]);
                const invoiceIdentity = getNextInvoiceIdentity(invoiceCounterSnap, invoiceCounter.series);

                for (let index = 0; index < itemRequests.length; index += 1) {
                    const itemRequest = itemRequests[index];
                    const {
                        sourceItem: item,
                        colName,
                        realItemId,
                        quantity: qtyToReserve,
                        itemRef
                    } = itemRequest;
                    const itemDoc = itemDocs[index];

                    if (!itemDoc.exists) throw new functions.https.HttpsError('not-found', `Produit "${realItemId}" introuvable.`);

                    const itemDb = itemDoc.data();
                    const stockKey = `${colName}:${realItemId}`;
                    const alreadyTaken = stockTracker[stockKey] || 0;
                    const currentStock = itemDb.stock !== undefined ? Number(itemDb.stock) : 1;
                    const isUniqueFurniture = colName === 'furniture';
                    const availableStock = isUniqueFurniture
                        ? (alreadyTaken > 0 ? 0 : currentStock)
                        : currentStock - alreadyTaken;

                    if (availableStock < qtyToReserve || itemDb.sold) {
                        throw new functions.https.HttpsError('failed-precondition', `Article indisponible (Stock épuisé): ${itemDb.name}`);
                    }

                    // Prix recalculé côté serveur (jamais confiance au client)
                    const realPrice = getCatalogPrice(itemDb);
                    txTotal += realPrice * qtyToReserve;

                    serverItems.push({
                        id: realItemId,
                        collectionName: colName,
                        name: itemDb.name,
                        price: realPrice,
                        quantity: qtyToReserve,
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
                    stockTracker[stockKey] = alreadyTaken + qtyToReserve;
                }

                serverTotalAmount = txTotal;

                writeInvoiceCounter(transaction, invoiceCounter.ref, invoiceIdentity, admin);
                transaction.set(orderRef, {
                    userId: userId,
                    userEmail: context.auth.token.email || orderData.shipping?.email,
                    items: serverItems,
                    shipping: orderData.shipping || {},
                    total: txTotal,
                    paymentMethod: 'stripe_elements',
                    status: 'pending_payment',
                    stockReserved: true,
                    ...invoiceIdentity,
                    invoiceIssuedAt: admin.firestore.FieldValue.serverTimestamp(),
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

            // Stock réservé : invalider le cache catalogue pour les cold loads.
            invalidatePublicCatalogCache();
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
                const restoreByProduct = new Map();
                itemRequests.forEach(({ colName, realItemId, quantity }) => {
                    const stockKey = `${colName}:${realItemId}`;
                    const existing = restoreByProduct.get(stockKey);
                    restoreByProduct.set(stockKey, {
                        colName,
                        realItemId,
                        quantity: (existing?.quantity || 0) + quantity,
                        itemRef: db.doc(`artifacts/${APP_ID}/public/data/${colName}/${realItemId}`)
                    });
                });
                const restoreRequests = [...restoreByProduct.values()];
                await db.runTransaction(async (transaction) => {
                    const itemDocs = await Promise.all(
                        restoreRequests.map(({ itemRef }) => transaction.get(itemRef))
                    );
                    restoreRequests.forEach(({ quantity, itemRef }, index) => {
                        const itemDoc = itemDocs[index];
                        if (!itemDoc.exists) return;
                        const currentStock = itemDoc.data().stock !== undefined ? Number(itemDoc.data().stock) : 0;
                        transaction.update(itemRef, {
                            stock: currentStock + quantity,
                            sold: false,
                            soldAt: admin.firestore.FieldValue.delete(),
                            buyerId: admin.firestore.FieldValue.delete(),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    transaction.delete(orderRef);
                });
                invalidatePublicCatalogCache();
            } catch (restoreError) {
                console.error("CRITICAL: Stock restore failed after PI error:", restoreError);
            }
            throw new functions.https.HttpsError('internal', "Erreur initialisation paiement sécurisé.");
        }
    }

    // Fallback: méthode de paiement non reconnue
    logCheckoutEvent('warn', 'rejected', { ...logContext, reason: 'unsupported_payment_method' });
    throw new functions.https.HttpsError('invalid-argument', 'Méthode de paiement non supportée.');
});
