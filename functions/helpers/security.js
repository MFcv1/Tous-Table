/**
 * HELPERS: Sécurité centralisée
 * Fonctions de vérification admin/super-admin réutilisables.
 */
const functions = require('firebase-functions/v1');

// ⚠️ CONFIGURER: Email du Super Admin
const SUPER_ADMIN_EMAIL = 'matthis.fradin2@gmail.com';

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/**
 * Vérifie que l'appelant est un Admin (Custom Claim ou Super Admin email)
 * @throws {HttpsError} si non-admin
 * @returns {{ isSuper: boolean }} info sur le statut
 */
function checkIsAdmin(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentification requise.');
    }
    const email = normalizeEmail(context.auth.token.email);
    const isAdminClaim = context.auth.token.admin === true;
    const isSuperEmail = email === SUPER_ADMIN_EMAIL;

    if (!isAdminClaim && !isSuperEmail) {
        throw new functions.https.HttpsError('permission-denied', 'Accès refusé : droits administrateur requis.');
    }
    return { isSuper: isSuperEmail };
}

/**
 * Vérifie que l'appelant est LE Super Admin
 * @throws {HttpsError} si non-super-admin
 */
function checkIsSuperAdmin(context) {
    if (!context.auth || normalizeEmail(context.auth.token.email) !== SUPER_ADMIN_EMAIL) {
        throw new functions.https.HttpsError('permission-denied', 'Accès refusé : Super Admin uniquement.');
    }
}

module.exports = { checkIsAdmin, checkIsSuperAdmin, SUPER_ADMIN_EMAIL, normalizeEmail };
