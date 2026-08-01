# Plan d'implémentation — Catalogue live stock (Option A + B)

> **Pour Hermes / agent suivant :** exécuter **uniquement** ce plan, phase par phase.  
> **Handoff conversation propre :** lire aussi `_DOCS/SANDBOX_ARCHITECTURE_2026.md` puis ce fichier.  
> Ne pas élargir le scope (pas Stripe métier, pas SEO, pas analytics, pas refonte admin UI).  
> Lecture obligatoire : `AGENTS.md` + sandbox doc ci-dessus.

---

## 0. Environnement de travail (OBLIGATOIRE)

### 0.1 Prod vs Sandbox (août 2026)

Source : `_DOCS/SANDBOX_ARCHITECTURE_2026.md` (+ `.firebaserc`).

| | **PRODUCTION** | **SANDBOX (dev / tests)** |
|--|----------------|---------------------------|
| Projet Firebase | `tousatable-client` | `sandboxtat` |
| Domaine | `tousatable-madeinnormandie.fr` | `sandboxtat.web.app` / `localhost` |
| Alias `.firebaserc` | `prod` | `sandbox` (et éventuellement `default` selon machine — **vérifier**) |
| Nœud catalogue Firestore | `artifacts/tat-made-in-normandie/...` | `artifacts/sandboxtat/...` |
| Front env | `.env.prod` via `npm run build:prod` | `.env.local` (prioritaire Vite en `npm run dev`) |
| Variable chemin data front | `VITE_APP_LOGICAL_NAME=tat-made-in-normandie` | `VITE_APP_LOGICAL_NAME=sandboxtat` |

```
┌─────────────────────┐         ┌─────────────────────┐
│  PROD               │         │  SANDBOX            │
│  tousatable-client  │  clone  │  sandboxtat         │
│  artifacts/         │ ─────►  │  artifacts/         │
│  tat-made-in-…      │ snapshot│  sandboxtat/        │
└─────────────────────┘         └─────────────────────┘
        ▲                                 ▲
        │ build:prod                      │ npm run dev
        │ .env.prod                       │ .env.local
        └──────────── même code git ──────┘
```

**Règle d’or :** toute implémentation + tests smoke de CE plan se font sur **SANDBOX** (`npm run dev` + `.env.local` → projet `sandboxtat`).  
**Interdit** sans accord explicite user : écrire Firestore prod, `firebase use prod` + deploy, `npm run build:prod` + deploy hosting/functions prod.

### 0.2 Git — PAS de branche nommée « sandbox »

Le conseil workflow (validé) :

- **`main`** = code aligné prod / intouchable pour le daily dev.
- **Pas** besoin d’une branche git « sandbox » : l’env est choisi par **`.env.*` + projet Firebase**, pas par le nom de branche.
- **Oui** : une **feature branch par mission**.

Pour CE chantier, l’agent DOIT commencer par :

```bash
git status
git checkout main
git pull   # si remote à jour et user OK
git checkout -b feature/live-catalog-stock-ab
```

Ensuite coder / committer **uniquement** sur `feature/live-catalog-stock-ab`.  
Merge → `main` **seulement** après validation user.  
Deploy prod **jamais** dans ce plan sans phrase user claire (« déploie en prod »).

Deploy sandbox hosting/functions : **uniquement** si user le demande, avec :

```bash
firebase use sandbox    # projet sandboxtat — vérifier le terminal
# ou l'alias qui pointe vraiment sur sandboxtat
npm run build           # PAS build:prod
firebase deploy --only hosting,functions   # scope minimal demandé
```

Puis revenir : `firebase use` vers l’alias non-prod habituel.

### 0.3 Docs env

**Source de vérité sandbox :** `_DOCS/SANDBOX_ARCHITECTURE_2026.md` + `.firebaserc` + `.env.local` (ne jamais logger les secrets).

Les anciens guides `environnement.md` / `REGLES_ENV.md` ont été **supprimés** (obsolètes).

### 0.4 Prérequis techniques critiques avant Phase 1–3 (stock)

Le front utilise :

```js
// src/firebase/config.js
const appId = import.meta.env.VITE_APP_LOGICAL_NAME || 'tat-made-in-normandie';
```

Les Cloud Functions utilisent encore souvent un **hardcode** :

```js
// functions/helpers/config.js
const APP_ID = 'tat-made-in-normandie';

// functions/src/public/catalog.js
const APP_ID = 'tat-made-in-normandie';
```

