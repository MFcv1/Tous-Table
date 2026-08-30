import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.prod');

const expected = {
  VITE_FIREBASE_PROJECT_ID: 'tousatable-client',
  VITE_FIREBASE_AUTH_DOMAIN: 'tousatable-client.firebaseapp.com',
  VITE_FIREBASE_STORAGE_BUCKET: 'tousatable-client.firebasestorage.app',
  VITE_FIREBASE_MESSAGING_SENDER_ID: '1047064824334',
  VITE_FIREBASE_APP_ID: '1:1047064824334:web:6d0d281e31845ad0814a5f',
  VITE_FIREBASE_MEASUREMENT_ID: 'G-EK03HLLLWL',
  VITE_RECAPTCHA_ENTERPRISE: 'true',
  VITE_APP_LOGICAL_NAME: 'tat-made-in-normandie',
  VITE_SUPER_ADMIN_EMAIL: 'matthis.fradin2@gmail.com',
};

const required = [
  'VITE_FIREBASE_API_KEY',
  'VITE_RECAPTCHA_SITE_KEY',
  'VITE_STRIPE_CARD_PAYMENTS_ENABLED',
  ...Object.keys(expected),
];

function parseEnv(content) {
  return content.split(/\r?\n/).reduce((acc, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return acc;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) return acc;

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    acc[key] = value.replace(/^['"]|['"]$/g, '');
    return acc;
  }, {});
}

function fail(errors) {
  console.error('Config prod invalide:');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

if (!fs.existsSync(envPath)) {
  fail(['.env.prod est absent']);
}

const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
const errors = [];

for (const key of required) {
  if (!env[key]) {
    errors.push(`${key} est manquant`);
  }
}

for (const [key, value] of Object.entries(expected)) {
  if (env[key] && env[key] !== value) {
    errors.push(`${key} ne correspond pas a la cible prod attendue`);
  }
}

const cardPaymentsEnabled = env.VITE_STRIPE_CARD_PAYMENTS_ENABLED !== 'false';

if (cardPaymentsEnabled && !env.VITE_STRIPE_PUBLIC_KEY?.startsWith('pk_live_')) {
  errors.push('VITE_STRIPE_PUBLIC_KEY doit etre une cle publishable Stripe live');
}

if (!cardPaymentsEnabled && env.VITE_STRIPE_PUBLIC_KEY && !env.VITE_STRIPE_PUBLIC_KEY.startsWith('__') && !env.VITE_STRIPE_PUBLIC_KEY.startsWith('pk_')) {
  errors.push('VITE_STRIPE_PUBLIC_KEY doit etre vide, un placeholder, ou une cle publishable Stripe');
}

if (env.VITE_FIREBASE_API_KEY?.startsWith('__') || env.VITE_RECAPTCHA_SITE_KEY?.startsWith('__')) {
  errors.push('Les valeurs Firebase/App Check ne doivent pas etre des placeholders');
}

if (env.VITE_APPCHECK_DEBUG_TOKEN) {
  errors.push('VITE_APPCHECK_DEBUG_TOKEN doit rester vide en production');
}

if (errors.length > 0) {
  fail(errors);
}

console.log(cardPaymentsEnabled
  ? 'Config prod OK: Firebase prod, namespace prod et Stripe live valides.'
  : 'Config prod OK: Firebase prod, namespace prod et paiements carte desactives.');
