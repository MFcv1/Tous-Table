# TODO — Directeur d’implémentation : Live catalogue stock

> **Fichier directeur.** L’agent lit **d’abord ce fichier**, puis le plan technique.  
> Plan détaillé : `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md`  
> Env : `_DOCS/SANDBOX_ARCHITECTURE_2026.md`  
> Handoff court : `_DOCS/HANDOFF_LIVE_STOCK_SANDBOX.md`

---

## Règle d’or (ne jamais sauter)

À **chaque fin de phase**, l’agent DOIT :

1. **Mettre à jour ce `todo.md`** (statuts, case cochée, journal court).
2. **Répondre à l’user** avec le bloc standard ci-dessous.
3. **S’arrêter** si la phase suivante nécessite un OK user (deploy, merge) — ne pas enchaîner en silence.

### Bloc obligatoire en fin de phase (copier dans le chat)

```markdown
## Fin de phase X

### Fait
- …
- Fichiers touchés : …
- Vérifs : (build / grep / test manuel …)

### Reste à faire
- Phase suivante : Y — …
- Plus tard : …
- Bloqueurs éventuels : …

### Prompt de reprise (phase suivante)
[coller le prompt prêt à l’emploi de la section « Prompts de reprise » ci-dessous, adapté]
```

Sans ce bloc + màj de ce fichier → **phase non close**.

---

## Statut global

| Champ | Valeur |
|-------|--------|
| Chantier | Live catalogue stock (A + B) + cancel restore |
| Plan technique | `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` |
| Branche git | `feature/live-catalog-stock-ab` |
| Env de travail | Sandbox `sandboxtat` · `.env.local` · `npm run dev` |
| Prod | **Interdite** sans OK explicite user |
| Phase courante | **TESTS sandbox** (user) |
| Dernière phase close | **DEPLOY-SB** (hosting + functions; getUserStats fail isolé) |
| Prochaine phase | Recettes user → si OK, commit / merge (user) — **pas de prod** |

---

## Checklist phases

Légende : `[ ]` todo · `[~]` en cours · `[x]` done · `[-]` skip justifié

| ID | Phase | Statut | Notes agent |
|----|-------|--------|-------------|
| 0 | Baseline git + lecture + `npm run build` | `[x]` | Branche créée ; sandbox `VITE_APP_LOGICAL_NAME=sandboxtat` ; build OK |
| 0.5 | Verify APP_ID multi-env (souvent déjà en repo) | `[x]` | `resolveAppId` + catalog + AdminOrders OK ; hardcodes hors scripts/archive |
| 1 | `cancelOrderClient` restore stock toujours | `[x]` | Restore toujours ; boards `sold = stock<=0` ; `stockReserved: false` |
| 2 | Live public gallery/detail + anti-stale | `[x]` | Dual HTTP+live ; `liveCollectionsRef` ; pas de live home ; preloader defer conservé |
| 3 | Invalidate cache `publicCatalog` | `[x]` | `invalidatePublicCatalogCache` + epoch ; headers 60/120/60 ; createOrder + cancelOrder |
| 4 | Optionnel `stockReserved` deferred | `[x]` | `stockReserved: true` sur commande deferred |
| 5 | Build final + note coûts + journal plan | `[x]` | `npm run build` OK ; note ANALYTICS_RELIABILITY ; journal plan |
| DEPLOY-SB | Deploy functions sandbox (E2E) | `[x]` | Hosting OK · Functions quasi toutes OK (getUserStats build fail hors scope) · secrets placeholders sandbox |
| MERGE | Merge → main | `[ ]` | **Uniquement si user OK** |
| DEPLOY-PROD | Deploy prod | `[ ]` | **Interdit sans phrase claire user** |

---

## Journal (append only — une entrée par phase close)

### Prep repo (hors implémentation live UI)

- Fait : plan A+B, sandbox doc, handoff, `resolveAppId` + catalog + AdminOrders appId, stubs env supprimés, build OK une fois.
- **Pas encore** : phases 1–3 live/cancel du plan exécutées bout-en-bout sur feature branch.
- Reste : démarrer Phase 0 sur `feature/live-catalog-stock-ab`.

### 2026-08-02 — Phase 0 DONE

