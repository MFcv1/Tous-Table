# Analytics Reliability - Sessions et visiteurs uniques

Date: 2026-05-07

## Patch contact 2026-05-16 - Bouton WhatsApp public

Contexte: ajout d'un point de contact WhatsApp flottant sur le site public, sans recreer de lecture Firestore ni ajouter de SDK tiers.

Changements:

- `WhatsAppFloatingButton` reutilise le `contactInfo` deja charge par `App.jsx` via `sys_metadata/contact_info`.
- Le lien utilise le format `wa.me` avec numero normalise en format international et message pre-rempli encode.
- `AdminSEO` ajoute un champ optionnel `whatsapp`; s'il est vide, le bouton garde le telephone public existant comme fallback.
- `MyOrdersView` remplace le message "WhatsApp en cours d'integration" par un lien WhatsApp direct, en reutilisant les memes donnees de contact.
- Le panneau WhatsApp propose maintenant des intentions contextuelles, un message editable, un CTA WhatsApp et un CTA telephone fixes en bas du panneau mobile.
- Le fond d'ouverture reste transparent, le logo utilise une marque WhatsApp SVG, et les messages suppriment les formulations avec `(e)` ainsi que les URLs locales.

Tests:

```bash
node --input-type=module # verification normalizeWhatsAppPhone/buildWhatsAppUrl
node --input-type=module # verification wording getWhatsAppContext
npm run build
Chrome headless CDP # verification bouton visible et lien wa.me sur /meubles-anciens
Chrome headless CDP # verification mobile 390x844 et desktop 1366x768: CTA visibles, fond transparent, lien sans localhost
```

## Mission

Clarifier si les chiffres du dashboard admin representent vraiment des utilisateurs uniques, notamment quand 39 sessions donnent environ 20 visiteurs uniques sur la periode "1 jour".

Objectif technique: rendre le comptage plus fiable que le simple nombre de sessions, verifier l'acces IP cote serveur, exposer le niveau de confiance, et proteger les synchronisations de session contre les mises a jour falsifiees.

## Source de verite technique

- Collecte: `src/components/shared/AnalyticsProvider.jsx`
- Creation/sync serveur: `functions/src/analytics/sessions.js`
- Normalisation IP serveur: `functions/src/analytics/ip.js`
- Dashboard admin: `src/features/admin/AdminAnalytics.jsx`
- Calcul testable: `src/features/admin/analyticsReliability.js`
- Regles Firestore: `firestore.rules`, collection `analytics_sessions` en read admin only et write false cote client

## Acces IP verifie

L'IP n'est pas lue cote navigateur. Elle est lue cote Cloud Function depuis la requete serveur:

- priorite `x-forwarded-for`;
- fallbacks `x-appengine-user-ip`, `fastly-client-ip`, `cf-connecting-ip`, `x-real-ip`;
- fallback final `remoteAddress` / socket / `req.ip`.

La valeur est normalisee pour eviter les divergences entre:

- IPv4 mappee en IPv6 (`::ffff:x.x.x.x`);
- IPv4 avec port (`x.x.x.x:443`);
- chaine `Unknown`;
- liste de proxies `x-forwarded-for`.

Le dashboard affiche maintenant la couverture IP. Une session sans IP utilisable ne gonfle plus artificiellement le compteur "IPs uniques".

## Methode de comptage

Le dashboard distingue maintenant trois notions:

- `Sessions`: nombre brut de visites/session documents sur la periode.
- `Visiteurs Fiables`: identite dedupliquee par `userId` Firebase quand disponible, puis IP serveur, puis session en dernier recours.
- `IPs Uniques`: nombre d'adresses IP serveur distinctes, utile pour mesurer les reseaux/foyers et verifier le cas "la meme personne revient plusieurs fois".

Pourquoi ne pas utiliser uniquement l'IP:

- meme Wi-Fi/NAT: plusieurs personnes peuvent partager une IP, donc l'IP sous-compte;
- VPN/mobile/IPv6 privacy: une meme personne peut changer d'IP, donc l'IP sur-compte;
- Firebase anonymous auth donne un UID stable par navigateur/appareil, souvent plus fiable pour les retours multiples sur le meme appareil.

Conclusion pratique: si 39 sessions donnent 20 IPs uniques, cela veut dire "20 reseaux/IP detectes", pas forcement 20 personnes physiques. Le nouveau KPI "Visiteurs Fiables" donne l'estimation la plus robuste disponible sans cookies tiers invasifs.

## Protection de veracite

