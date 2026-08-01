# Plan d'implémentation — Catalogue live stock (Option A + B)

> **Pour l'agent suivant :** exécuter **uniquement** ce plan, phase par phase.  
> Ne pas élargir le scope (pas Stripe, pas SEO, pas analytics, pas refonte admin).  
> Lecture obligatoire avant code : `AGENTS.md` (coûts Firebase, pas de deploy prod sans accord).  
> **Sandbox / prod Firestore :** ne pas écrire en base prod sans validation explicite utilisateur.  
> Implémentation = code + vérifs locales (`npm run build`). Tests manuels smoke = checklist en fin de plan (compte test / accord user).

---

## 1. Objectif (definition of done)

Quand un **meuble unique** change de stock en base (`sold` / `stock`) suite à :

1. commande client **virement** (`createOrder` deferred), ou  
2. annulation client (`cancelOrderClient`), ou  
3. annulation admin (restore stock existant),

alors :

| Surface | Comportement attendu |
|---------|----------------------|
| Visiteur déjà sur **galerie** ou **fiche produit** | UI mise à jour **en temps réel** (ordre de grandeur 1–3 s), sans F5 |
| Nouvel arrivant / hard reload | Voit un catalogue **pas plus vieux** que le TTL cache restant ; après invalidation serveur, cold path plus frais |
| Admin back-office | Comportement live **inchangé** (déjà OK) |
| Tracking analytics / sessions | **Aucun changement** de comportement ni de schémas |
| Grille filtres `published` / catégories | **Inchangés** |

**Hors scope explicite :**

- Réactiver ou « réparer » Stripe (code mort / non utilisé en parcours réel).
- Live permanent sur home + comptoir + 3 collections pour tous les visiteurs.
- Refonte annulation admin en Cloud Function (nice-to-have phase optionnelle, pas bloquant si A est en place).
- Mot de passe oublié / UX email non vérifié (autre chantier).

---

## 2. Contexte technique actuel (ne pas réinventer)

### 2.1 Fichiers sources de vérité

| Fichier | Rôle |
|---------|------|
| `src/App.jsx` | Charge catalogue public ; admin = `onSnapshot` ; public = **seulement** `publicCatalog` HTTP si succès |
| `functions/src/public/catalog.js` | Endpoint HTTP + cache mémoire process `CACHE_TTL_MS = 5 min` + `Cache-Control` |
| `functions/src/commerce/createOrder.js` | Deferred : décrémente stock + `sold` ; **pas** de `stockReserved` |
| `functions/src/commerce/cancelOrder.js` | Restore **seulement si** `item.sold \|\| order.stockReserved` |
| `src/features/admin/AdminOrders.jsx` | Cancel admin : restore client-side puis `deleteDoc` order |
| `src/pages/GalleryView.jsx` | Filtre `item.status === 'published'` (important : le live brut OK) |
| `src/components/shared/AnalyticsProvider.jsx` | **Indépendant** du catalogue ; ignore `isAdmin` |

### 2.2 Bug / dette liés (à traiter dans ce plan)

| ID | Problème | Phase |
|----|----------|-------|
| D1 | Public : pas de live → stale vendu/dispo | Phase 2 (A) |
| D2 | Course possible : HTTP tardif ré-écrase un snapshot live | Phase 2 (garde-fou) |
| D3 | Cache Function non invalidé après mutate stock | Phase 3 (B) |
| D4 | `cancelOrderClient` peut **ne pas** restore planches multi-stock (sold=false, pas stockReserved) | Phase 1 |
| D5 | Admin cancel n’invalide pas le cache HTTP (visiteurs en live couverts par A) | Accepté ; B partiel |

### 2.3 Architecture cible (ne pas dévier)

```
BOOT (tous)
  └─ publicCatalog HTTP (rapide, preloader inchangé)
       │
       ▼
HANDOFF live (public, UNIQUEMENT view gallery|detail)
  └─ onSnapshot collection ACTIVE seulement
       furniture XOR cutting_boards
       (pas affiliate sauf si déjà requis ailleurs ; NE PAS élargir home)
       │
       ▼
Garde-fou : applyPublicCatalog ne réécrit plus les collections live
       │
MUTATE stock (createOrder / cancelOrderClient)
  └─ Firestore update (source de vérité)
  └─ invalidatePublicCatalogCache() best-effort même module
```

