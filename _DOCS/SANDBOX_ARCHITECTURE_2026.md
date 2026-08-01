# Architecture Multi-Environnement : Prod vs Sandbox (Août 2026)

Ce document récapitule l'architecture qui sépare l'environnement de développement (**Sandbox**) de la **Production**, tout en permettant de cloner un snapshot de données pour les tests.

**À fournir à tout agent IA** qui développe en local, teste, ou déploie hors prod.

**Complément chantier catalogue live :** `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md`

---

## 1. Les Projets Firebase

| Rôle | Project ID | Domaine typique | Alias `.firebaserc` (vérifier machine) |
|------|------------|-----------------|----------------------------------------|
| **PRODUCTION** | `tousatable-client` | `tousatable-madeinnormandie.fr` | `prod` |
| **SANDBOX** | `sandboxtat` | `sandboxtat.web.app` / `localhost` | `sandbox` |

Ces projets sont **étanches** (clés API différentes, App Check, pas d’accès croisé front).

> **Note :** la sandbox opérationnelle (août 2026) est le projet Firebase **`sandboxtat`**. Ne pas confondre avec d’anciens noms de projet (`tatmadeinnormandie`) encore cités dans des audits/historiques.

---

## 2. Séparation Firestore (`{appId}`)

Même code source ; chemins data différents :

| Env | Chemin catalogue |
|-----|------------------|
| Prod | `artifacts/tat-made-in-normandie/...` |
| Sandbox | `artifacts/sandboxtat/...` |

`firestore.rules` utilise `match /artifacts/{appId}/...` (Write Once, Deploy Anywhere).

**Front :**

```js
// src/firebase/config.js
const appId = import.meta.env.VITE_APP_LOGICAL_NAME || 'tat-made-in-normandie';
```

Variable attendue :

- Sandbox `.env.local` → `VITE_APP_LOGICAL_NAME=sandboxtat`
- Prod `.env.prod` → `VITE_APP_LOGICAL_NAME=tat-made-in-normandie`

> Le nom exact de la variable est **`VITE_APP_LOGICAL_NAME`** (pas `VITE_APP_ID` — ce dernier est l’App ID Firebase technique du SDK).

**Functions :** doivent résoudre le même logical id via `functions/helpers/config.js` (idéalement dérivé de `GCLOUD_PROJECT`, **pas** hardcode prod-only).  
Hardcode historique `APP_ID = 'tat-made-in-normandie'` dans helpers/catalog = **piège sandbox** → voir gate Phase 0.5 du plan live stock.

---

## 3. Variables d'environnement Front

| Fichier | Usage | Projet |
|---------|--------|--------|
| `.env.local` | `npm run dev` (prioritaire Vite) | Sandbox `sandboxtat` |
| `.env` | fallback dev / build sandbox selon setup | Souvent sandbox |
| `.env.prod` | `npm run build:prod` (`vite build --mode prod`) | Prod `tousatable-client` |

**Scripts `package.json` :**

- `npm run dev` → Vite + `.env.local`
- `npm run build` → build **non prod-mode** (ne pas utiliser pour le site client)
- `npm run build:prod` → `--mode prod` → charge `.env.prod`

**Ne jamais** committer de secrets. Ne pas coller les valeurs des `.env*` dans le chat / les issues.

---

## 4. Clone Prod → Sandbox (données)

Un script Admin SDK clone la prod vers la sandbox (contourne App Check) :

- Copie collections utiles (`orders`, `users`, catalogue sous `artifacts/...`, etc.).
- Renomme à la volée `artifacts/tat-made-in-normandie` → `artifacts/sandboxtat`.
- Exclut souvent le lourd analytics (`analytics_sessions`, `client_errors`).

Emplacement documenté : dossier `migration-script` / scripts repo (`scripts/sync-prod-to-sandbox.cjs` selon historique).  
**Lancer uniquement avec intention explicite** — écrit la sandbox, lit la prod (credentials service account).

---

## 5. Emails (protection client)

Sur Cloud Functions mail (`orderEmails`) :

- Envoi vers la boîte client métier **uniquement** si projet = `tousatable-client`.
- Sur `sandboxtat`, secrets Gmail orientés dev → les tests ne spamment pas le client.

Ne pas casser ce garde-fou en « simplifiant » les mails.

---

## 6. Git workflow (important)

### Ne PAS créer une branche git appelée « sandbox »

Sandbox ≠ branche. C’est un **projet Firebase + fichiers env**.

### Workflow recommandé

```
main                    = code stable (prod-ready)
feature/<mission>       = dev + tests contre sandbox
```

1. `git checkout -b feature/ma-mission` depuis `main`
2. Coder ; `npm run dev` → sandbox via `.env.local`
3. Commits sur la feature branch
4. Validation sandbox (local et/ou deploy `sandboxtat` si besoin)
5. Merge dans `main` **après OK user**
6. Deploy **prod** seulement avec accord explicite + `build:prod` + `firebase use prod`

### Firebase CLI

Avant tout `firebase deploy` :

```bash
firebase use            # afficher le projet courant
firebase use sandbox    # sandboxtat — pour tests
# firebase use prod     # tousatable-client — DANGER sans accord
```

Après un deploy prod : **revenir** sur un alias non-prod.

---

## 7. Déploiement (état)

| Cible | Build | Firebase project | Notes |
|-------|-------|------------------|--------|
| Local | `npm run dev` | via `.env.local` | Quotidien |
| Sandbox online | `npm run build` puis deploy | `sandboxtat` | Sur demande |
| Production | `npm run build:prod` puis deploy | `tousatable-client` | Accord user + preflight |

Le multi-deploy « dashboard one-click » peut encore évoluer ; l’essentiel est **ne jamais** builder la prod avec les env sandbox et inversement.

---

## 8. Checklist agent avant de coder

- [ ] J’ai lu ce doc + le plan de ma mission  
- [ ] Je suis sur une **feature branch**, pas en train de committer des essais directs sur `main` sans demande  
- [ ] `npm run dev` pointe sandbox (`sandboxtat` + logical name `sandboxtat`)  
- [ ] Je n’écris pas en Firestore prod  
- [ ] Je ne déploie pas la prod sans phrase claire de l’user  
- [ ] Je ne logge aucun secret  

---

## 9. Statut (août 2026)

- Sandbox `sandboxtat` opérationnelle, peuplée par snapshot catalogue.  
- `npm run dev` + `.env.local` = voie normale de développement.  
- Audits / implémentations (ex. live stock catalogue) = **tests sandbox d’abord**.  
- Prod isolée tant qu’on ne merge/deploy pas explicitement.

---

**Fin du document.**