Chaque nouvelle session recoit un `syncToken` retourne uniquement au client qui a cree la session. Firestore stocke seulement le hash du token (`syncTokenHash`).

Les endpoints suivants verifient ce token avant d'accepter une mise a jour:

- `syncSession`;
- `syncSessionBeacon`.

Les anciennes sessions sans hash restent compatibles pour ne pas casser les onglets ouverts avant deploiement, mais les nouvelles sessions sont durcies.

Les donnees de parcours sont aussi bornees:

- chunk limite a 25 etapes par sync;
- duree limitee a 24h;
- chaines tronquees avant ecriture.

## Changements realises

- Ajout `functions/src/analytics/ip.js` pour une IP serveur commune a `sessions.js`, `adminIP.js` et `updateUserSessions.js`.
- Ajout `syncToken` + `syncTokenHash` pour empecher une synchronisation sans preuve de possession de la session.
- Ajout de metadonnees session: `ipMeta`, `authProvider`, `visitorIdentity`, `analyticsVersion`.
- Dashboard admin: KPIs separes `Sessions`, `Visiteurs Fiables`, `IPs Uniques`, `Couverture IP`, `Rebond`, `Mobile`.
- Graphique principal: barres basees sur visiteurs fiables par creneau, tooltip indiquant aussi les sessions si different.
- Requete admin elargie a une fenetre locale d'1 an, plafonnee a 5000 sessions avec indicateur de fiabilite si le plafond est atteint.
- Ajout du verifier `npm run verify:analytics-reliability`.
- Ajout du verifier au `npm run preflight:prod`.

## Tests

Commande cible:

```bash
npm run verify:analytics-reliability
```

La commande couvre:

- meme IP + plusieurs sessions = 1 IP unique et 1 visiteur fiable si aucun UID;
- meme UID anonyme + IPs differentes = 1 visiteur fiable mais 2 IPs uniques;
- IP `Unknown` exclue du compteur IP et visible dans la couverture;
- deduplication du graphique par creneau;
- bornes de fenetre et nombre de slots stables pour `1h`, `1j`, `7j`, `1mois`, `1ans`;
- `avgDuration`, `bounceRate`, `mobilePercentage` et normalisation des durees invalides;
- detection de fenetre plafonnee quand la lecture atteint `MAX_ANALYTICS_SESSIONS`;
- normalisation IP backend (`x-forwarded-for`, IPv4 mappee IPv6, IPv4 avec port).

## Audit 2026-05-07 - Mise a jour dashboard

- UI sessions: l'IP est maintenant affichee comme une ligne dediee sous la ville et le device, visible sur mobile et desktop.
- Snapshot admin: un seul listener Firestore lit la fenetre locale d'1 an; le changement de filtre ne recree plus inutilement le listener.
- Fenetres glissantes: les KPIs et le graphe sont recalcules depuis `sessions + timeFilter + now`, donc les filtres se mettent a jour quand l'horloge locale avance, meme sans nouveau snapshot.
- Rebond: les sessions sans parcours ou avec 0/1 etape comptent comme rebond, ainsi que les sessions de moins de 10 secondes.
- Duree moyenne: les durees sont normalisees entre 0 et 24h avant moyenne pour eviter qu'une valeur corrompue fausse le KPI.
- Graphique: chaque creneau deduplique les visiteurs fiables; le tooltip garde le nombre de sessions quand il differe du nombre de visiteurs.

Avant de deployer:

```bash
npm run verify:analytics-reliability
npm run verify:functions-syntax
npm run build
```

Pour un deploy prod, respecter `AGENTS.md`: obtenir l'accord explicite puis lancer `npm run preflight:prod`.

## Refonte 2026-05-08 - Reprise de session et organisation par visiteur

Contexte verifie en lecture seule sur Firestore prod `tousatable-client`:

- la serie Bordeaux vue dans `imagecodex/` correspondait a un meme visiteur technique;
- les sessions partageaient la meme IP complete, le meme UID Firebase anonyme et le meme device `Mobile Android Chrome`;
- aucune IP complete ni UID complet ne doit etre recopie dans les reponses ou documents.

Cause racine confirmee:

- `AnalyticsProvider.jsx` persistait `analytics_session_id` et `analytics_session_token` en `sessionStorage`;
- avant cette refonte, ces valeurs n'etaient pas relues au montage;
- chaque reload/remontage complet rappelait donc `initLiveSession`, et le backend creait un nouveau document.

Changements realises:

- Le client relit maintenant `analytics_session_id` + `analytics_session_token` au demarrage.
- `initLiveSession` accepte une demande de reprise (`resumeSessionId`, `resumeSyncToken`).
- La reprise est acceptee seulement si:
  - le document existe;
  - le `syncToken` correspond au hash stocke;
  - le `userId` de la session correspond a l'UID Firebase authentifie;
  - la derniere activite date de moins d'1 heure;
  - la session n'est pas une session admin.
- Si la reprise echoue, le comportement historique reste valable: une nouvelle session est creee.
- La duree de session reprise repart depuis `startedAtMs` renvoye par le backend, pour ne pas ecraser la duree existante avec une valeur plus basse apres reload.
- Les logs de `updateUserSessions` masquent maintenant email et IP via hash court au lieu d'ecrire les valeurs brutes.
- Le dashboard traffic affiche maintenant:
  - jours filtres selon le filtre actif (`1h`, `1j`, `7j`, etc.);
  - rectangles de visiteurs fiables par jour;
  - dans chaque rectangle, les sessions de ce visiteur;
  - dans chaque session, le tracking/parcours existant via `Tracer`.
- Le KPI principal affiche aussi:
  - le ratio `utilisateurs uniques / IPs uniques`;
  - un score de confiance de 0 a 100 base sur la proximite UID/IP, la couverture IP,
    l'usage du fallback session et le plafonnement eventuel de la fenetre.
- Coherence dashboard:
  - les KPIs, le graphique et les rectangles utilisent la meme identite `getVisitorIdentity`;
  - les rectangles visiteurs sont calcules depuis la meme fenetre glissante que les KPIs;
  - la somme des sessions des rectangles correspond a `Sessions`;
  - le nombre de rectangles visiteurs uniques correspond a `Visiteurs Fiables`;
  - le graphique deduplique les visiteurs par creneau, donc la somme des barres peut etre superieure a `Visiteurs Fiables` si un meme visiteur revient sur plusieurs creneaux.

Choix de securite:

- Pas de fusion serveur agressive par IP seule.
- Pas de reutilisation d'une session sans preuve de possession du `syncToken`.
- Audit du 2026-05-08: la reprise exige maintenant explicitement un `syncTokenHash`
  existant et un `userId` strictement identique a l'UID Firebase authentifie; la
  compatibilite legacy sans hash reste limitee aux syncs d'anciennes sessions.
- Audit post-deploiement 2026-05-08: pour eviter les sessions inutiles quand un
  meme visiteur revient dans une fenetre courte, le client conserve aussi
  `analytics_session_id` et `analytics_session_token` dans `localStorage`, et la
  fenetre de reprise serveur est portee a 1 heure. Au-dela, une nouvelle session
  reste creee.
- L'IP reste une aide de diagnostic, pas une identite certaine.

Commandes de verification cible:

```bash
npm run verify:analytics-reliability
npm run verify:functions-syntax
npm run build
```

## Limites restantes

- Sans consentement et sans fingerprinting invasif, il est impossible de garantir "1 personne physique exacte".
- Un meme visiteur sur deux appareils peut compter comme deux visiteurs fiables, sauf s'il se connecte avec le meme compte.
- Plusieurs personnes derriere la meme box peuvent rester une seule IP unique.
- Un VPN ou une IP mobile changeante peut augmenter le compteur IP unique.
- Les sessions historiques creees avant cette mission n'ont pas `syncTokenHash`, `ipMeta` ni `authProvider`; le dashboard conserve une compatibilite de lecture.

## Patch quota 2026-05-10 - Reduction lectures et heartbeats publics

Contexte: apres deploy prod, les quotas Firestore/Hosting ont augmente fortement. Analyse v50 -> v56.5:

- `publicCatalog` n'existait pas en v50 et relisait 4 collections completes a chaque appel.
- Le frontend appelait `publicCatalog` au demarrage, y compris sur les pages qui n'ont pas besoin du catalogue complet.
- Le tracking v50 synchronisait deja toutes les 15 secondes, mais la version durcie relit maintenant le document de session pour verifier le `syncToken`, donc chaque heartbeat consomme aussi une lecture.

Changements:

- Cache memoire 5 minutes dans `functions/src/public/catalog.js`, avec cache HTTP plus long.
- Suppression de l'appel `publicCatalog` initial systematique dans `src/App.jsx`; au 2026-05-10 le fallback restait utilise uniquement si les lectures publiques directes echouaient. Ce point est remplace par le patch 2026-05-11 ci-dessous pour reduire les lectures Firestore publiques.
- `AnalyticsProvider` demarre apres 6 secondes, ignore les user-agents de bots connus, synchronise toutes les 60 secondes au lieu de 15, et deduplique les beacons de fermeture.
- Dashboard admin: dans le parcours utilisateur, la duree affichee sur une ligne est maintenant estimee comme le temps passe sur cette page/etape. Techniquement, l'ancien tracking stocke la duree ecoulee avant l'etape suivante; l'admin utilise donc l'etape suivante, puis la duree totale de session pour la derniere ligne.
- Correction sessions longues sans parcours: avant chaque heartbeat ou beacon, si aucune etape n'a encore ete enregistree, le client force l'enregistrement de la page courante. Cela couvre les cas Safari/iOS ou detail produit non encore resolu, ou la session recevait une duree mais gardait `journey: []`.
- Correction durees gonflees iOS/Safari: la duree envoyee n'est plus le temps horloge depuis l'ouverture de la session, mais un temps actif approxime. Le chrono est mis en pause quand l'onglet passe cache/arriere-plan, puis repris quand il redevient visible. Les iPhone sont aussi classes `iOS` avant le fallback `MacOS`, car leur user-agent contient `like Mac OS X`.

Tests:

```bash
npm run verify:analytics-reliability
npm run verify:functions-syntax
```

## Patch quota 2026-05-11 - Catalogue public cache et warmup image

Contexte: le releve Firebase du dimanche 10 mai 2026 montre 73 k lectures Firestore sur 50 k incluses/jour et 360,8 MB de downloads Hosting sur 360 MB inclus/jour. Les ecritures, Functions et stockage restent dans les quotas inclus.

Changements:

- Les visiteurs publics utilisent maintenant `publicCatalog` comme source cachee pour les routes catalogue actives, au lieu d'ouvrir directement des listeners Firestore temps reel sur les collections completes.
- Les listeners Firestore complets restent conserves pour l'admin et comme fallback si `publicCatalog` echoue, afin de ne pas bloquer le catalogue public.
- `AdminShop` limite le listener `affiliate_clicks` aux 3000 derniers clics, comme `AdminAnalytics`, au lieu de lire toute la collection en live.
- Le warmup desktop des planches charge maintenant `hero-planches-2026-1672.webp` au lieu de `hero-planches-2026-exact.png`, ce qui evite un prechargement d'environ 2 MB sans changer l'image rendue.

Tests:

```bash
npm run verify:functions-syntax
npm run verify:analytics-reliability
npm run build
```

## Patch quota 2026-05-11 - Admin manuel et petits contenus caches

Contexte: apres les optimisations catalogue, les surfaces restantes a blinder sans casser le site etaient les gros ecrans admin et les petits documents publics lus en temps reel.

Changements:

- `AdminAnalytics` ne garde plus de listeners live larges sur `analytics_sessions` et `affiliate_clicks`; les donnees sont chargees a l'ouverture puis via le bouton `Actualiser`.
- `AdminDashboard` ne relit plus `furniture` et `cutting_boards` pour ses stats stock/encheres; il reutilise les donnees catalogue deja chargees par l'app admin.
- Le footer ne relit plus `contact_info`; il recoit les infos deja chargees par `App.jsx`.
- `contact_info`, `theme_settings`, `homepage_images` et `shop_tutorials` passent en lecture simple avec cache local cote navigateur.
- L'ancien ecran `AdminComments.jsx` a ete supprime car les commentaires produits ne sont plus une fonctionnalite active.

Tests:

```bash
npm run build
```

## Patch UX/cout 2026-05-11 - Bouton Actualiser data admin

Contexte: l'onglet admin `Data` rechargeait `analytics_sessions` a chaque retour sur l'onglet, car `AdminAnalytics` est demonte/remonte par le routeur admin. Le bouton `Actualiser` faisait bien un vrai `getDocs`, mais son interet etait peu visible puisque l'arrivee sur la page relisait deja Firestore.

Changements:

- `AdminAnalytics` garde maintenant en cache memoire les sessions analytics deja chargees pendant la session admin courante.
- `BoutiqueAnalytics` garde aussi en cache memoire les 3000 derniers `affiliate_clicks`.
- L'onglet `Data` ne lance plus de lecture Firestore automatique au montage; il affiche les donnees deja gardees en memoire pendant la session admin.
- Le bouton `Actualiser` devient le seul declencheur d'une nouvelle lecture Firestore et met a jour l'heure de derniere MAJ.
- Pendant un refresh manuel, les donnees deja affichees restent visibles; seul le bouton passe en etat de chargement.
- Apres un refresh manuel, les KPIs et les barres des graphiques rejouent une animation d'apparition.