**Admin (`isAdmin === true`) :** conserver le chemin live actuel (collections selon `activePublicRealtimeCollectionsKey` admin). Ne pas le casser.

---

## 3. Règles anti-égarement (l’agent DOIT respecter)

1. **Ne pas** supprimer `publicCatalog` ni le preloader / `warmupStartupCatalogImagesForRoute`.
2. **Ne pas** mettre tout visiteur en `onSnapshot` sur home + shop + affiliate en permanence « pour simplifier ».
3. **Ne pas** toucher `AnalyticsProvider`, `AdminAnalytics`, rules `analytics_sessions`.
4. **Ne pas** déployer functions/hosting sans accord user explicite.
5. **Ne pas** écrire dans Firestore prod pour « tester » sans accord.
6. **Ne pas** mélanger un refactor Stripe / webhook dans ce chantier.
7. Live public = **gallery + detail** uniquement (stock critique sous les yeux).  
   - Si `activePublicRealtimeCollectionsKey` inclut home aujourd’hui, **ne pas** brancher le live public sur home dans ce plan (coût). Home reste cache-only.
8. Toute écriture stock reste **serveur** (CF) pour client ; admin cancel existant client-side artisan OK.
9. Documenter en bas de ce fichier (section Journal) ce qui a été fait / testé / reporté.

---

## 4. Phases d’implémentation

### Phase 0 — Freeze scope + baseline (lecture seule)

**Objectif :** prouver l’état avant patch, sans modifier le runtime métier.

**Actions :**

1. Relire les zones exactes :
   - `src/App.jsx` : `applyPublicCatalog`, effet catalogue ~L572–666, `activePublicRealtimeCollectionsKey` ~L320–333
   - `functions/src/public/catalog.js` (entier)
   - `functions/src/commerce/cancelOrder.js` (entier)
   - `functions/src/commerce/createOrder.js` (bloc deferred + exports)
   - `functions/index.js` (exports)
2. Noter le comportement actuel en 3 lignes dans le Journal (section 9).
3. Lancer baseline locale :

```bash
npm run build
```

**Done phase 0 :** build OK ; agent a les line anchors à jour (re-grep si drift).

**Ne pas committer** si rien n’a changé.

---

### Phase 1 — Restore stock annulation client (correctness base)

**Objectif :** si l’UI devient live, la base doit déjà être juste. Fix `cancelOrderClient` pour **toujours** restaurer le stock des `order.items`, pas seulement si `sold || stockReserved`.

**Fichiers :**

- Modify : `functions/src/commerce/cancelOrder.js`
- (Optionnel doc) Journal section 9

**Comportement cible de la transaction :**

1. Auth + ownership + statuts non annulables + délai 7j : **inchangés**.
2. Pour chaque item de `orderData.items` :
   - `itemId = item.originalId || item.id`
   - `col = item.collectionName || item.collection || 'furniture'`
   - Si doc existe :
     - `qty = Number(item.quantity) || 1`
     - Si `col === 'furniture'` : `stock = 1`, `sold = false`, clear `soldAt`, clear `buyerId`
     - Sinon (ex. `cutting_boards`) : `stock = currentStock + qty`, `sold = (newStock === 0)` **ou** forcer `sold: false` si newStock > 0, clear buyer fields si plus sold
3. **Retirer** la condition `if (itemData.sold || orderData.stockReserved)` comme gate unique du restore.  
   Remplacer par : restore **toujours** pour items présents (idempotent autant que possible).
4. Mettre `stockReserved: false` sur l’order si le champ existe.
5. Status order → `cancelled_by_client` comme aujourd’hui.

**Idempotence / sécurité :**

- Ne pas double-ajouter le stock si status déjà `cancelled_by_client` (déjà bloqué en tête).
- Si item introuvable : log + continue (ne pas fail toute la commande si un id legacy manque) — **même esprit** qu’aujourd’hui.

**Pseudo-code cible (référence, pas copy aveugle si fichier a drift) :**

