# Plan d'implémentation — Catalogue live stock (Option A + B)

> **Agent :**  
> 1. Lire d’abord **`_DOCS/todo.md`** (fichier **directeur** : statut, checklist, prompts de reprise).  
> 2. Exécuter **ce plan** phase par phase pour le détail technique.  
> 3. À **chaque fin de phase** : mettre à jour `todo.md` + répondre avec le bloc « Fin de phase » (fait / reste / prompt reprise) — voir `todo.md` § Règle d’or.  
>
> Lire aussi : `_DOCS/SANDBOX_ARCHITECTURE_2026.md` + `AGENTS.md`.  
> Scope fermé : pas Stripe métier, SEO, analytics, refonte admin UI.  
> Handoff court : `_DOCS/HANDOFF_LIVE_STOCK_SANDBOX.md`.

---

## Validation externe (audit accepté)

Audit indépendant (Claude Opus, 2026-08) : **plan validé** — robustesse, cohérence projet, plus-value pièces uniques.

| Point audit | Décision |
|-------------|----------|
| Dual HTTP + live onSnapshot | Oui — Phase 2 |
| Gallery + detail only (coûts AGENTS) | Oui — **pas** de live public home |
| Phase 1 cancel = vrai bug virement | Oui — prioritaire |
| Phase 3 invalidate multi-instance best-effort | Oui — A compense |
| Phase 0.5 APP_ID déjà en repo | Vérifier puis skip |
| Détail anti-stale / preloader manquant | **Ajouté** ci-dessous Phase 2 |
| Monitoring léger | Optionnel `console.debug` DEV only |

**Plus-value :** meubles uniques — stale plusieurs minutes = panier frustré / double intention d’achat. Live 1–3 s sur galerie + fiche = UX critique.

---

## État repo avant exécution

| Phase | État | Action agent |
|-------|------|--------------|
| 0.5 APP_ID | **Fait** (`resolveAppId`, catalog, AdminOrders) | Grep + skip si OK |
| 1 cancel restore | À faire | Coder |
| 2 live UI | À faire (cœur) | Coder |
| 3 invalidate cache | À faire | Coder |
| Deploy CF sandbox | Pas fait | Demander OK user pour E2E |

---

## 0. Environnement

| | PROD | SANDBOX |
|--|------|---------|
| Projet | `tousatable-client` | `sandboxtat` |
| Data | `artifacts/tat-made-in-normandie` | `artifacts/sandboxtat` |
| Env front | `.env.prod` + `build:prod` | `.env.local` + `npm run dev` |
| Logical name | `tat-made-in-normandie` | `sandboxtat` |
| Alias firebase | `prod` | `sandbox` |

**Git :** branche `feature/live-catalog-stock-ab` — **pas** de branche « sandbox ».  
**Tests :** sandbox only. **Interdit :** write/deploy prod sans phrase user claire.

```bash
git checkout -b feature/live-catalog-stock-ab  # si absente
npm run dev   # sandbox
```

Deploy sandbox (sur demande) : `firebase use sandbox` → `npm run build` → deploy scope minimal → revenir alias non-prod.

### 0.4 APP_ID (déjà en repo)

- Front : `VITE_APP_LOGICAL_NAME`
- Functions : `functions/helpers/config.js` → `resolveAppId()` via `GCLOUD_PROJECT`
- Catalog : import helper (plus hardcode local)
- AdminOrders : `import { appId } from firebase/config`

Gate : grep hardcode orphelin stock → si clean, **0.5 DONE**.

### Clarification : mémo collections ≠ live public

`activePublicRealtimeCollectionsKey` liste déjà `furniture` pour **home**.  
**Ne pas** s’abonner en live public juste parce que la clé est non vide.

```js
const publicLiveStockEnabled =
  !isAdmin && (view === 'gallery' || view === 'detail');
// onSnapshot stock public SEULEMENT si publicLiveStockEnabled
// admin : live inchangé
```

| View | Live public stock |
|------|-------------------|
| gallery / detail | **Oui** |
| home / shop / checkout / about | **Non** (HTTP catalog) |
| admin | Oui (existant) |

---

## 1. Definition of done

Sur **sandbox**, après commande virement / cancel client / cancel admin :

- Galerie ou fiche ouverte : statut stock UI **1–3 s**, sans F5  
- Cold load : plus frais (invalidate + TTL modéré)  
- Admin OK, analytics **non touchés**, filtres published OK, **prod non touchée**

Paiement testé : **deferred / virement only**.

---

## 2. Contexte code

| Fichier | Rôle |
|---------|------|
| `src/App.jsx` | Public HTTP-only aujourd’hui ; admin live |
| `functions/src/public/catalog.js` | Cache mémoire + Cache-Control |
| `functions/src/commerce/cancelOrder.js` | Restore si `sold \|\| stockReserved` seulement ← bug |
| `functions/src/commerce/createOrder.js` | Deferred stock |
| `GalleryView.jsx` | Filtre `published` |
| `AnalyticsProvider.jsx` | Indépendant — ne pas toucher |