Et `getSiteUrl` ne mappe pas encore `sandboxtat` :

```js
urlMap = {
  'tousatable-client': 'https://tousatable-madeinnormandie.fr',
  'tatmadeinnormandie': 'https://tatmadeinnormandie.web.app'
  // manquant: sandboxtat → https://sandboxtat.web.app
}
```

**Conséquence :** si la sandbox stocke le catalogue sous `artifacts/sandboxtat` mais que les Functions déployées sur `sandboxtat` écrivent/lisent `artifacts/tat-made-in-normandie`, alors :

- `createOrder` / `cancelOrderClient` / `publicCatalog` ciblent le **mauvais nœud**
- les tests live stock sont **faux** ou cassés

→ **Phase 0.5 (gate)** ci-dessous est **bloquante** avant le reste.

Ne **jamais** logger les valeurs secrètes des `.env*`. Vérifier seulement :

- `VITE_FIREBASE_PROJECT_ID` attendu sandbox = `sandboxtat`
- `VITE_APP_LOGICAL_NAME` attendu sandbox = `sandboxtat`
- En console navigateur dev : lectures `artifacts/sandboxtat/...`

---

## 1. Objectif (definition of done)

Quand un **meuble unique** change de stock en base (`sold` / `stock`) suite à :

1. commande client **virement** (`createOrder` deferred), ou  
2. annulation client (`cancelOrderClient`), ou  
3. annulation admin (restore stock existant),

alors **sur SANDBOX** :

| Surface | Comportement attendu |
|---------|----------------------|
| Visiteur déjà sur **galerie** ou **fiche produit** | UI mise à jour **en temps réel** (1–3 s), sans F5 |
| Nouvel arrivant / hard reload | Catalogue plus frais grâce invalidation cache Function (+ TTL HTTP modéré) |
| Admin back-office | Live inchangé / non régressé |
| Tracking analytics / sessions | **Aucun** changement de code analytics |
| Grille filtres `published` / catégories | **Inchangés** |
| Base **prod** | **Non touchée** |

**Hors scope :**

- Réparer / réactiver Stripe parcours client (non utilisé en réel ; virement only).
- Live permanent home + comptoir + 3 collections pour tous.
- Refonte annulation admin en CF (optionnel plus tard).
- Mot de passe oublié / UX email verify.
- Deploy prod.
- Refonte dashboard multi-deploy Next (hors sujet).

**Parcours paiement réel à tester :** `paymentMethod` deferred / manual (virement) uniquement.

---

## 2. Contexte technique catalogue (ne pas réinventer)

### 2.1 Fichiers

| Fichier | Rôle |
|---------|------|
| `src/App.jsx` | Public = `publicCatalog` HTTP si OK ; admin = `onSnapshot` |
| `src/firebase/config.js` | `appId` depuis `VITE_APP_LOGICAL_NAME` |
| `functions/src/public/catalog.js` | HTTP catalog + cache mémoire 5 min — **APP_ID hardcodé** |
| `functions/helpers/config.js` | `APP_ID` hardcodé + `getSiteUrl` |
| `functions/src/commerce/createOrder.js` | Deferred stock ; pas `stockReserved` |
| `functions/src/commerce/cancelOrder.js` | Restore si `sold \|\| stockReserved` seulement |
| `src/features/admin/AdminOrders.jsx` | Cancel admin client-side + delete order — **appId hardcodé** `tat-made-in-normandie` (à aligner sandbox) |
| `src/pages/GalleryView.jsx` | Filtre `status === 'published'` |
| `src/components/shared/AnalyticsProvider.jsx` | Indépendant catalogue |

### 2.2 Dettes

| ID | Problème | Phase |
|----|----------|-------|
| D0 | APP_ID Functions / AdminOrders / catalog hardcodé prod-path → casse sandbox `sandboxtat` | **0.5** |
| D1 | Public pas live → stale vendu/dispo | 2 |
| D2 | HTTP tardif peut ré-écraser live | 2 |
| D3 | Cache Function non invalidé après mutate | 3 |
| D4 | Cancel client restore incomplet (planches multi) | 1 |
| D5 | Admin cancel n’invalide pas cache HTTP | Accepté si A OK |
| D6 | Docs env historiques (`tatmadeinnormandie`) vs `sandboxtat` | Doc only |