```js
// Après checks ownership / status / 7 days
for (const item of orderData.items || []) {
  const itemId = item.originalId || item.id;
  const col = item.collectionName || item.collection || 'furniture';
  if (!itemId) continue;
  const itemRef = db.doc(`artifacts/${APP_ID}/public/data/${col}/${itemId}`);
  const itemSnap = await transaction.get(itemRef);
  if (!itemSnap.exists) continue;
  const itemData = itemSnap.data();
  const qty = Number(item.quantity) || 1;
  const currentStock = itemData.stock !== undefined ? Number(itemData.stock) : 0;
  if (col === 'furniture') {
    transaction.update(itemRef, {
      stock: 1,
      sold: false,
      soldAt: admin.firestore.FieldValue.delete(),
      buyerId: admin.firestore.FieldValue.delete(),
    });
  } else {
    const restored = currentStock + qty;
    transaction.update(itemRef, {
      stock: restored,
      sold: restored <= 0,
      ...(restored > 0 ? {
        soldAt: admin.firestore.FieldValue.delete(),
        buyerId: admin.firestore.FieldValue.delete(),
      } : {}),
    });
  }
}
transaction.update(orderRef, {
  status: 'cancelled_by_client',
  cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
  clientNote: "Annulée par l'acheteur",
  stockReserved: false,
});
```

**Tests phase 1 (logique / revue code si pas d’emulateur) :**

| # | Scénario | Attendu |
|---|----------|---------|
| 1.1 | Meuble `sold:true` stock 0, order deferred | Après cancel → stock 1, sold false |
| 1.2 | Planche stock 4→3 à la commande (sold false), cancel | stock revient 4 |
| 1.3 | Order d’un autre user | permission-denied, stock inchangé |
| 1.4 | Status shipped | failed-precondition |
| 1.5 | Double cancel | 2e appel refuse |

**Done phase 1 :** code review + (si possible) test emulator/functions ; **pas de deploy** sans ordre user.

**Commit suggéré (si user demande commit) :**  
`fix(commerce): always restore stock on client cancel`

---

### Phase 2 — Option A : live public gallery/detail + anti-stale

**Objectif :** après boot `publicCatalog`, brancher le live Firestore pour le public **uniquement** sur `gallery` et `detail`.

**Fichier principal :** `src/App.jsx`

#### 2.1 Clarifier quand le public a le droit au live

Introduire une clé ou condition explicite, ex. :

```js
const publicLiveStockEnabled =
  !isAdmin && (view === 'gallery' || view === 'detail');
```

Collections live public :

- `gallery` + collection meubles → `furniture` only  
- `gallery` + planches → `cutting_boards` only  
- `detail` → collection du produit (`furniture` **ou** `cutting_boards` selon item) — **pas** forcer affiliate live ici pour le stock

**Ne pas** activer live public pour : `home`, `shop`, `checkout`, `my-orders`, `about`, etc.

Admin : garder logique actuelle (`view === 'admin'` → furniture|boards|affiliate).

#### 2.2 Flux d’effet catalogue (remplace le branchement `if (!isAdmin) fetch only`)

Ordre imposé :

```
1) Si collections actives vides → no-op cleanup
2) Toujours permettre un bootstrap publicCatalog UNE FOIS au mount app
   (déjà en place via fetchPublicCatalogFallback / preloader)
3) Si isAdmin → subscribeToPublicCollections() comme aujourd’hui
4) Si publicLiveStockEnabled → subscribe UNIQUEMENT aux collections stock
   (furniture et/ou cutting_boards), PAS réintroduire affiliate sauf besoin detail shop
5) Sinon public hors gallery/detail → PAS de nouveau listener ;
   données restent celles du dernier catalog / state
```

**Implémentation recommandée (éviter double fetch infini) :**

- Garder le fetch HTTP bootstrap existant (preloader / premier effet).
- Séparer clairement :
  - effet **bootstrap HTTP** (une fois / dépendances stables)
  - effet **subscriptions live** (dépend `isAdmin`, `view`, collection active, `selectedItemId`)

Si l’agent garde un seul `useEffect`, il DOIT :

- appeler `fetchPublicCatalog` pour public **sans** `return` avant d’avoir branché le live quand `publicLiveStockEnabled`
- pattern interdit actuel :

```js
// INTERDIT de laisser tel quel pour le public :
fetch(...).catch(() => subscribe...)  // live seulement si HTTP fail
```

- pattern cible public gallery/detail :

```js
// Bootstrap HTTP (fire-and-forget, une fois)
fetchPublicCatalogFallback(...)
// + live
return subscribeToPublicCollections()
```

#### 2.3 Garde-fou anti-course (OBLIGATOIRE)

Problème : HTTP lent après snapshot live → `applyPublicCatalog` remet du stale.

**Mécanisme minimal :**

