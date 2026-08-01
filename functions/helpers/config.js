/**
 * HELPERS: Configuration centralisée multi-env (prod + sandbox)
 *
 * APP_ID = nœud Firestore artifacts/{APP_ID}/...
 *  - prod projet tousatable-client → tat-made-in-normandie
 *  - sandbox projet sandboxtat     → sandboxtat
 *
 * Ne jamais logger de secrets ici.
 */
function getProjectId(host) {
    if (process.env.GCLOUD_PROJECT) return process.env.GCLOUD_PROJECT;
    if (process.env.GCP_PROJECT) return process.env.GCP_PROJECT;

    try {
        const firebaseConfig = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
        if (firebaseConfig.projectId) return firebaseConfig.projectId;
    } catch {
        // ignore
    }

    const match = String(host || '').match(/us-central1-([^.]+)\.cloudfunctions\.net/i);
    return match?.[1] || '';
}

/**
 * Logical catalog root under artifacts/{id}
 * Override: process.env.APP_LOGICAL_NAME
 */
function resolveAppId(host) {
    if (process.env.APP_LOGICAL_NAME) return process.env.APP_LOGICAL_NAME;

    const projectId = getProjectId(host);
    const byProject = {
        'tousatable-client': 'tat-made-in-normandie',
        sandboxtat: 'sandboxtat',
        // Ancienne sandbox Firebase (legacy) — data souvent encore sous tat-made-in-normandie
        tatmadeinnormandie: 'tat-made-in-normandie',
    };

    if (projectId && byProject[projectId]) return byProject[projectId];

    // Fallback prod path (comportement historique si project id inconnu)
    return 'tat-made-in-normandie';
}

// Évalué au cold start de la Function (GCLOUD_PROJECT dispo en Cloud Functions)
const APP_ID = resolveAppId();

const PRODUCT_COLLECTIONS = ['furniture', 'cutting_boards'];

function getSiteUrl(host) {
    const projectId = getProjectId(host);
    const urlMap = {
        'tousatable-client': 'https://tousatable-madeinnormandie.fr',
        sandboxtat: 'https://sandboxtat.web.app',
        tatmadeinnormandie: 'https://tatmadeinnormandie.web.app',
    };
    return urlMap[projectId] || 'https://tousatable-madeinnormandie.fr';
}

module.exports = {
    APP_ID,
    PRODUCT_COLLECTIONS,
    getSiteUrl,
    getProjectId,
    resolveAppId,
};