### 2.3 Architecture cible stock UI

```
BOOT
  └─ publicCatalog HTTP (preloader inchangé)
       │
       ▼
HANDOFF live public UNIQUEMENT view === gallery | detail
  └─ onSnapshot furniture XOR cutting_boards
       │
       ▼
Garde-fou : applyPublicCatalog n'écrase plus une collection live
       │
MUTATE (createOrder deferred / cancelOrderClient) sur bon APP_ID
  └─ Firestore sold/stock
  └─ invalidatePublicCatalogCache()
```

---

## 3. Règles anti-égarement

1. Travailler sur branche `feature/live-catalog-stock-ab` (créer si absente).  
2. Tests runtime = **sandbox only**.  
3. Ne pas supprimer `publicCatalog` / preloader images.  
4. Live public = **gallery + detail** only (pas home).  
5. Ne pas toucher Analytics.  
6. Pas de deploy prod. Deploy sandbox seulement sur demande user.  
7. Ne pas logger secrets `.env`.  
8. Ne pas « simplifier » en remettant full `onSnapshot` partout.  
9. Stripe : ignorer pour recettes métier ; ne pas réécrire webhooks.  
10. Remplir le **Journal** (section 10) à chaque phase.  
11. Si D0 non résolu : **STOP** — ne pas implémenter A/B sur un APP_ID faux.

---

## 4. Phases

### Phase 0 — Baseline git + lecture

**Actions :**

```bash
git status
git checkout main   # si besoin
git checkout -b feature/live-catalog-stock-ab   # si branche absente
```

1. Lire ce plan + `_DOCS/SANDBOX_ARCHITECTURE_2026.md`.  
2. Confirmer sans dump secret : `npm run dev` charge bien sandbox (projectId / logical name).  
3. `npm run build` baseline.  
4. Journal : 3 lignes état initial.

**Done :** branche feature active, build OK, env sandbox confirmé.

---

### Phase 0.5 — Gate APP_ID multi-env (BLOQUANT SANDBOX)

**Objectif :** un seul mécanisme d’`APP_ID` côté Functions + chemins admin alignés sandbox/prod.

**Fichiers autorisés cette phase :**

- `functions/helpers/config.js`
- `functions/src/public/catalog.js` (supprimer hardcode local, importer helper)
- `src/features/admin/AdminOrders.jsx` (remplacer appId hardcodé par import `appId` depuis `src/firebase/config.js`)
- éventuellement autres hardcodes `tat-made-in-normandie` **dans le chemin critique stock** découverts par search — **scope stock only**, pas rewrite global repo

**Comportement cible `functions/helpers/config.js` :**

```js
function resolveAppId() {
  // 1. env explicit (functions config / .env functions si présent)
  if (process.env.APP_LOGICAL_NAME) return process.env.APP_LOGICAL_NAME;
  if (process.env.VITE_APP_LOGICAL_NAME) return process.env.VITE_APP_LOGICAL_NAME;
  // 2. mapping projet Firebase
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || '';
  const map = {
    'tousatable-client': 'tat-made-in-normandie',
    'sandboxtat': 'sandboxtat',
    // legacy old sandbox project if still used anywhere:
    'tatmadeinnormandie': 'tat-made-in-normandie', // ou tat-sandbox selon données réelles — VÉRIFIER
  };
  if (map[projectId]) return map[projectId];
  return 'tat-made-in-normandie';
}
const APP_ID = resolveAppId();
```

`getSiteUrl` : ajouter `'sandboxtat': 'https://sandboxtat.web.app'`.

`catalog.js` : `const { APP_ID } = require('../../helpers/config');` (ajuster chemin relatif réel) — **un seul** endroit de vérité.

**AdminOrders.jsx :**  
Aujourd’hui `const appId = 'tat-made-in-normandie';` → utiliser `import { appId } from '../../firebase/config'` (chemin relatif exact selon fichier).

**Vérifs Phase 0.5 :**

| # | Test | Attendu |
|---|------|---------|
| 0.5.1 | Search `tat-made-in-normandie` dans `functions/src/public` + `commerce` + `AdminOrders` | Plus de hardcode chemin catalogue orphelin |
| 0.5.2 | `npm run dev` + lecture galerie | Items chargés depuis `artifacts/sandboxtat/...` |
| 0.5.3 | Si functions locales/emul ou déjà déployées sandbox | `publicCatalog` renvoie meubles sandbox |
| 0.5.4 | Build front | OK |