```js
// refs
const liveCollectionsRef = useRef(new Set()); // 'furniture' | 'cutting_boards' | ...

// dans subscribe onSnapshot furniture :
liveCollectionsRef.current.add('furniture');

// cleanup unsub :
liveCollectionsRef.current.delete('furniture');

// dans applyPublicCatalog :
const catalogPayload = normalizePublicCatalogPayload(collections);
if (!liveCollectionsRef.current.has('furniture')) {
  setItems(catalogPayload.items);
}
if (!liveCollectionsRef.current.has('cutting_boards')) {
  setBoardItems(catalogPayload.boardItems);
}
// affiliate : même logique si un jour live ; sinon toujours apply published filter
setAffiliateProducts(catalogPayload.affiliateProducts);
// resolved flags : ne pas marquer false les collections live
```

**Règle :** une collection en live n’est plus jamais écrasée par HTTP tant que le listener est actif.

#### 2.4 Cohérence tri / shape

- Snapshot doit continuer à mapper :

```js
{ id, collectionName: 'furniture'|'cutting_boards', ...data }
```

- Même `sortByCreatedAtDesc` que l’existant.
- `GalleryView` filtre déjà `status === 'published'` → ne pas re-filtrer agressivement dans App sauf si bug visible.

#### 2.5 Cleanup

- Unsub tous les listeners à unmount / changement de collection / sortie gallery|detail.
- Ne pas laisser un listener furniture actif après navigation vers `about` (coût).

#### 2.6 Tests / scénarios phase 2 (manuels prioritaires)

Prérequis : 2 navigateurs ou 1 normal + 1 fenêtre privée. **Sans écrire en prod** si user interdit : valider d’abord par revue + simulation state en dev si emulator dispo.

| # | Scénario | Attendu |
|---|----------|---------|
| 2.1 | Visiteur A sur galerie meubles ; admin marque vendu (ou commande) | Carte passe « Vendu » sans F5 chez A |
| 2.2 | Visiteur A sur galerie ; cancel remet dispo | « Vendu » disparaît / prix reviens sans F5 |
| 2.3 | Visiteur sur **home** seulement | Pas de listener furniture permanent (vérifier Network/Firestore usage ou logs) ; pas de régression affichage |
| 2.4 | Switch meubles → planches | Unsub furniture, sub boards ; pas de fuite listener |
| 2.5 | Sortie gallery → about | Unsub stock |
| 2.6 | HTTP catalog répond après live | State live **non** réécrasé (stale vendu ne revient pas) |
| 2.7 | Admin liste items | Toujours live ; mark sold/available OK |
| 2.8 | Filtres catégorie / published | Inchangés |
| 2.9 | Analytics admin | Sessions toujours listées ; pas d’erreur console liée catalog |
| 2.10 | Deep link fiche produit | Detail s’ouvre ; sold suit le live |

**Done phase 2 :** build OK + scénarios 2.1–2.6 validés en dev (ou documentés bloqués si pas d’accès données).

**Commit suggéré :**  
`feat(catalog): live stock on public gallery/detail after catalog bootstrap`

---

### Phase 3 — Option B : invalidation cache `publicCatalog`

**Objectif :** best-effort fresher cold loads après mutate stock.

**Fichiers :**

- Modify : `functions/src/public/catalog.js`
- Modify : `functions/src/commerce/createOrder.js` (après succès deferred + éventuellement stripe_elements reservation si code restant)
- Modify : `functions/src/commerce/cancelOrder.js` (après succès transaction)
- Modify : `functions/index.js` **seulement si** besoin d’exporter partagé (préférer require relatif du module catalog)

#### 3.1 API cache

Dans `catalog.js` :

```js
function invalidatePublicCatalogCache(reason = 'unspecified') {
  cachedCatalog = null;
  cachedAt = 0;
  // ne pas toucher inflightCatalogRead en cours de façon unsafe :
  // laisser inflight finir ; prochain read verra cachedAt=0 et pourra relire
  // si race : acceptable best-effort
  console.log('publicCatalog cache invalidated:', reason);
}

module.exports = {
  publicCatalog: exports.publicCatalog, // adapter au style du fichier
  invalidatePublicCatalogCache,
};
```

**Attention style module :** le fichier utilise aujourd’hui `exports.publicCatalog = ...`.  
Préférer :

```js
exports.invalidatePublicCatalogCache = () => { ... };
exports.publicCatalog = ...
```

Et depuis commerce :

```js
const { invalidatePublicCatalogCache } = require('../public/catalog');
// après succès mutate stock :
try { invalidatePublicCatalogCache('createOrder:deferred'); } catch (_) {}
```