Tests:

```bash
npm run build
```

## Correctif coherence Data admin 2026-05-11

Contexte: apres le passage au bouton `Actualiser` manuel, les KPI et le graphique pouvaient afficher temporairement 0 ou une valeur decalee par rapport aux rectangles de tracking, car ils etaient stockes dans des `useState` recalcules apres le rendu alors que les rectangles etaient calcules directement depuis les sessions filtrees.

Changements:

- `AdminAnalytics` derive maintenant KPI, qualite de donnees, graphique et rectangles depuis le meme `analyticsStats` synchrone.
- Les rectangles utilisent `analyticsStats.realTraffic`, la meme source filtree que `kpis.totalSessions` et `chartData`.
- Le cache memoire des sessions chargees par `Actualiser` reste la source affichee quand on quitte puis revient sur l'onglet `Data`.
- Aucune lecture Firestore automatique n'a ete rajoutee au montage.

Tests:

```bash
npm run verify:analytics-reliability
npm run build
```

## Verification Data admin 2026-05-12

Objectif: verifier que le bouton `Actualiser` de l'onglet Data admin recharge bien la source affichee et que les KPI au-dessus du graphique, le graphique et les rectangles de tracking utilisent tous la meme data datee du dernier refresh.

Constat code:

- `AdminAnalytics` ne contient pas de listener live `onSnapshot`; la lecture `analytics_sessions` passe par `getDocs` dans `loadSessions`.
- L'heure `Maj` est `cachedAnalyticsSessionsLoadedAt`, mise a jour uniquement apres succes du refresh manuel.
- Les KPI, la qualite data, le graphique et les rectangles de visiteurs sont derives du meme `analyticsStats`.
- Les rectangles utilisent `analyticsStats.realTraffic`, la meme fenetre filtree que `kpis.totalSessions` et `chartData`.
- `BoutiqueAnalytics` garde aussi un refresh manuel: clics affiliés via `getDocs(limit(3000))` et sessions via `onRefreshSessions`.

Correctif ajoute:

- `loadSessions` synchronise maintenant `now` avec l'heure reelle de fin du refresh. Le clic `Actualiser` recalcule donc immediatement la fenetre, les KPI, le graphique et les rectangles avec la meme horloge que la derniere MAJ affichee, sans attendre le tick automatique suivant.

Tests:

```bash
npm run verify:analytics-reliability
npm run build
```

## Correctif Data admin 2026-05-12 - Cache navigateur et heures Comptoir

Contexte: apres fermeture/reouverture complete de l'admin, les variables de cache module
etaient perdues. Comme la page Data ne relit plus Firestore automatiquement pour limiter les
couts, l'affichage repartait a 0 jusqu'au prochain clic `Actualiser`.

Constat prod en lecture seule:

- `affiliate_clicks` ne contient actuellement aucun document lu dans l'audit borne.
- Des sessions recentes contiennent bien des etapes Comptoir.
- Exemple anonymise: une session demarre a 20:12:23, mais sa premiere etape `shop`
  est a 20:14:29. Le graphique Boutique utilisait jusque-la `session.startedAt`, ce
  qui pouvait bucketter la visite Comptoir au mauvais creneau par rapport au tracing.

Changements:

- `AdminAnalytics` restaure maintenant le dernier snapshot `analytics_sessions` depuis
  IndexedDB pendant 6h, puis le met a jour uniquement apres clic `Actualiser`.
- `BoutiqueAnalytics` restaure aussi le dernier snapshot `affiliate_clicks` depuis
  IndexedDB pendant 6h.
- Si un nouveau navigateur n'a aucun cache local valide, l'admin effectue une seule
  lecture initiale bornee pour reconstruire l'affichage, puis repasse au mode cache +
  bouton `Actualiser`. Cela retrouve le comportement cross-navigateur de v56 sans
  remettre les listeners live permanents.
- Les snapshots caches omettent `email`, `syncTokenHash` et `userAgent`; ils restent
  locaux au navigateur admin et expirent automatiquement.
- La fenetre de calcul admin reste ancree sur l'heure de derniere MAJ, au lieu de
  glisser vers l'heure courante apres reouverture. Le statut live garde une horloge
  separee.
- Les nouvelles etapes `journey` envoient `timestampMs` et `timeZone`; la Function
  les valide et les stocke si la valeur est bornee.
