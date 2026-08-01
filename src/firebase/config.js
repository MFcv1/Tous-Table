import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';
import { getAnalytics } from 'firebase/analytics';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';

// --- CONFIGURATION FIREBASE (Via Variables d'Environnement) ---
// Cette configuration est chargée dynamiquement depuis le fichier .env
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);

// ============================================================
// SÉCURITÉ: Firebase App Check (Anti-Bot / Anti-Script)
// Vérifie silencieusement que les requêtes viennent du vrai site.
// En mode développement (localhost), utilise un token debug.
// ============================================================
if (typeof window !== 'undefined') {
  // Active le mode debug pour localhost (npm run dev) avec un token fixe
  if (window.location.hostname === 'localhost') {
    window.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN || true;
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
    isTokenAutoRefreshEnabled: true // Renouvelle automatiquement le token
  });
}

const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'us-central1');
const analytics = getAnalytics(app);

// Nom logique pour isoler les données si besoin
const appId = import.meta.env.VITE_APP_LOGICAL_NAME || 'tat-made-in-normandie';

// --- PROVIDERS AUTHENTIFICATION ---
const googleProvider = new GoogleAuthProvider();

export { auth, db, storage, functions, analytics, appId, googleProvider };