Cible :

```
publicCatalog HTTP (boot + preloader defer)
  + onSnapshot gallery|detail (live)
  + applyPublicCatalog n’écrase pas collections live
mutate stock → Firestore + invalidatePublicCatalogCache()
```

---

## 3. Anti-égarement

1. **`_DOCS/todo.md` = directeur** — le lire et le mettre à jour à chaque phase  
2. Feature branch only  
3. Sandbox tests  
4. Garder publicCatalog + preloader + **defer** `tat-startup-preloading`  
5. Live public = gallery|detail **only**  
6. Pas analytics / pas deploy prod  
7. Pas full onSnapshot partout  
8. Journal plan §10 + **todo.md**  
9. Si APP_ID faux → STOP  
10. **Fin de phase obligatoire** : bloc chat (Fait / Reste / Prompt reprise) + màj todo — sinon phase non close  

---

## 4. Phases

### Phase 0 — Baseline

```bash
git status
git checkout -b feature/live-catalog-stock-ab  # si besoin
npm run build
```

Confirmer sandbox (projectId / logical name, sans logger secrets). Journal 3 lignes.

**Close phase 0 :** màj `_DOCS/todo.md` (case 0 = done, phase courante = 0.5) + bloc Fin de phase + prompt reprise Phase 0.5 (modèle dans todo.md).

### Phase 0.5 — APP_ID verify (souvent skip)

Lire config + catalog + AdminOrders. Grep hardcodes. Si OK → DONE sans commit.  
E2E CF nécessite encore deploy functions sandbox (user OK).

**Close phase 0.5 :** màj todo.md + bloc Fin de phase + prompt Phase 1.

### Phase 1 — `cancelOrderClient` restore toujours

**Fichier :** `functions/src/commerce/cancelOrder.js`

- Restore **toujours** depuis `order.items` (pas seulement `sold || stockReserved`)  
- furniture → stock 1, sold false, clear soldAt/buyerId  
- boards → stock += qty, sold = restored<=0  
- order : cancelled_by_client, stockReserved false  
- ownership / 7j / shipped inchangés  

Tests : meuble, planche multi, other user, shipped.  
Commit : `fix(commerce): always restore stock on client cancel`

**Close phase 1 :** màj todo.md + bloc Fin de phase + prompt Phase 2.

### Phase 2 — Live gallery/detail ⭐ CŒUR (~majorité effort)

**Fichier :** `src/App.jsx` — ne toucher que catalogue load + `applyPublicCatalog`.

#### Conserver

- Preloader + `warmupStartupCatalogImagesForRoute`  
- **Defer** : si `document.body.classList.contains('tat-startup-preloading')` → `deferredPublicCatalogRef` (ne pas casser)  
- Admin live  
- `normalizePublicCatalogPayload`  

#### Pattern

```
// INTERDIT (actuel public)
fetch(catalog).catch(() => subscribe)

// CIBLE gallery|detail
bootstrap HTTP (fire-and-forget, defer preloader OK)
+ subscribe live en parallèle
+ garde-fou stale
```

#### Anti-stale (obligatoire)

```js
const liveCollectionsRef = useRef(new Set()); // 'furniture' | 'cutting_boards'

// onSnapshot furniture → liveCollectionsRef.current.add('furniture')
// cleanup unsub → .delete('furniture')

// applyPublicCatalog:
const p = normalizePublicCatalogPayload(collections);
if (!liveCollectionsRef.current.has('furniture')) setItems(p.items);
if (!liveCollectionsRef.current.has('cutting_boards')) setBoardItems(p.boardItems);
setAffiliateProducts(p.affiliateProducts); // sauf logique admin live déjà en place
```

#### Subscribe quand

```js
publicLiveStockEnabled = !isAdmin && (view === 'gallery' || view === 'detail')
```

Collection : furniture XOR boards selon gallery/detail.  
Unsub hors gallery/detail et au switch collection.  
Shape `{ id, collectionName, ... }` + `sortByCreatedAtDesc`.

Optionnel DEV : `console.debug('[catalog-live]', col, size)` — pas de PII.

#### Recettes

| # | Attendu |
|---|---------|
| 2.1 A galerie, B vend / commande | Vendu sans F5 |
| 2.2 Cancel | Re-dispo sans F5 |
| 2.3 Home only | **Pas** de listener furniture durable |
| 2.4 Switch meubles/planches | unsub/sub OK |
| 2.5 HTTP after live | pas de stale |
| 2.6 Filtres published | OK |
| 2.7 Preloader 1ère visite | pas cassé |
| 2.8 Diff analytics | vide |

Commit : `feat(catalog): live stock on public gallery/detail`

**Close phase 2 :** `npm run build` + màj todo.md + bloc Fin de phase + prompt Phase 3.

### Phase 3 — Invalidate cache

