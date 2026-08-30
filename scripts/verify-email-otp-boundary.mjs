import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const backend = read('functions/src/auth/emailOtp.js');
const createOrder = read('functions/src/commerce/createOrder.js');
const authPanel = read('src/components/auth/AuthPanel.jsx');
const emailOtpFlow = read('src/components/auth/EmailOtpFlow.jsx');
const loginView = read('src/pages/LoginView.jsx');
const checkout = read('src/pages/CheckoutView.jsx');
const cart = read('src/components/cart/CartSidebar.jsx');

const checks = [
  ['code cryptographiquement aléatoire', backend.includes('crypto.randomInt(100000, 1000000)')],
  ['code stocké sous HMAC', backend.includes("hmac('otp', email, code)")],
  ['comparaison constante', backend.includes('crypto.timingSafeEqual')],
  ['expiration dix minutes', backend.includes('10 * 60 * 1000')],
  ['limite de cinq essais', backend.includes('MAX_VERIFY_ATTEMPTS = 5')],
  ['App Check imposé sur les callables OTP', (backend.match(/enforceAppCheck: true/g) || []).length === 2],
  ['aucun mot de passe dans les écrans de connexion', !/type=["']password["']/.test(authPanel + loginView)],
  ['checkout exige l’identité email correspondante côté serveur', createOrder.includes('email_identity_mismatch')],
  ['checkout invité contient le flux OTP', checkout.includes('<EmailOtpFlow')],
  ['panier ne contient plus de portail auth forcé', !cart.includes('AuthPanel') && !cart.includes('onRequireAuth')],
  ['envoi OTP verrouillé contre les doubles requêtes', emailOtpFlow.includes('sendInFlight.current')],
  ['un HTTP 429 conserve l’écran de saisie du code', emailOtpFlow.includes("code.includes('http-429')") && emailOtpFlow.includes("Un code vient déjà d'être envoyé")],
];

let failed = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`);
  if (!ok) failed += 1;
}

if (failed > 0) process.exit(1);
console.log(`Email OTP boundary: ${checks.length}/${checks.length}`);