- Les visites Comptoir Boutique utilisent maintenant la premiere etape Comptoir
  horodatee. Les anciennes sessions sans `timestampMs` utilisent un fallback base sur
  `journey[*].time` et la date de debut de session.
- Le graphique Boutique aligne ses creneaux sur les heures rondes. Une visite a
  20:14 est donc affichee dans le slot `20h`, et non dans le slot precedent cree par
  une fenetre glissante non alignee.
- Le graphique Traffic admin applique le meme alignement de creneaux: les barres sont
  bucketees sur les minutes/heures/jours reels au lieu d'heriter du decalage de
  l'heure de derniere MAJ.
- L'onglet Boutique affiche maintenant un bloc `Tracking Comptoir` par jour/session:
  passages sur la grille, fiches Comptoir vues, produits concernes, clics affiliés,
  source/origine quand disponible, et fallback depuis `affiliate_clicks` si un clic
  serveur existe sans etape `journey` equivalente.

Tests:

```bash
npm run verify:analytics-reliability
npm run verify:functions-syntax
npm run build
```

## Patch catalogue live stock 2026-08 — gallery|detail only

Contexte: chantier live catalogue stock (`_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md`, `_DOCS/todo.md`). Objectif: statut sold/stock à jour en 1–3 s sur galerie et fiche produit, sans rouvrir des listeners publics sur toutes les vues.

Décision coûts (alignée AGENTS.md):

- **Live public stock** : `onSnapshot` uniquement si `view === 'gallery' || view === 'detail'`, collection meubles **ou** planches selon la vue (pas les deux systématiquement).
- **Home / shop / about / checkout** : pas de live stock public durable — bootstrap `publicCatalog` HTTP uniquement.
- **Admin** : live inchangé (déjà nécessaire pour l’édition).
- **Anti-stale** : `liveCollectionsRef` empêche une réponse HTTP tardive d’écraser une collection déjà live.
- **Cache CF** : `invalidatePublicCatalogCache()` après mutations stock (`createOrder` deferred/reservation, `cancelOrderClient`) ; headers `max-age=60, s-maxage=120, stale-while-revalidate=60` (best-effort multi-instance).
- **Analytics** : non modifié (`AnalyticsProvider` / `AdminAnalytics` hors scope).

Impact attendu vs full live public: lectures Firestore limitées aux visiteurs réellement sur galerie/fiche, unsub hors de ces vues.

## Observabilité checkout 2026-08-29 — diagnostic sans PII

`createOrder` écrit désormais un événement structuré `checkout_order_event` pour chaque tentative utile du parcours actif : rejet avant commande, échec transactionnel ou commande virement créée.

Champs volontairement limités :

- `attemptId` généré dans le navigateur pour corréler une tentative ;
- empreinte SHA-256 tronquée du UID Firebase, jamais le UID brut ;
- méthode de paiement et nombre de lignes panier ;
- résultat et motif normalisé (`email_unverified`, `invalid_shipping`, `invalid_items`, code stock, erreur interne, etc.) ;
- `orderId` seulement après création.

Ne sont jamais journalisés dans ces événements : e-mail, téléphone, adresse, raison sociale, SIRET, TVA, contenu de `shipping` ou token Firebase. Le client ne met plus les coordonnées complètes dans la console après commande.

Objectif : lors d'un futur incident, retrouver précisément si la tentative a été bloquée par l'e-mail non vérifié, le formulaire, le stock ou une erreur interne, sans exposer les données de facturation dans Cloud Logging. Stripe est désactivé et hors du parcours client analysé.

## Sécurité analytics 2026-08-29 — purge développeur uniquement

- `deleteSession`, `clearAllSessions` et `clearAllAffiliateClicks` exigent désormais
  `checkIsSuperAdmin`; un custom claim `admin` seul ne suffit plus.
- Les corbeilles de sessions et les boutons `Purger Data` restent visibles uniquement
  pour `matthis.fradin2@gmail.com`.
- Le reset des clics depuis `AdminShop` n'efface plus directement Firestore : il passe
  par la callable protégée `clearAllAffiliateClicks`.
- Les administrateurs secondaires conservent la lecture, les filtres et le bouton
  `Actualiser`.
- Les règles Firestore refusent toute suppression directe de `affiliate_clicks`.

Tests locaux : `node --test functions/helpers/security.test.js`,
`node scripts/verify-dangerous-admin-boundary.mjs`,
`npm run verify:analytics-reliability` et `npm run build` réussis.

État : non déployé au 2026-08-29.
