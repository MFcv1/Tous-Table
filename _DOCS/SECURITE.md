# 🛡️ AUDIT DE SÉCURITÉ COMPLET — Tous à Table
## Date : 18 Février 2026 (23:30) | Score Final : **9.8 / 10** 🏆

> Ce document est la référence absolue de l'état de sécurité du site.
> Il couvre **toutes les couches** : Infrastructure, Backend, Frontend, Base de Données, Authentification et Paiement.

---

## 📋 TABLE DES MATIÈRES

1. [Backdoor & Failles Critiques](#1--backdoor--failles-critiques)
2. [Headers de Sécurité HTTP](#2--headers-de-sécurité-http-firebasejson)
3. [App Check (Anti-Bot)](#3--app-check-recaptcha-v3)
4. [Sanitization XSS (Frontend)](#4--sanitization-xss-frontend)
5. [Sanitization XSS (Backend)](#5--sanitization-xss-backend)
6. [Rate Limiting (Anti-Spam)](#6--rate-limiting-anti-spam)
7. [Règles Firestore](#7--règles-firestore)
8. [Règles Storage](#8--règles-storage)
9. [Authentification & Autorisation](#9--authentification--autorisation)
10. [Paiement Stripe](#10--paiement-stripe)
11. [Gestion des Secrets & .gitignore](#11--gestion-des-secrets--gitignore)
12. [Synchronisation des Environnements](#12--synchronisation-des-environnements)
13. [Anomalies Détectées & Recommandations](#13--anomalies-détectées--recommandations)

---

## 1. 🔴 BACKDOOR & FAILLES CRITIQUES

### Backdoor `initSuperAdmin`
| Critère | Résultat |
|---|---|
| Présent dans `functions/index.js` ? | ❌ **SUPPRIMÉ** ✅ |
| Recherche `initSuperAdmin` dans tout le codebase | **0 résultats** ✅ |
| **Verdict** | **ÉLIMINÉ DÉFINITIVEMENT** 🔒 |

**Détail** : Cette fonction permettait à n'importe qui connaissant un secret textuel de se promouvoir administrateur via un simple appel HTTP. Elle a été supprimée du code source et n'est plus déployée sur aucun environnement.

**Alternative sécurisée en place** : La gestion admin passe désormais par :
- Un trigger Cloud Function `grantAdminOnAuth` qui vérifie une whitelist Firestore à la création de compte.
- La fonction `addAdminUser` / `removeAdminUser` accessible uniquement aux admins existants.
- Des Custom Claims Firebase (`admin: true`) vérifiés côté serveur.

### Fonctions Dangereuses Frontend
| Recherche | Résultat |
|---|---|
| `eval()` dans `src/` | **0 résultats** ✅ |
| `innerHTML` direct (non-React) dans `src/` | **0 résultats** ✅ |
| `dangerouslySetInnerHTML` non protégé | **0 résultats** ✅ (Tous enveloppés par `sanitizeHtml`) |

---

## 2. 🛡️ HEADERS DE SÉCURITÉ HTTP (`firebase.json`)

Tous les headers sont déployés via `firebase.json` → `hosting.headers` sur le pattern `**` (toutes les pages).

| Header | Valeur | Rôle | État |
|---|---|---|---|
| `X-Content-Type-Options` | `nosniff` | Empêche le navigateur de "deviner" le type MIME → Bloque l'exécution de scripts déguisés en images | ✅ Actif |
| `X-Frame-Options` | `DENY` | Empêche le site d'être intégré dans une `<iframe>` externe → Protection anti-clickjacking | ✅ Actif |
| `X-XSS-Protection` | `1; mode=block` | Active le filtre XSS natif du navigateur (legacy, mais utile pour les anciens navigateurs) | ✅ Actif |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Contrôle quelles informations d'URL sont envoyées aux sites tiers | ✅ Actif |
| `Content-Security-Policy` | Complet (voir détail) | **BOUCLIER PRINCIPAL** : Empêche le chargement de toute ressource non autorisée | ✅ Actif |

### Détail CSP (Content Security Policy) :

| Directive | Domaines autorisés | Justification |
|---|---|---|
| `default-src` | `'self'` | Tout ce qui n'est pas listé est **bloqué** |
| `script-src` | `'self' 'unsafe-inline'` + Google, Stripe | Scripts du site + reCAPTCHA + Paiement |
| `style-src` | `'self' 'unsafe-inline'` + Google Fonts | Styles du site + Polices |
| `img-src` | `'self'` + Firebase Storage, Unsplash, Google, Stripe, TransparentTextures + `data:` `blob:` | Photos meubles, textures de fond, icônes Google login |
| `font-src` | `'self'` + `fonts.gstatic.com` | Polices Serif/Sans-Serif du design |
| `connect-src` | `'self'` + `*.googleapis.com`, `*.firebaseio.com`, `cloudfunctions.net` (Prod & Sandbox), Analytics, Stripe, App Check | Toutes les API Firebase, Stripe et Analytics |
| `frame-src` | Google Auth, Stripe Checkout, Firebase Auth Handler | Popups de connexion Google + Tunnel de paiement Stripe |

### Cache Policy :
| Ressource | Politique | Durée |
|---|---|---|
| `/assets/**` (JS/CSS/Images build) | `public, immutable` | **1 an** (les noms de fichiers contiennent un hash) |
| `/**/*.html` | `must-revalidate` | **0 secondes** (toujours vérifier la dernière version) |

---

## 3. 👻 APP CHECK (reCAPTCHA v3)

### Configuration Frontend (`src/firebase/config.js`)
| Critère | Résultat | Ligne |
|---|---|---|
| Import `initializeAppCheck` | ✅ Présent | 7 |
| Import `ReCaptchaV3Provider` | ✅ Présent | 7 |
| Provider configuré | ✅ `ReCaptchaV3Provider('6Lc7OXAs...')` | 35 |
| `isTokenAutoRefreshEnabled` | ✅ `true` | 36 |
| Debug Token pour `localhost` | ✅ `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` | 31 |
| Guard `typeof window !== 'undefined'` | ✅ Protège contre l'exécution SSR | 28 |

### Enforcement (Console Firebase)
| Service | Sandbox 🧪 | Production 🌍 |
|---|---|---|
| **Cloud Firestore** | ✅ **Appliqué** (Enforcement) | ✅ **Appliqué** (Enforcement) |
| **Authentication** | ✅ **Appliqué** (Enforcement) | ✅ **Appliqué** (Enforcement) |
| **Storage** | ⚪ Non appliqué | ⚪ Non appliqué |

**Note Strategique** : Sandbox et production appliquent désormais le même enforcement
Firestore/Auth afin que la recette révèle les blocages App Check avant le déploiement.
Le développement localhost continue de fonctionner avec le token debug enregistré dans
la sandbox ; aucune valeur de token n'est documentée ni versionnée.

**Métriques Production au moment de l'activation** :
- 82% requêtes Firestore validées
- 18% "clients obsolètes" (anciens caches avant App Check)
- **0% origine inconnue** (Aucun bot)
- **0% requêtes non valides** (Aucune attaque)

---

## 4. 🩹 SANITIZATION XSS (FRONTEND)

### Helper `sanitizeHtml` (`HomeView.jsx` ligne 20, `Footer.jsx` ligne 7)
**Logique** : Supprime toutes les balises HTML SAUF `<br>` et `<br />`. Convertit tout le reste en texte pur.

| Fichier | Usage | Ligne | État |
|---|---|---|---|
| `HomeView.jsx` | `manifesto_1_text` (titre Firestore) | 971 | ✅ Protégé |
| `HomeView.jsx` | `manifesto_2_text` (titre Firestore) | 992 | ✅ Protégé |
| `HomeView.jsx` | `manifesto_3_text` (titre Firestore) | 1013 | ✅ Protégé |
| `Footer.jsx` | `footerTitle` (titre Firestore) | 45 | ✅ Protégé |

**Scénario bloqué** : Si un admin malveillant injecte `<script>alert('hack')</script>` dans Firestore, le sanitizer le convertit en texte brut inoffensif.

---

## 5. 🩹 SANITIZATION XSS (BACKEND)

### Fonction `shareMeta` (`functions/index.js` ligne 683)
| Protection | Détail | Ligne |
|---|---|---|
| **Regex productId** | `rawProductId.replace(/[^a-zA-Z0-9_-]/g, '')` | 687 |
| **escapeHtml()** | Échappe `&`, `<`, `>`, `"` dans title, desc, img | 701-709 |

**Scénario bloqué** : Un attaquant qui appelle `shareMeta?product=<script>alert(1)</script>` → Le regex supprime tous les caractères spéciaux → Le script n'est jamais injecté dans le HTML.

### Fonction `sendTestEmail` (`functions/index.js` ligne 889)
| Protection | Détail | Ligne |
|---|---|---|
| **Pas de fuite système** | `debugInfo` ne contient plus `process.cwd()` ni les chemins serveur | 897-900 |

---

## 6. 🚦 RATE LIMITING (ANTI-SPAM)

| Fonction | Limite | Mécanisme | Ligne |
|---|---|---|---|
| `placeBid` | **5 enchères / minute** / utilisateur | Collection `sys_ratelimit` + vérification timestamp | 172-196 |
| `logUserConnection` | **1 appel / 10 minutes** / utilisateur | Collection `sys_ratelimit` + vérification timestamp | 1004-1017 |

| Collection système | Accès client (Rules) | État |
|---|---|---|
| `sys_ratelimit` | `allow read, write: if false` | ✅ **Verrouillé** (ligne 104-106 de `firestore.rules`) |
| `sys_idempotency` | `allow read, write: if false` | ✅ **Verrouillé** (ligne 108-110 de `firestore.rules`) |

**Scénario bloqué** : Un script qui tente de placer 100 enchères en 1 minute → Les 5 premières passent, les 95 suivantes sont silencieusement ignorées.

---

## 7. 🔐 RÈGLES FIRESTORE (`firestore.rules`)

### Helpers de Sécurité
| Fonction | Logique |
|---|---|
| `isArtisan()` | Vérifie `email == matthis.fradin2@gmail.com` OU `token.admin == true` |
| `isOwner(userId)` | Vérifie `request.auth.uid == userId` |
| `isValidProduct()` | Validation de schéma : nom (string < 140), description (< 10000), prix (>= 0), images (list) |
| `isValidCartItem()` | Validation : max 10 clés, quantité > 0, prix >= 0 |

### Règles par Collection
| Collection | `read` | `create` | `update` | `delete` | Securité |
|---|---|---|---|---|---|
| `artifacts/.../public/data/{col}/{item}` | ✅ Public | Admin + Validation | Admin + Validation | Admin | ✅ Solide |
| `artifacts/.../bids/{bid}` | ✅ Public | ❌ **Cloud Function ONLY** | — | — | ✅ Blindé |
| `users/{uid}` | Owner ou Admin | Owner | Owner ou Admin | — | ✅ Isolé |
| `users/{uid}/cart/{item}` | Owner auth | Owner + Validation | Owner + Validation | Owner | ✅ Validé |
| `orders/{id}` | Admin OU Owner (`email_verified`) | ❌ **Cloud Function ONLY** | Admin | — | ✅ Critique |
| `sys_metadata/{docId}` | ✅ Public | Admin | Admin | — | ✅ OK (données UI) |
| `sys_ratelimit/{docId}` | ❌ **Bloqué** | ❌ **Bloqué** | ❌ **Bloqué** | — | ✅ Backend only |
| `sys_idempotency/{docId}` | ❌ **Bloqué** | ❌ **Bloqué** | ❌ **Bloqué** | — | ✅ Backend only |

---

## 8. 📦 RÈGLES STORAGE (`storage.rules`)

| Critère | Valeur | État |
|---|---|---|
| Lecture | `if true` (images publiques) | ✅ Nécessaire pour afficher les meubles |
| Écriture - Auth | `request.auth != null` | ✅ Bloqué pour les anonymes |
| Écriture - Admin | `email == matthis.fradin2@gmail.com` OU `admin == true` | ✅ Seuls les admins |
| Taille max | `< 10 Mo` par fichier | ✅ Protection anti-saturation |
| Type de fichier | `contentType.matches('image/.*')` | ✅ Uniquement des images (pas de .exe, .js, etc.) |

---

## 9. 🔑 AUTHENTIFICATION & AUTORISATION

### Backend (`functions/index.js`)
| Fonction | Vérification Auth | Niveau requis |
|---|---|---|
| `createOrder` | `context.auth` + `email_verified` | ✅ Utilisateur vérifié |
| `placeBid` | `context.auth` | ✅ Utilisateur connecté |
| `wakeUp` | Aucune (Warm-up inoffensif) | ⚪ Public |
| `resetAllStats` | `checkIsSuperAdmin` | ✅ Super Admin uniquement |
| `addAdminUser` | `checkIsAdmin` | ✅ Admin |
| `removeAdminUser` | `checkIsAdmin` + protection Super Admin | ✅ Admin (Super protégé) |
| `sendTestEmail` | `checkIsAdmin` | ✅ Admin |
| `logUserConnection` | `context.auth` + Rate Limit | ✅ Utilisateur + Anti-spam |
| `getUploadUrl` | `checkIsAdmin` | ✅ Admin |
| `shareMeta` | Aucune (SEO bot) | ⚪ Public (sanitisé) |
| `stripeWebhook` | Signature cryptographique Stripe | ✅ Stripe uniquement |

### Frontend (`AuthContext.jsx`)
| Critère | Détail | État |
|---|---|---|
| Connexion anonyme automatique | `signInAnonymously(auth)` si pas de user | ✅ Pour le panier |
| Détection Admin (Frontend) | Lecture `users/{uid}` pour `role: "admin"` | ✅ Sécurisé (Rules Firestore) |
| Fallback Super Admin | Email hardcodé `matthis.fradin2@gmail.com` | ✅ Filet de sécurité |
| Pas de secret dans le bundle | Config Firebase via `import.meta.env.VITE_*` | ✅ Variables d'environnement |

---

## 10. 💳 PAIEMENT STRIPE

| Critère | Détail | État |
|---|---|---|
| Clé secrète Stripe | `defineSecret('STRIPE_SECRET_KEY')` → Jamais dans le code source | ✅ |
| Secret Webhook | `defineSecret('STRIPE_WH_SECRET')` → Jamais dans le code source | ✅ |
| Vérification cryptographique | `stripe.webhooks.constructEvent(rawBody, sig, secret)` | ✅ (ligne 465) |
| Fallback non signé | **BLOQUÉ** → Retourne 500 si `STRIPE_WH_SECRET` manquant | ✅ (ligne 471-473) |
| Signature manquante | **BLOQUÉ** → Retourne 401 si `sig` manquant | ✅ (ligne 475-477) |
| Prix calculé côté serveur | `realPrice = itemDb.currentPrice` (jamais le prix du frontend) | ✅ (ligne 334) |
| Validation de stock | Transaction Firestore avant paiement | ✅ (lignes 308-365) |
| Email vérifié obligatoire | `context.auth.token.email_verified` requis pour `createOrder` | ✅ (ligne 282) |

**Scénario bloqué** : Un attaquant qui modifie le prix côté client → Le backend recalcule le prix réel depuis Firestore → L'attaquant paie le vrai prix.

---

## 11. 🔒 GESTION DES SECRETS & `.gitignore`

### Racine `.gitignore`
| Fichier protégé | État |
|---|---|
| `.env` | ✅ Ignoré |
| `.env.production` | ✅ Ignoré |
| `.env.local` | ✅ Ignoré |
| `service-account.json` | ✅ Ignoré |
| `*.json.key` | ✅ Ignoré |
| `credentials/` | ✅ Ignoré |
| `dist/` | ✅ Ignoré |
| `node_modules/` | ✅ Ignoré |
| `.firebase/` | ✅ Ignoré |

### ⚠️ `functions/.gitignore`
| Fichier protégé | État | Risque |
|---|---|---|
| `.env` dans `functions/` | ✅ **PROTÉGÉ** | **NUL** — Le fichier est désormais officiellement ignoré par Git. |

**Détail** : La ligne `.env` a été décommentée pour garantir que les variables d'environnement locales ne soient jamais poussées sur un dépôt (même privé).

---

## 12. 🌐 SYNCHRONISATION DES ENVIRONNEMENTS

| Critère | Sandbox 🧪 (`tatmadeinnormandie`) | Production 🌍 (`tousatable-client`) |
|---|---|---|
| CSP Header | ✅ Déployé | ✅ Déployé |
| App Check Frontend | ✅ Déployé | ✅ Déployé |
| App Check Enforcement (Firestore) | ✅ **Appliqué** | ✅ **Appliqué** |
| App Check Enforcement (Auth) | ✅ **Appliqué** | ✅ **Appliqué** |
| Firestore Rules | ✅ Déployé | ✅ Déployé |
| Storage Rules | ✅ Déployé | ✅ Déployé |
| Auth Anonyme | ✅ Activé | ✅ Activé |
| Backend Patches (XSS, Rate Limit) | ✅ Déployé | ✅ Déployé |
| Frontend XSS Fix | ✅ Déployé | ✅ Déployé |

---

## 13. ⚠️ ANOMALIES DÉTECTÉES & RECOMMANDATIONS

### ✅ Anomalie 1 : URL Sandbox hardcodée (CORRIGÉ)
**Détail** : Les URLs étaient codées en dur sur `tatmadeinnormandie.web.app`.
**Fix** : Implémentation d'un helper `getSiteUrl()` qui bascule dynamiquement :
- Si ProjectID = `tousatable-client` → `https://tousatable-madeinnormandie.fr`
- Sinon → `https://tatmadeinnormandie.web.app` (Sandbox)

### ✅ Anomalie 3 : `functions/.gitignore` (CORRIGÉ)
**Détail** : La ligne `.env` était commentée.
**Fix** : Ligne décommentée, protection active.

### 🟢 Anomalie 4 : Storage App Check non appliqué (Criticité : TRÈS FAIBLE)
**Détail** : App Check Enforcement n'est pas activé sur Firebase Storage.
**Impact** : Un bot pourrait théoriquement télécharger massivement les images publiques. Mais les Storage Rules bloquent déjà toute écriture non-admin.
**Recommandation** : Laisser en l'état pour éviter des problèmes de cache d'images.

### ✅ Retrait newsletter client/admin - 8 mai 2026
**Détail** : le popup newsletter public, le formulaire newsletter du footer et l'écran admin Newsletter ont été retirés du frontend.
**Rules** : `newsletter_subscribers/{docId}` est maintenant bloqué en lecture, création, modification et suppression côté client (`allow ...: if false`).
**Impact** : aucune nouvelle inscription newsletter ne peut être créée depuis le site ; les anciens documents restent protégés et ne sont plus exposés via l'admin.

---

## 🏆 VERDICT FINAL

| Catégorie | Score |
|---|---|
| Backdoor & Failles Critiques | **10/10** |
| Headers HTTP | **10/10** |
| App Check (Anti-Bot) | **10/10** |
| XSS Frontend | **10/10** |
| XSS Backend | **10/10** |
| Rate Limiting | **10/10** |
| Firestore Rules | **10/10** |
| Storage Rules | **9/10** (App Check non appliqué) |
| Auth & Autorisation | **10/10** |
| Paiement Stripe | **10/10** |
| Secrets & .gitignore | **10/10** (Correctif appliqué) |
| Synchronisation Env | **10/10** |
| **SCORE GLOBAL** | **9.8 / 10** 🏆 |

---

**Le site [tousatable-madeinnormandie.fr](https://tousatable-madeinnormandie.fr) est prêt pour le lancement client.**

Toutes les failles critiques sont corrigées. Les anomalies restantes sont de criticité faible et n'empêchent pas la mise en production.

---

*Audit réalisé le 18 Février 2026 à 23:20. Enforcement App Check activé sur les deux environnements.*
*Prochain audit recommandé : Après ajout de nouvelles fonctionnalités ou dans 3 mois.*

## Correctif local 2026-08-29 — opérations dangereuses réservées au développeur

Invariant retenu : seul le compte Firebase dont l'e-mail normalisé est
`matthis.fradin2@gmail.com` peut déclencher une suppression ou une purge système.
Un autre compte portant le custom claim `admin` conserve la gestion ordinaire du site,
mais pas les opérations irréversibles.

Changements locaux :

- `runGarbageCollector`, suppressions/purges analytics et gestion de la whitelist admin
  utilisent `checkIsSuperAdmin` côté Cloud Functions ;
- l'annulation destructrice admin d'une commande passe par
  `cancelAndDeleteOrderAdmin`, qui restaure les stocks et supprime la commande dans une
  transaction serveur unique ;
- les suppressions directes de `orders` et `affiliate_clicks` sont interdites par les
  règles Firestore ;
- les mises à jour admin de commandes sont limitées à `status` et
  `shippingReminderSnoozes`, avec une liste fermée de statuts opérationnels ;
- `sys_metadata/admin_users` n'est plus public et n'est modifiable côté client que par
  le compte développeur ; toute suppression de métadonnée système est également
  réservée à ce compte ;
- les boutons concernés sont absents de l'interface du compte client admin ; les
  changements de statut, exports, lectures analytics et CRUD catalogue restent
  disponibles.

Vérifications locales :

```bash
node --test functions/helpers/security.test.js
node scripts/verify-dangerous-admin-boundary.mjs
npm run verify:functions-syntax
npm run verify:analytics-reliability
npm run build
```

Résultat : tests d'autorisation 5/5, vérificateur de frontière 15/15, syntaxe Functions,
analytics et build réussis. Le build conserve seulement les avertissements historiques
CSS/assets/chunks.

État : **déployé uniquement sur `sandboxtat`** avec les règles, Functions concernées et
le frontend coordonnés. Les parcours OTP/Google et commande virement ont été validés ;
aucune opération destructive n'a été déclenchée en recette. L'audit sécurité du patch a
fermé 32/32 fichiers sans finding. Aucun changement n'a été déployé en production.

Pour l'OTP, chaque service account App Engine possède
`roles/iam.serviceAccountTokenCreator` uniquement sur lui-même :
`sandboxtat@appspot.gserviceaccount.com` en sandbox et
`tousatable-client@appspot.gserviceaccount.com` en production. Cette délégation minimale
permet de signer le custom token Firebase après validation du code sans donner ce droit
sur un autre service account. Le gate `npm run verify:env-parity` contrôle cet invariant.

## Correctif local 2026-08-30 — frontière de panier entre comptes

Invariant : les données du panier Firestore d'un UID ne doivent jamais être écrites dans
un stockage navigateur migrable vers un autre UID. Firestore reste la seule source de
vérité d'un compte connecté ; `tat_local_cart` est exclusivement un panier invité.

Le stockage invité utilise désormais une enveloppe versionnée et explicitement marquée
`scope: guest`. Les anciens tableaux sans propriétaire sont ignorés, car ils peuvent être
un ancien miroir de compte et leur migration serait ambiguë. Avant toute migration, le
transfert est revendiqué par un UID et reçoit un identifiant stable persisté sur les lignes
Firestore. Un autre UID ne peut ni le lire, ni le migrer, ni l'effacer. Cela rend le retry
idempotent même si Firestore a appliqué le commit mais que sa réponse réseau est perdue.
La source locale n'est effacée qu'après confirmation Firestore ; un échec déclenche un
backoff automatique et une reprise immédiate lorsque le navigateur repasse en ligne.
Les mutations de cette source sont sérialisées entre onglets avec Web Locks. Si ce verrou
n'est pas disponible, la revendication échoue fermée : le panier reste local et n'est pas
copié vers un UID ambigu. Les transferts interrompus restent séparés d'un nouveau panier
invité et leurs marqueurs ne sont pas supprimés tant qu'ils peuvent encore être rejoués.

L'état affiché porte également une clé propriétaire : dès que Firebase passe de A à B,
le panier A n'est plus rendu et ne peut pas être envoyé au checkout sous l'identité B,
même avant l'arrivée du premier snapshot Firestore de B.

Les lignes panier utilisent un identifiant déterministe par `(collection, produit)` et la
migration est transactionnelle : deux onglets concurrents relisent automatiquement la
version gagnante avant d'écrire. La commande différée suit le même principe avec un
`attemptId` stable et un document serveur déterministe ; une réponse perdue est rejouée
sans créer une seconde commande ni décrémenter le stock une seconde fois. La transaction
de commande lit toutes les lignes panier, legacy et canoniques, puis ne retire que la
quantité soumise ; les ajouts concurrents et le panier d'un replay sont conservés.

L'annulation ne restaure pas un stock déjà libéré par un webhook ou marqué
`stockReserved: false`. Ce garde vaut aussi pour la suppression développeur d'une
commande et empêche le double-crédit de stock après `payment_failed`/`canceled`.

Vérification dédiée : `npm run verify:cart-boundary`, intégrée au preflight prod. Le
frontend et `createOrder` corrigés sont déployés uniquement sur `sandboxtat`. Aucun
déploiement production n'a été effectué.
