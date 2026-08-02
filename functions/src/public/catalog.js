const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { APP_ID } = require('../../helpers/config');

const db = admin.firestore();
const ALLOWED_ORIGINS = new Set([
    'https://tousatable-madeinnormandie.fr',
    'https://www.tousatable-madeinnormandie.fr',
    'https://tousatable-client.web.app',
    'https://tousatable-client.firebaseapp.com',
    'https://sandboxtat.web.app',
    'https://sandboxtat.firebaseapp.com',
    // legacy old sandbox host (keep until fully retired)
    'https://tatmadeinnormandie.web.app',
    'https://tatmadeinnormandie.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:3000',
]);

const PUBLIC_COLLECTIONS = [
    'furniture',
    'cutting_boards',
    'affiliate_products',
    'shop_tutorials',
];

const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedCatalog = null;
let cachedAt = 0;
let inflightCatalogRead = null;
/** Incrémenté à chaque invalidation pour ne pas re-cacher une lecture concurrente stale. */
let cacheEpoch = 0;

/**
 * Invalide le cache mémoire publicCatalog (best-effort multi-instance).
 * À appeler après toute mutation stock catalogue (createOrder, cancel, etc.).
 */
const invalidatePublicCatalogCache = () => {
    cacheEpoch += 1;
    cachedCatalog = null;
    cachedAt = 0;
    inflightCatalogRead = null;
};

const serializeValue = (value) => {
    if (!value) return value;
    if (value instanceof admin.firestore.Timestamp) {
        return {
            seconds: value.seconds,
            nanoseconds: value.nanoseconds,
        };
    }
    if (Array.isArray(value)) return value.map(serializeValue);
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, nested]) => [key, serializeValue(nested)])
        );
    }
    return value;
};

const readPublicCollection = async (collectionName) => {
    const snap = await db
        .collection('artifacts')
        .doc(APP_ID)
        .collection('public')
        .doc('data')
        .collection(collectionName)
        .get();

    return snap.docs.map((doc) => ({
        id: doc.id,
        collectionName,
        ...serializeValue(doc.data()),
    }));
};

const readPublicCatalog = async () => {
    const now = Date.now();
    if (cachedCatalog && now - cachedAt < CACHE_TTL_MS) {
        return cachedCatalog;
    }

    const epochAtStart = cacheEpoch;

    if (!inflightCatalogRead) {
        inflightCatalogRead = Promise.all(
            PUBLIC_COLLECTIONS.map(async (collectionName) => [
                collectionName,
                await readPublicCollection(collectionName),
            ])
        )
            .then((entries) => {
                const payload = {
                    appId: APP_ID,
                    generatedAt: new Date().toISOString(),
                    collections: Object.fromEntries(entries),
                };
                // Ne publier le cache que si aucune invalidation n'est intervenue pendant la lecture.
                if (epochAtStart === cacheEpoch) {
                    cachedCatalog = payload;
                    cachedAt = Date.now();
                }
                return payload;
            })
            .finally(() => {
                inflightCatalogRead = null;
            });
    }

    return inflightCatalogRead;
};

exports.invalidatePublicCatalogCache = invalidatePublicCatalogCache;

exports.publicCatalog = functions.https.onRequest(async (req, res) => {
    const origin = req.get('origin');
    if (ALLOWED_ORIGINS.has(origin)) {
        res.set('Access-Control-Allow-Origin', origin);
        res.set('Vary', 'Origin');
    }
    res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    // TTL modéré : cold load plus frais ; le live gallery|detail couvre le temps réel.
    res.set('Cache-Control', 'public, max-age=60, s-maxage=120, stale-while-revalidate=60');

    if (req.method === 'OPTIONS') {
        res.status(204).send('');
        return;
    }

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        res.status(200).json(await readPublicCatalog());
    } catch (error) {
        console.error('Public catalog fallback failed:', error);
        res.status(500).json({ error: 'catalog_unavailable' });
    }
});
