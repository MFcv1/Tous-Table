/**
 * HELPERS: Firebase Secrets (centralisé)
 * Tous les secrets sont définis ici et importés par les modules qui en ont besoin.
 */
const { defineSecret } = require('firebase-functions/params');

const GMAIL_EMAIL = defineSecret('GMAIL_EMAIL');
const GMAIL_PASSWORD = defineSecret('GMAIL_PASSWORD');
const OTP_HMAC_SECRET = defineSecret('OTP_HMAC_SECRET');
const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WH_SECRET = defineSecret('STRIPE_WH_SECRET');

module.exports = { GMAIL_EMAIL, GMAIL_PASSWORD, OTP_HMAC_SECRET, STRIPE_SECRET_KEY, STRIPE_WH_SECRET };
