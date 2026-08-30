# Deploiement production - Runbook

Objectif: deployer les corrections frontend/functions sans importer la sandbox et sans modifier les meubles deja publies en production.

## Regles de securite

- Ne jamais importer les meubles sandbox vers `tousatable-client`.
- Ne pas ecrire dans Firestore prod pour les categories legacy.
- Ne jamais se fier au projet Firebase courant du CLI pour la prod.
- Toujours passer `--project tousatable-client` dans les commandes prod.
- Ne pas utiliser `npm --prefix functions run deploy` pour la prod: ce script n'a pas de `--project` explicite.
- Les anciens meubles prod sont ranges cote frontend via `src/data/legacyFurnitureCategories.js`.
- La dette et la migration future du mapping categories sont documentees dans `_DOCS/LEGACY_FURNITURE_CATEGORY_MAPPING.md`.
- Les nouveaux meubles publies par l'admin doivent utiliser le champ Firestore `category`.
- Ne pas lancer Hosting prod si `npm run preflight:prod` ne passe pas.
- Ne pas activer les paiements carte en production avec une cle Stripe test.
- Pour le lancement sans carte, Stripe JS reste inactif tant qu'aucune vraie cle `pk_` n'est fournie au build.

## Gates obligatoires

```bash
npm run verify:prod-env
npm run verify:env-parity
npm run verify:prod-furniture
npm run verify:functions-syntax
npm run build:prod
npm run verify:prod-bundle
npm run audit:functions-env -- --project=tousatable-client
```

Commande equivalente:

```bash
npm run preflight:prod
```

Le dashboard `npm run dashboard` applique aussi ce gate automatiquement des que
`PRODUCTION` est selectionne, quel que soit le type de deploiement. Si le preflight
echoue, aucune commande `firebase deploy` n'est lancee. La couche d'execution refuse
egalement tout deploiement prod qui n'est pas precede d'un preflight reussi dans la
meme session. Pour Hosting ou un deploiement complet, le build valide par le preflight
est reutilise sans recompilation.

Etat attendu:

- `verify:prod-env` passe si `.env.prod` pointe vers Firebase prod.
- `verify:env-parity` compare sans lire les donnees les Functions, IAM, versions de secrets attachees, Auth, App Check, reCAPTCHA, rules, index, APIs et headers Hosting entre `sandboxtat` et `tousatable-client`.
- Stripe live est exige uniquement quand `VITE_STRIPE_CARD_PAYMENTS_ENABLED=true`.
- `verify:prod-furniture` confirme que chaque meuble prod a une categorie Firestore valide ou un fallback dans le mapping legacy.
- `verify:functions-syntax` verifie au minimum l'entrypoint Functions et la correction analytics.
- `build:prod` produit un bundle prod optimise.
- `verify:prod-bundle` bloque si le bundle contient une config sandbox, une cle Stripe test, un placeholder Stripe ou le loader Stripe actif alors que les paiements carte sont desactives.
- `audit:functions-env` affiche seulement des compteurs, jamais les valeurs sensibles.

## Variables `.env.prod`

`.env.prod` est ignore par git. Il doit rester local.

Valeurs attendues:

- `VITE_FIREBASE_PROJECT_ID=tousatable-client`
- `VITE_FIREBASE_AUTH_DOMAIN=tousatable-client.firebaseapp.com`
- `VITE_FIREBASE_STORAGE_BUCKET=tousatable-client.firebasestorage.app`
- `VITE_FIREBASE_APP_ID=1:1047064824334:web:6d0d281e31845ad0814a5f`
- `VITE_APP_LOGICAL_NAME=tat-made-in-normandie`
- `VITE_RECAPTCHA_ENTERPRISE=true`
- `VITE_STRIPE_CARD_PAYMENTS_ENABLED=false` pour le lancement sans carte
- `VITE_STRIPE_PUBLIC_KEY=pk_live_...` uniquement si les paiements carte sont actives

Decision actuelle: les paiements carte sont desactives pour le lancement. Si Stripe carte est reactive plus tard, recuperer la cle publique live depuis Stripe Dashboard et passer `VITE_STRIPE_CARD_PAYMENTS_ENABLED=true`.
Avec `VITE_STRIPE_CARD_PAYMENTS_ENABLED=false`, le checkout force le paiement differe et le frontend ne charge Stripe que si `VITE_STRIPE_PUBLIC_KEY` commence par `pk_`.

## Ordre recommande

1. Lancer `npm run preflight:prod`.
2. Si les Functions doivent etre corrigees en prod, deployer les Functions avant Hosting.
3. Relancer l'audit Functions apres deploiement.
4. Deployer Hosting prod seulement apres preflight vert.
5. Faire les smoke tests prod.

## Commandes de deploiement

Functions seules:

```bash
firebase deploy --only functions --project tousatable-client
```

Hosting seul:

```bash
firebase deploy --only hosting --project tousatable-client
```

Deploiement complet cible:

```bash
npm run preflight:prod
firebase deploy --only functions --project tousatable-client
firebase deploy --only hosting --project tousatable-client
```

## Smoke tests prod

- Home charge correctement.
- Galerie charge les meubles prod.
- Filtres categories: buffet, table, chaise, armoire, commode, autre.
- Une fiche produit directe charge images, prix, dimensions et CTA panier.
- Panier et checkout proposent Virement / Wero.
- Carte / Wallets restent masques tant que `VITE_STRIPE_CARD_PAYMENTS_ENABLED=false`.
- Comptoir / boutique affiliation charge les produits publies.
- Admin login fonctionne.
- Admin publication: verifier qu'un nouveau meuble sauvegarde bien `category`.
- Analytics: verifier absence de 500 `syncSessionBeacon` sur session manquante.
- Fallback catalogue: verifier `https://us-central1-tousatable-client.cloudfunctions.net/publicCatalog` retourne les collections publiques.

## Rollback

Hosting:

- Option la plus sure: Firebase Console -> Hosting -> Releases -> choisir la release precedente -> Roll back.
- CLI possible seulement si un channel de rollback a ete prepare:

```bash
firebase hosting:channel:list --project tousatable-client
firebase hosting:clone tousatable-client:CHANNEL_ID tousatable-client:live --project tousatable-client
```

Functions:

- Revenir au commit precedent.
- Redeployer uniquement les Functions:

```bash
firebase deploy --only functions --project tousatable-client
```

Donnees:

- Pas de rollback data prevu pour les categories, car la strategie actuelle ne modifie pas Firestore prod.