#### 3.2 Où appeler

| Hook | Quand |
|------|--------|
| `createOrder` deferred | Après transaction succès (stock posé) |
| `createOrder` stripe_elements | Après réservation stock (si conservé) |
| `cancelOrderClient` | Après transaction succès |
| Restore PI fail dans createOrder | Après restore stock |

**Ne pas** appeler depuis le front (inutile / non exposé).

#### 3.3 Limites à documenter (ne pas promettre l’impossible)

- Cache mémoire = **par instance** Cloud Function. Multi-instances → invalidation non globale.  
  **Mitigation :** A couvre les sessions ouvertes ; B améliore une partie des cold starts.
- `Cache-Control` navigateur/CDN peut encore servir une réponse HTTP un moment.  
  **Option oneshot minimale B1 :** baisser à `max-age=60, s-maxage=60` **ou** garder 300 et s’appuyer sur A.  
  **Recommandation plan :** baisser modérément `max-age=60, s-maxage=120, stale-while-revalidate=60` pour stock atelier — **ne pas** mettre `no-store` (coût). Si user préfère coût min, laisser headers et faire seulement invalidate mémoire.

#### 3.4 Admin cancel client-side

N’appelle pas B. Acceptable : visiteurs en gallery live voient via A.  
Phase 3bis optionnelle (hors oneshot critique) : CF `cancelOrderAdmin` + invalidate.

**Tests phase 3 :**

| # | Scénario | Attendu |
|---|----------|---------|
| 3.1 | Après deploy functions : createOrder puis GET publicCatalog sur instance chaude | `generatedAt` récent / pas l’ancienne photo si même instance |
| 3.2 | Code review : require circular ? | `catalog.js` ne doit pas require `createOrder` |
| 3.3 | Build functions syntax | `node -c` ou deploy dry / require local |

**Done phase 3 :** invalidation branchée sans dépendance circulaire ; headers ajustés selon décision ci-dessus.

**Commit suggéré :**  
`fix(catalog): invalidate publicCatalog cache after stock mutations`

---

### Phase 4 — Durcissement deferred (optionnel mais recommandé si temps)

**Objectif :** aligner deferred sur le modèle « stock réservé ».

**Fichier :** `functions/src/commerce/createOrder.js`

- Sur order deferred set : `stockReserved: true` (comme stripe_elements).
- Redondant avec Phase 1 restore toujours, mais clarifie l’intent et aide d’éventuels webhooks futurs.

**Ne pas** toucher au parcours Stripe au-delà de ce flag si non nécessaire.

**Done :** flag présent ; cancel + create cohérents.

---

### Phase 5 — Vérification globale + doc

**Commandes :**

```bash
npm run build
# si functions toolchains locaux :
# cd functions && npm test   # seulement s’il existe déjà des tests
```

**Checklist finale agent :**

- [ ] Aucun changement Analytics
- [ ] Aucun secret loggé
- [ ] Gallery filters OK
- [ ] Admin orders cancel compile toujours
- [ ] Pas de listener public sur home (confirmé par code path)
- [ ] Anti-stale en place
- [ ] cancel restore toujours
- [ ] invalidate cache exporté et appelé
- [ ] Journal section 9 rempli
- [ ] **Pas de deploy** sans phrase user « déploie »

**Doc projet :**

- Ajouter 5–10 lignes dans `_DOCS/ANALYTICS_RELIABILITY.md` **uniquement** si la décision coûts Firebase change (listener public gallery/detail justifié stock critique) — AGENTS.md l’exige pour ce type de retour live public.
- Ou section courte en bas de ce plan + lien depuis Journal.

---

## 5. Ordre d’exécution imposé

```
Phase 0  baseline
   ↓
Phase 1  cancel restore (base juste)
   ↓
Phase 2  live UI A + anti-stale
   ↓
Phase 3  invalidate B (+ headers modérés)
   ↓
Phase 4  stockReserved deferred (si temps)
   ↓
Phase 5  build + docs + journal
```

Ne pas commencer par le front live sans Phase 1 : on afficherait plus vite un stock faux sur planches multi.

---

## 6. Fichiers autorisés vs interdits

### Autorisés

- `src/App.jsx`
- `functions/src/public/catalog.js`
- `functions/src/commerce/cancelOrder.js`
- `functions/src/commerce/createOrder.js`
- `functions/index.js` (si export nécessaire seulement)
- `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` (journal)
- `_DOCS/ANALYTICS_RELIABILITY.md` (note coûts courte)