`catalog.js` : `invalidatePublicCatalogCache()`  
Appels : createOrder succès deferred (+ reservation si code path), cancelOrder succès.  
Pas de require circulaire.  
Headers : `max-age=60, s-maxage=120, stale-while-revalidate=60`.  
Multi-instance = best-effort.

Commit : `fix(catalog): invalidate publicCatalog cache after stock mutations`

**Close phase 3 :** màj todo.md + bloc Fin de phase + prompt Phase 4 ou 5.

### Phase 4 — Optionnel

`stockReserved: true` sur order deferred.

**Close phase 4 :** màj todo.md (ou `[-]` skip) + prompt Phase 5.

### Phase 5 — Close

```bash
npm run build
```

Note coûts dans `_DOCS/ANALYTICS_RELIABILITY.md` (live gallery/detail only).  
Journal plan + **todo.md** final. Pas merge/deploy prod sans OK. Proposer deploy CF sandbox pour R1–R2.

**Close phase 5 :** checklist todo « definition of done » + résumé user + prompts deploy/merge **désactivés** tant que user n’a pas dit OK.

---

## 5. Ordre

```
0 baseline → 0.5 verify APP_ID → 1 cancel → 2 live UI → 3 invalidate → 4 opt → 5 verify
```

---

## 6. Fichiers

**OK :** `App.jsx`, `cancelOrder.js`, `createOrder.js`, `catalog.js`, config helpers si régression, AdminOrders si régression, docs plan/analytics reliability.

**Interdit :** Analytics*, SEO, rules rewrite large, Stripe rewrite, secrets, deploy prod.

---

## 7. Recettes E2E sandbox

R1 virement → vendu live · R2 cancel → dispo · R3 admin cancel · R4 analytics diff vide · R5 home sans sub · R6 planche multi · R7 pas de touch prod.

Prérequis E2E CF : deploy functions `sandboxtat`.  
Sans deploy : Phase 2 testable via admin mark sold + 2 navigateurs.

---

## 8. Risques

| Risque | Mitigation |
|--------|------------|
| App.jsx 65KB / preloader | Scope minimal + garder defer |
| HTTP écrase live | liveCollectionsRef |
| Live home par erreur | publicLiveStockEnabled |
| Coût Firebase | unsub hors gallery/detail |
| CF multi-instance cache | A + invalidate best-effort |
| Deploy prod | interdiction + feature branch |

---

## 9. DONE si

1. Feature branch  
2. Build OK  
3. 0.5 vérifié  
4. Phases 1–3 codées  
5. R1–R2 OK ou bloqués « await deploy sandbox »  
6. Analytics untouched  
7. Prod intacte  
8. Journal rempli  
9. Note coûts si live public  

---

## 10. Journal

| Date | Phase | Fait | Tests | Bloqueurs | Commit |
|------|-------|------|-------|-----------|--------|
| 2026-08 | 0.5 | resolveAppId + catalog + AdminOrders | build OK | CF sandbox undeployed | prep session |
| | audit | Opus valide plan | — | — | docs |
| 2026-08-02 | 0 | branche `feature/live-catalog-stock-ab`, sandbox `sandboxtat`, build OK | `npm run build` | — | (session impl) |
| 2026-08-02 | 0.5 | grep multi-env OK — skip code | grep | — | — |
| 2026-08-02 | 1 | cancelOrderClient restore stock toujours + stockReserved false | review code | CF sandbox undeployed (E2E) | pending |
| 2026-08-02 | 2 | dual HTTP+live gallery\|detail, liveCollectionsRef anti-stale, pas live home | `npm run build` | recettes manuelles | pending |
| 2026-08-02 | 3 | invalidatePublicCatalogCache + headers TTL + createOrder/cancelOrder | review code | deploy CF sandbox | pending |
| 2026-08-02 | 4 | stockReserved:true sur deferred | review code | — | pending |
| 2026-08-02 | 5 | build final + note ANALYTICS_RELIABILITY + todo | `npm run build` | await user OK deploy/merge | pending |

---

## 11. Prompt nouvelle conversation

```
Lis d'abord _DOCS/todo.md (fichier directeur) puis _DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md.
Exécute la phase indiquée dans todo.md « Phase courante ».
À chaque fin de phase : màj todo.md + bloc Fait/Reste/Prompt reprise (modèle dans todo.md).
Env : _DOCS/SANDBOX_ARCHITECTURE_2026.md · sandbox only · branche feature/live-catalog-stock-ab
Pas de merge/deploy prod sans mon OK.
```

Si todo.md dit phase 0 :

```
Démarre le chantier live stock : Phase 0 selon _DOCS/todo.md + plan.
```

---

## 12. Message agent

Vérifie APP_ID → fix cancel restore → live gallery/detail + anti-stale (pas home) → invalidate cache.  
Respecte preloader defer. Feature branch, sandbox, zéro prod.

Fin du plan.