**Note deploy functions sandbox :** pour que `createOrder` utilise le bon APP_ID en réel, il faudra **déployer les functions sur `sandboxtat`** quand user OK. En attendant, le front live (Phase 2) peut déjà être testé via listeners Firestore directs ; les CF restent à aligner pour recettes commande/cancel.

**Done 0.5 :** chemins alignés ; journal mis à jour.

**Commit :** `fix(config): resolve APP_ID for sandboxtat vs prod`

---

### Phase 1 — Restore stock `cancelOrderClient`

**Fichier :** `functions/src/commerce/cancelOrder.js`

- Toujours restaurer depuis `order.items` (qty + collection).  
- Meuble : `stock=1`, `sold=false`, clear `soldAt`/`buyerId`.  
- Planche : `stock += qty`, `sold = restored<=0`.  
- Retirer le gate unique `if (sold || stockReserved)`.  
- `stockReserved: false` sur order.  
- Ownership / 7j / shipped : inchangés.

**Tests (sandbox, après functions déployées sandbox ou emulator) :**

| # | Scénario | Attendu |
|---|----------|---------|
| 1.1 | Cancel meuble unique | stock 1, sold false |
| 1.2 | Cancel planche multi | stock +qty |
| 1.3 | Autre user | denied |
| 1.4 | shipped | refused |

**Commit :** `fix(commerce): always restore stock on client cancel`

---

### Phase 2 — Option A live public gallery/detail + anti-stale

**Fichier :** `src/App.jsx`

1. Bootstrap `publicCatalog` **conservé**.  
2. Si `!isAdmin && (view==='gallery'||view==='detail')` → `onSnapshot` collection active only.  
3. Admin : live actuel.  
4. Home / shop / checkout : **pas** de nouveau live catalogue stock.  
5. `liveCollectionsRef` : `applyPublicCatalog` n’écrase pas une collection live.  
6. Cleanup unsub hors gallery/detail.  
7. Shape `{ id, collectionName, ... }` + `sortByCreatedAtDesc`.

**Pattern interdit :**

```js
fetch(publicCatalog).catch(() => subscribeOnlyOnFailure)
```

**Pattern cible public gallery/detail :** bootstrap HTTP + subscribe live en parallèle, avec garde-fou stale.

**Recettes UI (2 navigateurs, sandbox) :**

| # | Scénario | Attendu |
|---|----------|---------|
| 2.1 | A galerie ; B commande virement (si CF OK) ou admin mark sold | A voit Vendu sans F5 |
| 2.2 | Cancel → re-dispo | sans F5 |
| 2.3 | Home only | pas de listener furniture durable |
| 2.4 | Switch meubles/planches | unsub/sub correct |
| 2.5 | HTTP late | ne ramène pas stale |
| 2.6 | Filtres published | OK |
| 2.7 | Analytics admin | pas de régression code |

**Commit :** `feat(catalog): live stock on public gallery/detail`

---

### Phase 3 — Option B invalidate cache publicCatalog

**Fichiers :** `functions/src/public/catalog.js`, `createOrder.js`, `cancelOrder.js`

- `exports.invalidatePublicCatalogCache = ...`  
- Appel après mutate stock réussi.  
- Pas de require circulaire catalog → commerce.  
- Headers recommandés : `max-age=60, s-maxage=120, stale-while-revalidate=60` (atelier).  
- Multi-instance = best-effort ; A reste la vérité session ouverte.

**Commit :** `fix(catalog): invalidate publicCatalog cache after stock mutations`

---

### Phase 4 — Optionnel `stockReserved: true` sur deferred

Dans `createOrder` deferred order payload. Redondant si Phase 1 OK.

---

### Phase 5 — Vérifs + docs

```bash
npm run build
```

- Note courte dans `_DOCS/ANALYTICS_RELIABILITY.md` : live public **gallery/detail only** justifié stock critique (coûts).  
- Mettre à jour Journal.  
- **Ne pas** merge main / deploy prod sans user.  
- Proposer à l’user : merge PR + éventuellement deploy functions+hosting **sandbox** pour recettes E2E.

---

## 5. Ordre imposé

```
0 git branch + baseline
0.5 APP_ID sandbox gate          ← BLOQUANT
1 cancel restore
2 live UI A + anti-stale
3 invalidate B
4 stockReserved deferred (opt)
5 build + docs + journal
```