### Interdits sans nouveau plan user

- `AnalyticsProvider.jsx`, `AdminAnalytics.jsx`
- `firestore.rules` (sauf besoin imprévu justifié)
- Stripe webhook rewrite
- SEO / sitemap
- Design galerie / ProductCard (sauf bug sold flag purement data)

---

## 7. Risques et mitigations (rappel rapide)

| Risque | Mitigation |
|--------|------------|
| HTTP ré-écrase live | `liveCollectionsRef` gate dans `applyPublicCatalog` |
| Coût Firestore | Live public gallery/detail only ; unsub hors page |
| Multi-instance cache B | Documenter best-effort ; A = vrai fix session |
| Circular require catalog↔commerce | catalog n’importe pas commerce |
| Draft produits en snapshot | Gallery filtre `published` déjà |
| Admin tracking cassé | Ne pas toucher analytics ; smoke admin sessions |
| Deploy accidentel | Interdit sans accord |

---

## 8. Scénarios de test bout-en-bout (recette user)

À faire **après** code + build, sur environnement autorisé par l’user (idéalement compte test ; **pas** casser stock prod réel sans pièce jetable).

### Recette R1 — Commande virement → vendu live

1. Navigateur A (anonyme ou client) : galerie meubles, noter une pièce `published` dispo.  
2. Navigateur B : login client test, ajouter panier, checkout **virement**, valider commande.  
3. Sans F5 sur A : la pièce passe vendue / indisponible.  
4. B : page Mes commandes montre la commande + item.

### Recette R2 — Annulation client → re-dispo live

1. Suite R1, B annule la commande (≤ 7j, non shipped).  
2. A toujours sur galerie : pièce redevient dispo **sans F5**.  
3. Firestore (console admin) : `sold:false`, `stock:1`.

### Recette R3 — Annulation admin

1. Commande pending, admin `AdminOrders` → annuler + restore.  
2. Visiteur galerie : re-dispo live (via A).  
3. Order disparue côté admin (delete actuel).

### Recette R4 — Non-régression tracking

1. Visiteur non-admin parcourt 2–3 pages.  
2. Admin → Analytics : session visible / pas d’explosion d’erreurs.  
3. Compte admin navigue le site : **pas** de session analytics admin (comportement existant).

### Recette R5 — Navigation coûts

1. Home only 1 min : pas de subscription furniture durable (devtools / absence appels firestore catalogue si observable).  
2. Entrée galerie : subscription démarre.  
3. Sortie about : subscription stop.

### Recette R6 — Planche multi (si catalogue en a)

1. Commander qty décrémentant sans sold-out.  
2. Cancel : stock +qty en base.  
3. UI reflète le stock (si affiché).

---

## 9. Journal d’exécution (à remplir par l’agent implémenteur)

| Date | Phase | Fait | Tests | Bloqueurs | Commit |
|------|-------|------|-------|-----------|--------|
| | 0 | | | | |
| | 1 | | | | |
| | 2 | | | | |
| | 3 | | | | |
| | 4 | | | | |
| | 5 | | | | |

**Notes libres :**

- …

---

## 10. Critères d’acceptation finaux (signature)

L’implémentation est **DONE** seulement si :

1. `npm run build` OK.  
2. Phase 1 restore stock correct en revue code (+ test si possible).  
3. Phase 2 live gallery/detail + anti-stale en code.  
4. Phase 3 invalidate branchée sans require circulaire.  
5. Recettes R1–R2 validées sur env autorisé **ou** explicitement reportées « en attente accord test prod/sandbox ».  
6. Analytics non touché.  
7. Aucun deploy silencieux.  
8. Journal section 9 complété.  
9. Note coûts Firebase ajoutée si live public gallery activé (`ANALYTICS_RELIABILITY.md` ou équivalent).

---

## 11. Message d’accueil pour l’agent implémenteur

Tu n’inventes pas une nouvelle archi. Tu appliques **A (live ciblé) + B (invalidate)** et tu **corriges le restore cancel** pour que le live ne mente pas.  
Tu commences par Phase 0–1, tu ne « optimises » pas le design, tu ne touches pas au tracking.  
Si un choix ambigu apparaît : **gallery/detail only**, **anti-stale obligatoire**, **pas de deploy**.

Fin du plan.