- Fait : branche `feature/live-catalog-stock-ab` créée depuis main ; lecture plan + sandbox arch ; `.env.local` → logical `sandboxtat` ; `npm run build` OK.
- Fichiers : (git only) branche.
- Tests : `npm run build`.
- Reste : Phase 0.5 verify APP_ID.

### 2026-08-02 — Phase 0.5 DONE

- Fait : grep multi-env — `functions/helpers/config.js` `resolveAppId` (tousatable-client / sandboxtat) ; `catalog.js` import APP_ID ; front `VITE_APP_LOGICAL_NAME` ; AdminOrders `import { appId }` ; hardcodes restants uniquement scripts sync/test + `_ARCHIVE`.
- Fichiers : aucun (skip code).
- Tests : grep.
- Reste : Phase 1 cancel restore.

### 2026-08-02 — Phase 1 DONE

- Fait : `cancelOrderClient` restaure toujours le stock depuis `order.items` (plus de garde `sold \|\| stockReserved`) ; furniture stock=1 sold=false ; boards stock+=qty sold=(restored<=0) ; order `cancelled_by_client` + `stockReserved: false` ; ownership/7j/shipped inchangés.
- Fichiers : `functions/src/commerce/cancelOrder.js`.
- Tests : review code (E2E CF await deploy sandbox).
- Reste : Phase 2 live UI.

### 2026-08-02 — Phase 2 DONE

- Fait : public dual path — HTTP `publicCatalog` bootstrap + live `onSnapshot` si `gallery\|detail` only ; `liveCollectionsRef` anti-stale dans `applyPublicCatalog` ; admin live inchangé ; preloader defer `tat-startup-preloading` conservé ; DEV `console.debug('[catalog-live]', …)` ; pas de live home.
- Fichiers : `src/App.jsx`.
- Tests : `npm run build` OK.
- Reste : Phase 3 invalidate cache.

### 2026-08-02 — Phase 3 DONE

- Fait : `invalidatePublicCatalogCache()` + epoch anti re-cache stale ; Cache-Control `max-age=60, s-maxage=120, stale-while-revalidate=60` ; appels après deferred success, stripe reservation success, restore PI error, cancel client success.
- Fichiers : `functions/src/public/catalog.js`, `createOrder.js`, `cancelOrder.js`.
- Tests : review code.
- Reste : Phase 4 optionnel puis 5.

### 2026-08-02 — Phase 4 DONE

- Fait : `stockReserved: true` sur order deferred (stock déjà décrémenté).
- Fichiers : `functions/src/commerce/createOrder.js`.
- Tests : review.
- Reste : Phase 5 close.

### 2026-08-02 — Phase 5 DONE

- Fait : `npm run build` OK ; note coûts live gallery\|detail dans `_DOCS/ANALYTICS_RELIABILITY.md` ; journal plan §10 rempli ; todo checklist 0→5 close.
- Fichiers : docs + code phases 1–4.
- Tests : `npm run build`.
- Reste : **await user OK** pour deploy functions sandbox (E2E R1–R2), recettes manuelles live (admin mark sold + 2 navigateurs), puis merge/main/prod.
- Commit : non poussé — working tree dirty sur feature branch (user decide commit).

### 2026-08-02 — Option B + DEPLOY-SB

- Fait polish audit : `publicLiveStockKey` + effet live séparé (stable gallery↔detail) ; rename `subscribeCatalogCollections`.
- Hosting sandbox : https://sandboxtat.web.app
- Functions sandboxtat : createOrder, cancelOrderClient, publicCatalog OK ; getUserStats fail build (hors chantier).
- Secrets sandbox : placeholders (pas de vrais Gmail/Stripe) — virement deferred testable ; Stripe carte non prioritaire.
- publicCatalog smoke : 200, appId=sandboxtat, Cache-Control 60/120/60, 59 furniture / 24 boards.
- Reste : batterie de tests user.

### 2026-08-29 — Audit stabilité checkout + catalogue (sandbox déployée et testée)