---

## 6. Fichiers autorisés / interdits

**Autorisés :**  
`src/App.jsx`, `src/firebase/config.js` (si besoin read-only check), `src/features/admin/AdminOrders.jsx` (appId only),  
`functions/helpers/config.js`, `functions/src/public/catalog.js`,  
`functions/src/commerce/cancelOrder.js`, `functions/src/commerce/createOrder.js`,  
`functions/index.js` (si besoin),  
`_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md`, `_DOCS/ANALYTICS_RELIABILITY.md`,  
`_DOCS/SANDBOX_ARCHITECTURE_2026.md` (corrections factuelles mineures OK).

**Interdits :** Analytics*, SEO, firestore.rules rewrite large, Stripe webhook rewrite, secrets dans le chat, deploy prod.

---

## 7. Recettes bout-en-bout (sandbox)

Prérequis : Phase 0.5 OK + (idéalement) functions déployées sur `sandboxtat`.

### R1 — Virement → vendu live  
Galerie A + commande deferred B → A voit vendu sans F5 ; B voit commande Mes commandes.

### R2 — Cancel client → re-dispo live  
Cancel B → A voit dispo ; Firestore `sold:false` `stock:1`.

### R3 — Cancel admin  
AdminOrders restore → galerie live OK.

### R4 — Tracking  
Parcours visiteur non-admin : pas d’erreur ; code analytics non modifié (diff git).

### R5 — Coûts navigation  
Home sans sub durable ; gallery sub on ; about sub off.

### R6 — Planche multi (si data)  
Cancel restore qty.

### R7 — Isolation prod  
Pendant tests : aucune écriture projet `tousatable-client` (contrôler que `.env.local` / CLI pointent sandbox).

---

## 8. Risques

| Risque | Mitigation |
|--------|------------|
| CF hardcode mauvais artifacts path | Phase 0.5 bloquante |
| AdminOrders hardcode | Phase 0.5 |
| HTTP ré-écrase live | liveCollectionsRef |
| Coût Firestore | gallery/detail only |
| Cache multi-instance | A + invalidate best-effort |
| Deploy prod accidentel | branch feature + interdiction plan |
| Docs env legacy | ignorer au profit SANDBOX_ARCHITECTURE_2026 |
| Emails test client | déjà filtré prod-only dans orderEmails (doc sandbox) — ne pas casser |

---

## 9. Critères DONE

1. Branche `feature/live-catalog-stock-ab` contient le travail.  
2. `npm run build` OK.  
3. Phase 0.5 APP_ID OK sur sandbox.  
4. Phases 1–3 code complete.  
5. R1–R2 validés sandbox **ou** explicitement bloqués « functions sandbox non déployées — user doit autoriser deploy sandbox ».  
6. Analytics untouched (git diff).  
7. Prod non déployée / non écrite.  
8. Journal section 10 rempli.  
9. Note coûts Firebase ajoutée.

---

## 10. Journal d’exécution

| Date | Phase | Fait | Tests | Bloqueurs | Commit |
|------|-------|------|-------|-----------|--------|
| | 0 | | | | |
| | 0.5 | | | | |
| | 1 | | | | |
| | 2 | | | | |
| | 3 | | | | |
| | 4 | | | | |
| | 5 | | | | |

**Notes :**

- …

---

## 11. Prompt de reprise (copier-coller nouvelle conversation)

```
Implémente le plan _DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md phase par phase.
Contexte env : _DOCS/SANDBOX_ARCHITECTURE_2026.md
- Branche : feature/live-catalog-stock-ab (créer si besoin)
- Runtime tests : sandbox sandboxtat via .env.local / npm run dev
- Interdit : prod Firestore write, deploy prod, toucher analytics, élargir scope Stripe/SEO
- Commencer par Phase 0 puis gate 0.5 APP_ID avant tout live catalogue
- Remplir le journal en bas du plan
- Pas de merge main sans mon OK
```

---

## 12. Message agent

Tu n’inventes pas d’archi. Tu alignes **APP_ID sandbox**, tu fixes **restore cancel**, tu actives **live gallery/detail** avec **anti-stale**, tu **invalides** le cache catalog.  
Feature branch, tests sandbox, zéro prod.  
Si doute env : relire `_DOCS/SANDBOX_ARCHITECTURE_2026.md` et `.firebaserc`.

Fin du plan.