- Checkout : validation particulier/entreprise centralisée, récapitulatif inline obligatoire, vraie facturation distincte, rafraîchissement du token après vérification e-mail.
- Commande/facture : payload normalisé, validation serveur, factures/e-mails basés sur `shipping.billing`, logs structurés sans PII.
- Stock : transaction virement multi-articles remise dans l'ordre lecture→écriture, quantités de planches réservées correctement et restauration d'annulation groupée ; le parcours virement n'initialise plus le client Stripe dormant.
- Catalogue : architecture HTTP cache + live galerie/fiche confirmée pertinente ; listener checkout par article désormais sensible à `stock < quantité` et retire aussi une ancienne indisponibilité après restock.
- Auth : OTP e-mail à 6 chiffres et connexion Google validés sur `sandboxtat`; App Check est accepté par les callables OTP et l'autorité de signature de custom token est limitée au service account sandbox sur lui-même.
- E2E sandbox : compte Google recréé, panier d'un meuble, checkout particulier, confirmation des informations, commande virement de 30 €, réservation catalogue, page Mes commandes, IBAN/Wero, e-mail client et facture PDF vérifiés. Commande de test conservée en attente pour ne pas restaurer/supprimer le stock sans accord utilisateur.
- Vérifs : frontières OTP 10/10, frontières admin 15/15, tests helper sécurité 5/5, syntaxe Functions 14/14, analytics, SEO 25/25, build Vite et audit sécurité du patch (32/32 fichiers, aucun finding) réussis.
- **Production intacte** : aucun deploy ni aucune écriture prod. Stripe reste hors scope (désactivé ; UI/code historique dormant). Reste avant proposition prod : décision sur l'annulation de la commande test, recette live d'annulation/retour stock si souhaitée, puis preflight prod et accord explicite séparé.

---

## Prompts de reprise (à coller / adapter en fin de phase)

### Reprise → Phase 0 (démarrage chantier)

```
Lis _DOCS/todo.md (directeur) puis _DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md.
Exécute UNIQUEMENT la Phase 0 (baseline git + build + env sandbox).
À la fin : màj todo.md + bloc « Fin de phase 0 » + prompt Phase 0.5.
Sandbox only, pas de prod.
```

### Reprise → Phase 0.5

```
Lis _DOCS/todo.md puis le plan. Phase courante = 0.5 (verify APP_ID).
Ne pas refaire le code s’il est déjà correct — grep + journal.
Fin de phase : màj todo.md + prompt Phase 1.
```

### Reprise → Phase 1

```
Lis _DOCS/todo.md puis le plan. Exécute Phase 1 uniquement :
fix cancelOrderClient restore stock toujours (virement).
Sandbox. Fin de phase : màj todo.md + prompt Phase 2.
```

### Reprise → Phase 2

```
Lis _DOCS/todo.md puis le plan. Exécute Phase 2 uniquement :
live public gallery|detail + anti-stale liveCollectionsRef + garder preloader defer.
PAS de live home. Fin de phase : màj todo.md + npm run build + prompt Phase 3.
```

### Reprise → Phase 3

```
Lis _DOCS/todo.md puis le plan. Exécute Phase 3 uniquement :
invalidatePublicCatalogCache + TTL headers + appels createOrder/cancelOrder.
Fin de phase : màj todo.md + prompt Phase 4 ou 5.
```

### Reprise → Phase 5 (clôture)

```
Lis _DOCS/todo.md puis le plan. Phase 5 : build, note ANALYTICS_RELIABILITY si besoin,
journal plan + todo.md, lister ce qui reste (deploy sandbox E2E / merge).
Ne pas merge ni deploy sans mon OK.
```

### Reprise → Deploy sandbox (après OK user seulement)

```
Lis _DOCS/todo.md. User a autorisé deploy SANDBOX only.
firebase use sandbox, build non-prod, deploy functions (et hosting si demandé).
Puis recettes R1–R2. Màj todo.md. Pas de prod.
```

---

## Liens techniques rapides

| Besoin | Fichier |
|--------|---------|
| Détail phases / pseudo-code | `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` |
| Prod vs sandbox | `_DOCS/SANDBOX_ARCHITECTURE_2026.md` |
| Commandes | `_DOCS/COMMANDS.md` |
| Règles projet | `AGENTS.md` |

---

## Definition of done chantier

- [x] Docs + plan prêts  
- [x] Phases 0 → 3 (ou 5) closes dans ce todo  
- [x] `npm run build` OK sur la feature branch  
- [ ] Recettes live (au moins admin mark sold + 2 navigateurs)  
- [ ] E2E virement si CF sandbox déployées  
- [ ] User OK avant merge / prod  

**Fin du fichier directeur.**
