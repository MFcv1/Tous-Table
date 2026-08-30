# Readiness production - Etat actuel

Date: 2026-05-08

Verdict: deploye en production le 2026-05-08 sur Hosting uniquement, en ciblant explicitement `--project tousatable-client`. Les Functions n'ont pas ete redeployees car les changements etaient frontend.

Decision paiement: les paiements carte ne font pas partie du lancement actuel. `.env.prod` force `VITE_STRIPE_CARD_PAYMENTS_ENABLED=false`, le reglage prod `sys_metadata/payment_settings` est deja `stripeEnabled=false` en lecture seule, et Stripe JS n'est importe dynamiquement que si une vraie cle `pk_` est fournie.

## Ce qui est pret

- Build sandbox/local: OK via `npm run build`.
- Mapping categories meubles prod: OK via `npm run verify:prod-furniture`.
- Anciens meubles prod: couverts par mapping ID frontend, sans ecriture Firestore.
- Nouveaux meubles: `item.category` reste prioritaire.
- `syncSessionBeacon`: correction locale pour traiter une session absente comme non fatale.
- `publicCatalog`: fallback HTTP public deploye pour hydrater galerie/comptoir si App Check/reCAPTCHA bloque une lecture Firestore publique cote navigateur.
- Garde build prod: `npm run build:prod` bloque si la config n'est pas prod. Stripe live est exige uniquement si `VITE_STRIPE_CARD_PAYMENTS_ENABLED=true`.
- Stripe frontend: la promesse Stripe retourne `null` sans vraie cle `pk_`, donc le loader Stripe n'est pas appele pour le lancement sans carte.
- Preflight unique: `npm run preflight:prod`.
- Syntaxe Functions: `npm run verify:functions-syntax`.
- Bundle prod: `npm run verify:prod-bundle`.
- Audit Functions env: `npm run audit:functions-env -- --project=tousatable-client`.
- Runbook prod: `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`.

## Preuves recentes

Deploiement Hosting du 2026-05-08 - checkout virement/Wero et footer mobile :

- Accord utilisateur explicite : demande "deploy en prod [production_workflow.md](.agent/workflows/production_workflow.md)".
- Workflow lu : `.agent/workflows/production_workflow.md`.
- Runbook prod lu : `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`.
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/meubles-anciens` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/planches-a-decouper-anciennes` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/comptoir` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/admin` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Deploiement volontairement limite : Hosting uniquement ; aucune Function, aucune regle Firestore/Storage et aucune ecriture Firestore prod.

Deploiement Functions analytics + Hosting du 2026-05-08 - reprise session 1h et KPI unique :

- Accord utilisateur explicite : demande "deploy en prod ! .agent\workflows\production_workflow.md".
- Workflow lu : `.agent\workflows\production_workflow.md`.
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only functions:initLiveSession,functions:syncSession,functions:syncSessionBeacon,functions:updateUserSessions --project tousatable-client` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Audit Functions prod apres deploy : 30 Functions, 30 avec legacy env vars, 90 legacy env vars au total, 11 secrets attaches ; aucune valeur sensible affichee.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/meubles-anciens` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/planches-a-decouper-anciennes` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/comptoir` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/admin` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Deploiement volontairement limite : Functions analytics ciblees + Hosting ; aucune regle Firestore/Storage redeployee et aucune ecriture Firestore prod.

Deploiement Functions analytics + Hosting du 2026-05-08 - fiabilite visiteurs uniques :

- Accord utilisateur explicite : demande "ok deploy en prod avec .agent\workflows\production_workflow.md".
- Workflow lu : `.agent\workflows\production_workflow.md`.
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only functions:initLiveSession,functions:syncSession,functions:syncSessionBeacon,functions:updateUserSessions --project tousatable-client` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Audit Functions prod apres deploy : 30 Functions, 30 avec legacy env vars, 90 legacy env vars au total, 11 secrets attaches ; aucune valeur sensible affichee.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/meubles-anciens` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/planches-a-decouper-anciennes` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/comptoir` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/admin` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Deploiement volontairement limite : Functions analytics ciblees + Hosting ; aucune regle Firestore/Storage redeployee et aucune ecriture Firestore prod.

Deploiement Hosting du 2026-05-08 - reveal mobile preloader titre :

- Accord utilisateur explicite : demande "push en prod".
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/meubles-anciens` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/planches-a-decouper-anciennes` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/comptoir` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/admin` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Non deploye volontairement : Functions et Firestore rules, car la passe ne concernait que le frontend Hosting.

Deploiement Hosting du 2026-05-08 - optimisations mobiles Comptoir/recommandations :

- Accord utilisateur explicite : demande "deploy en prod".
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/meubles-anciens` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/planches-a-decouper-anciennes` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/comptoir` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/admin` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Non deploye volontairement : Functions et Firestore rules, car la passe ne concernait que le frontend Hosting.

Deploiement Hosting + Firestore rules du 2026-05-08 - retrait newsletter :

- Accord utilisateur explicite : demande "deploy en prod".
- `npm run preflight:prod` : OK.
- `firebase deploy --only hosting,firestore:rules --project tousatable-client` : OK.
- Firestore rules compilees et publiees : `newsletter_subscribers` bloque cote client (`allow read, create, update, delete: if false`).
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/meubles-anciens` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/planches-a-decouper-anciennes` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/comptoir` HTTP 200.
- Smoke public : `https://tousatable-madeinnormandie.fr/admin` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Verification bundle local `dist`/`src` : aucune reference active a `NewsletterModal`, `AdminNewsletter`, `newsletter_subscribers`, `newsletterSubscribed`, `newsletterDismissed` ou `showNewsletter`.

Deploiement Hosting du 2026-05-08 - preloader et marketplace :

- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.

`npm run preflight:prod` du 2026-05-08 apres ajustements preloader :

- Firebase prod valide.
- Mapping meubles prod valide : 29 meubles prod, mapping 29, aucun manquant, aucun extra, aucune categorie invalide.
- SEO roadmap : 16 checks passes.
- Analytics reliability : OK.
- Syntaxe Functions : OK.
- Build prod : OK.
- Bundle prod : OK, aucune config sandbox ni loader Stripe actif.
- Audit Functions prod : 30 Functions, 30 avec legacy env vars, 90 legacy env vars au total, 11 secrets attaches ; aucune valeur sensible affichee.

Deploiement Hosting du 2026-05-08 :

- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smoke public : `https://tousatable-madeinnormandie.fr/` HTTP 200.
- Smoke public : `https://tousatable-client.web.app/` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.

`npm run preflight:prod` du 2026-05-08 :

- Firebase prod valide.
- Mapping meubles prod valide : 29 meubles prod, mapping 29, aucun manquant, aucun extra, aucune categorie invalide.
- SEO roadmap : 16 checks passes.
- Analytics reliability : OK.
- Syntaxe Functions : OK.
- Build prod : OK.
- Bundle prod : OK, aucune config sandbox ni loader Stripe actif.
- Audit Functions prod : 30 Functions, 0 legacy env vars, 11 secrets attaches ; aucune valeur sensible affichee.

`npm run verify:prod-furniture`:

- Projet lu: `tousatable-client`.
- Namespace: `tat-made-in-normandie`.
- Meubles prod: 28.
- Mapping legacy: 28.
- Manquants: 0.
- Extras: 0.
- Categories invalides: 0.
- Repartition: buffet 7, table 13, autre 2, commode 2, chaise 1, armoire 3.

`npm run preflight:prod`:

- OK.
- Firebase prod valide.
- Mapping meubles prod valide.
- Syntaxe Functions valide.
- Build prod OK.
- Bundle prod valide: pas de config sandbox, pas de cle Stripe test, pas de placeholder Stripe, pas de loader Stripe actif.
- Audit Functions prod execute sans afficher de valeurs sensibles.

`npm run audit:functions-env -- --project=tousatable-client` apres deploiement:

- Functions prod: 30.
- Functions avec legacy env vars: 30.
- Total legacy env vars: 198.
- Secrets attaches: 11.
- Aucune valeur sensible affichee par le script.

Deploiement Hosting du 2026-05-12 :

- Accord utilisateur explicite recu pour deployer en prod avec `.agent\workflows\production_workflow.md`.
- Runbook prod relu : `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`.
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- Mapping meubles prod valide : 30 meubles prod, mapping 30, aucun manquant, aucun extra, aucune categorie invalide.
- SEO roadmap : 16 checks passes.
- Analytics reliability : OK.
- Syntaxe Functions : OK.
- Build prod : OK. Avertissement Vite conserve sur certains chunks > 500 kB.
- Bundle prod : OK, aucune config sandbox ni loader Stripe actif.
- Audit Functions prod : 30 Functions, 30 avec legacy env vars, 90 legacy env vars au total, 11 secrets attaches ; aucune valeur sensible affichee.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smokes publics : `/`, `/meubles-anciens`, `/planches-a-decouper-anciennes`, `/comptoir`, `/admin`, `https://tousatable-client.web.app/` et `publicCatalog` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Deploiement Hosting du 2026-05-12 - ajustements UX Comptoir :

- Accord utilisateur explicite recu pour deployer en prod avec `.agent\workflows\production_workflow.md`.
- Workflow prod et runbook prod relus.
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- Mapping meubles prod valide : 30 meubles prod, mapping 30, aucun manquant, aucun extra, aucune categorie invalide.
- SEO roadmap : 16 checks passes.
- Analytics reliability : OK.
- Syntaxe Functions : OK.
- Build prod : OK. Avertissement Vite conserve sur certains chunks > 500 kB.
- Bundle prod : OK, aucune config sandbox ni loader Stripe actif.
- Audit Functions prod : 30 Functions, 30 avec legacy env vars, 90 legacy env vars au total, 11 secrets attaches ; aucune valeur sensible affichee.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smokes publics : `/`, `/meubles-anciens`, `/planches-a-decouper-anciennes`, `/comptoir`, `/admin`, `https://tousatable-client.web.app/` et `publicCatalog` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Deploiement Hosting du 2026-05-12 - ouverture directe fiches produit :

- Accord utilisateur explicite recu pour deployer en prod avec `.agent\workflows\production_workflow.md`.
- Workflow prod et runbook prod relus.
- `firebase use` initial : `tatmadeinnormandie`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK.
- Mapping meubles prod valide : 30 meubles prod, mapping 30, aucun manquant, aucun extra, aucune categorie invalide.
- SEO roadmap : 16 checks passes.
- Analytics reliability : OK.
- Syntaxe Functions : OK.
- Build prod : OK. Avertissement Vite conserve sur certains chunks > 500 kB.
- Bundle prod : OK, aucune config sandbox ni loader Stripe actif.
- Audit Functions prod : 30 Functions, 30 avec legacy env vars, 90 legacy env vars au total, 11 secrets attaches ; aucune valeur sensible affichee.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- Smokes publics : `/`, `/meubles-anciens`, `/planches-a-decouper-anciennes`, `/comptoir`, `/admin`, `https://tousatable-client.web.app/` et `publicCatalog` HTTP 200.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Changement local non deploye du 2026-05-13 - verrouillage stock meubles :

- Formulaire admin catalogue : le stock des meubles (`furniture`) est verrouille automatiquement a 1 pour une piece disponible, sans champ modifiable par l'admin ; les planches (`cutting_boards`) gardent un stock editable.
- Commandes serveur : les meubles sont traites comme pieces uniques meme si un ancien document a encore `stock > 1`; une commande force alors `stock: 0` et `sold: true`. Les planches conservent la logique de decrement.
- Annulations/restaurations : un meuble restaure revient a `stock: 1`, pas a `stock + quantite`; les planches conservent l'increment.
- Firestore rules locales : les ecritures admin sur `furniture` refusent un meuble disponible avec un stock different de 1, ou un meuble vendu avec un stock different de 0.
- Verifications locales : `npm run verify:functions-syntax`, `node --check` sur les fichiers commerce modifies, `npm run build`, et `firebase deploy --only firestore:rules --project tousatable-client --dry-run` OK.
- Non deploye et aucune ecriture Firestore prod effectuee pendant cette correction locale.

Deploiement Functions sandbox du 2026-05-13 - email test sans copie Tous a Table :

- `GMAIL_EMAIL` et `GMAIL_PASSWORD` sandbox mis a jour en Secret Manager version 2.
- `onOrderCreated`, `onOrderUpdated`, `createOrder` et `resetAllStats` sandbox redeployes pour prendre les secrets version 2.
- `orderEmails.js` ajuste : la copie fixe `tousatablemadeinnormandie@gmail.com` est ajoutee uniquement quand `GCLOUD_PROJECT`/`GCP_PROJECT` vaut `tousatable-client`.
- `firebase deploy --only "functions:onOrderCreated,functions:onOrderUpdated" --project tatmadeinnormandie` : OK. En sandbox, les emails admin partent seulement vers `GMAIL_EMAIL`; en prod, ils partiront vers `GMAIL_EMAIL` + `tousatablemadeinnormandie@gmail.com` apres deploiement prod de ce changement.

Deploiement sandbox et prod du 2026-05-14 - presentation emails commande et Mes commandes :

- Email de confirmation client : les montants HTML utilisent un espace insecable avant le symbole euro et la ligne Total reste alignee gauche/droite sans retour de ligne sur le symbole.
- Email d'expedition : suppression du bloc recapitulatif produit deja present dans le premier email, mise en avant du delai 7 a 14 jours, bouton avis Google remonte, suppression du lien texte Mes commandes.
- Page Mes commandes : cartes paiement IBAN et expedition rendues plus robustes sur mobile et colonne desktop et lien avis Google harmonise.
- Verifications locales : `node --check functions/src/email/orderEmails.js` et `npm run build` OK.
- Sandbox : `firebase use default`, `npm run build`, puis `firebase deploy --project tatmadeinnormandie` OK.
- Prod : premier `npm run preflight:prod` bloque a cause d'anciens assets sandbox restes dans `dist`; nettoyage de `dist`, second `npm run preflight:prod` OK, puis `firebase deploy --project tousatable-client` OK.
- Post-deploy prod : `npm run audit:functions-env -- --project=tousatable-client` OK, `https://tousatable-client.web.app/` HTTP 200, `publicCatalog` HTTP 200.
- CLI Firebase remis sur `default (tatmadeinnormandie)`.

Deploiement sandbox et prod du 2026-05-14 - ajustement email expedition :

- Bloc transport remis en style violet/indigo, badge `7 a 14 jours` legerement reduit.
- Zone avis simplifiee : titre `Votre retour compte !` au-dessus du bouton `Laisser un avis Google`, suppression du paragraphe long.
- Verifications locales : `node --check functions/src/email/orderEmails.js` et `npm run build` OK.
- Sandbox : `firebase use default`, `npm run build`, puis `firebase deploy --project tatmadeinnormandie` OK.
- Prod : nettoyage de `dist`, `npm run preflight:prod` OK, puis `firebase deploy --project tousatable-client` OK.
- Post-deploy prod : `npm run audit:functions-env -- --project=tousatable-client` OK, `https://tousatable-client.web.app/` HTTP 200, `publicCatalog` HTTP 200.
- CLI Firebase remis sur `default (tatmadeinnormandie)`.

Deploiement sandbox et prod du 2026-05-14 - couleur transport email expedition :

- Bloc `Information transporteur` passe du violet au vert, avec badge `7 a 14 jours` en vert.
- Titre `Votre retour compte !` ajoute un emoji doigt vers le bouton avis Google.
- Verification locale : `node --check functions/src/email/orderEmails.js` OK.
- Sandbox : `firebase use default`, `npm run build`, puis `firebase deploy --project tatmadeinnormandie` OK.
- Prod : nettoyage de `dist`, `npm run preflight:prod` OK, puis `firebase deploy --project tousatable-client` OK.
- Post-deploy prod : `npm run audit:functions-env -- --project=tousatable-client` OK, `https://tousatable-client.web.app/` HTTP 200, `publicCatalog` HTTP 200.
- CLI Firebase remis sur `default (tatmadeinnormandie)`.

Deploiement sandbox et prod du 2026-05-14 - emoji avis email expedition :

- Emoji avis remplace par une main vers le bas sous `Votre retour compte !`, centree au-dessus du bouton `Laisser un avis Google`.
- Verification locale : `node --check functions/src/email/orderEmails.js` OK.
- Sandbox : `firebase use default`, `npm run build`, `firebase deploy --project tatmadeinnormandie` OK, puis deploy cible force `firebase deploy --only "functions:onOrderCreated,functions:onOrderUpdated" --project tatmadeinnormandie --force` OK.
- Prod : nettoyage de `dist`, `npm run preflight:prod` OK, puis `firebase deploy --project tousatable-client` OK.
- Post-deploy prod : `npm run audit:functions-env -- --project=tousatable-client` OK, `https://tousatable-client.web.app/` HTTP 200, `publicCatalog` HTTP 200.
- CLI Firebase remis sur `default (tatmadeinnormandie)`.

Deploiement Hosting sandbox et prod du 2026-05-14 - ajustements mobile Comptoir :

- Page `/comptoir` mobile : suppression du bloc `Menu Comptoir / Affiner`, conservation d'un bouton filtre rond en bas a droite, retrait du paragraphe editorial court et reduction des marges entre le hero, le bloc `Boutique bois` et la premiere section produits.
- Mapping legacy prod : ajout des deux documents prod `IvIngpikD1u276Qiv1zo` et `i6NBt9fdWxSPp4SOxxqM` en categorie `chaise`, sans ecriture Firestore prod.
- Sandbox : `firebase use default`, `npm run build`, puis `firebase deploy --only hosting --project tatmadeinnormandie` OK.
- Prod : premier `npm run preflight:prod` bloque sur le mapping legacy, correction du mapping, second preflight bloque sur anciens assets sandbox dans `dist`, nettoyage de `dist`, troisieme `npm run preflight:prod` OK, puis `firebase deploy --only hosting --project tousatable-client` OK.
- Post-deploy prod : `https://tousatable-client.web.app/` HTTP 200, `/comptoir` HTTP 200, `publicCatalog` HTTP 200.
- CLI Firebase remis sur `default (tatmadeinnormandie)`.

Deploiement Hosting prod du 2026-05-15 - preload images catalogue mobilier/planches :

- Routes catalogue publiques : lancement de `publicCatalog` pendant le preloader et prechauffe bornee des premieres images via `warmupStartupCatalogImagesForRoute`, sans attendre que la grille entre dans le viewport.
- Documentation d'orchestration ajoutee dans `AGENTS.md` pour conserver cette methode sur les pages mobilier et planches.
- Prod : premier `npm run preflight:prod` bloque a cause d'anciens assets sandbox restes dans `dist`; nettoyage de `dist`, second `npm run preflight:prod` OK, puis `firebase deploy --only hosting --project tousatable-client` OK.
- Post-deploy prod : `npm run audit:public-seo` OK avec 32 checks, domaine public et `web.app` HTTP 200, `publicCatalog` HTTP 200.
- Verification reseau sans scroll via Playwright HAR : page `/` et `/planches-a-decouper-anciennes` declenchent chacune `publicCatalog` et 16 requetes Storage images pendant le hero.
- CLI Firebase remis sur `default (tatmadeinnormandie)`.

Changement local du 2026-05-16 - rappel admin commandes non expediees :

- Ajout de `src/features/admin/AdminShippingReminder.jsx`, monte dans la vue admin globale via `src/Router.jsx`.
- Le rappel surveille les commandes bornees aux statuts `paid`, `pending_payment` et `pending`, puis affiche un popup tant qu'elles ne sont pas marquees `shipped` ou sorties de ces statuts.
- Le bouton `Me le rappeler dans 2 jours` enregistre un snooze par admin dans `orders/{orderId}.shippingReminderSnoozes.{uid}`, afin que chaque admin garde son propre rappel.
- Le popup permet aussi de marquer directement la commande affichee comme `shipped`, avec la meme mutation que le bouton `Expediee` de l'onglet Commandes.
- Verification locale : `npm run build` OK.
- Non fait : aucun deploy, aucune ecriture Firestore prod.

Deploiement Hosting prod du 2026-05-20 - stabilisation image fiche produit mobile Android :

- Accord utilisateur explicite recu pour deployer en prod avec `.agent/workflows/production_workflow.md`.
- Workflow prod relu : `.agent/workflows/production_workflow.md`.
- Runbook prod relu : `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`.
- Correctif deploye : remplacement des contraintes mobiles `dvh` par `svh` pour l'image centrale des fiches produit, afin d'eviter le grossissement au premier scroll sur Chrome Android.
- `firebase use` initial : `default (tatmadeinnormandie)`.
- `.firebaserc` verifie : alias `prod` pointe vers `tousatable-client`.
- `firebase use prod` : alias prod actif sur `tousatable-client`.
- `npm run preflight:prod` : OK, aucune valeur sensible affichee.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Smokes publics : `/`, `/meubles-anciens`, `/planches-a-decouper-anciennes`, `/comptoir`, `/admin`, `https://tousatable-client.web.app/` et `publicCatalog` HTTP 200.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Deploiement Hosting sandbox du 2026-05-29 - tri varie galerie :

- Grille mobilier : ajout du tri par defaut `Selection variee`, qui alterne les familles de meubles dans `Tous les produits` et les sous-types dans les categories pour eviter les batchs homogenes en tete de galerie.
- `Plus recents`, `Prix croissant` et `Prix decroissant` restent disponibles comme tris stricts.
- Sandbox : `npm run build` OK, puis `firebase deploy --only hosting --project tatmadeinnormandie` OK.
- Verification sandbox : `/meubles-anciens` affiche `Selection variee` par defaut et melange banc, buffet/bibliotheque, armoire, autre, table, commode ; `/meubles-anciens/chaises-bancs` alterne banc, tabouret, fauteuil, chaise.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions, aucun deploy prod.

Deploiement Hosting prod du 2026-05-29 - tri varie galerie :

- Accord utilisateur explicite recu : demande "deploy en prod".
- Preflight initial bloque par `verify:prod-furniture` : meuble prod publie `g4TNT1QwxgtLPKLEYCmE` absent du mapping legacy.
- Correction locale : ajout de `g4TNT1QwxgtLPKLEYCmE` en categorie `chaise` dans `src/data/legacyFurnitureCategories.js`, sans ecriture Firestore prod.
- `npm run preflight:prod` : OK, mapping prod 56/56, SEO roadmap OK, analytics OK, syntaxe Functions OK, build prod OK, bundle prod OK, audit env Functions sans valeurs sensibles.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- `npm run audit:public-seo` : OK, 32 checks passes.
- Verification navigateur prod : `/meubles-anciens` charge sans erreur console, `Selection variee` est le tri par defaut et la grille melange les familles de meubles.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Deploiement Hosting sandbox du 2026-05-29 - ratios images masonry :

- Ajout des champs de metriques image au pipeline admin pour les nouvelles publications: `imageDimensions`, `primaryImageWidth`, `primaryImageHeight`, `primaryImageAspectRatio`.
- Le placement galerie lit ces champs avant le fallback runtime, afin d'eviter de decouvrir les hauteurs seulement apres chargement image.
- Migration sandbox appliquee avec `scripts/backfill-sandbox-image-ratios.cjs --apply`: 103 documents enrichis sur 111.
- 8 documents sandbox non enrichis car l'image principale Storage renvoie HTTP 404.
- `npm run build` : OK.
- `firebase deploy --only hosting --project tatmadeinnormandie` : OK.
- Verification navigateur sandbox : `/meubles-anciens` charge sans erreur console, `Selection variee` reste le tri par defaut.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Deploiement Hosting sandbox du 2026-05-29 - ajustement tri varie :

- Correction du tri `Selection variee` : les familles ne sont plus ordonnees par le produit le plus recent de chaque famille.
- Ordre editorial stable en haut de galerie mobilier : tables, autres, buffets, commodes, chaises/bancs, armoires.
- Objectif : eviter que deux produits tres recents restent systematiquement en tete quand ils appartiennent a deux familles differentes.
- `npm run build` : OK.
- `firebase deploy --only hosting --project tatmadeinnormandie` : OK.
- Verification navigateur sandbox cache-bustee : premiere ligne `/meubles-anciens` = table, console, bibliotheque, commode.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploiement Functions.

Deploiement Hosting prod du 2026-05-29 - ratios images masonry et tri varie stable :

- Accord utilisateur explicite recu : demande "mettre en place tout ce qu'on a fait dernierement pour la prod".
- `scripts/backfill-sandbox-image-ratios.cjs` securise pour la prod : `--prod` en dry-run, ecriture prod seulement avec `--prod --apply --confirm-prod-write`.
- `npm run preflight:prod` : OK, mapping prod 56/56, SEO roadmap OK, analytics OK, syntaxe Functions OK, build prod OK, bundle prod OK, audit env Functions sans valeurs sensibles.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- Migration ratios prod appliquee : dry-run 84/84 a mettre a jour, apply 84 documents enrichis, dry-run final 0 mise a jour restante.
- `firebase use default` : retour sur `tatmadeinnormandie`.
- `npm run audit:public-seo` : OK, 32 checks passes.
- `publicCatalog` prod HTTP 200.
- Verification navigateur prod : `/meubles-anciens` charge sans erreur console, `Selection variee` est le tri par defaut, premiere ligne = table, console, bibliotheque, commode.
- Aucune modification rules, aucun deploiement Functions.

Changement local du 2026-05-29 - gate categories meubles prod :

- `verify:prod-furniture` accepte desormais un meuble prod si son champ Firestore `category` est valide, ou sinon si son ID est couvert par `src/data/legacyFurnitureCategories.js`.
- Le gate continue de bloquer les meubles sans categorie exploitable, les categories hors liste et les IDs legacy qui n'existent plus en prod.
- Documentation mise a jour dans `_DOCS/LEGACY_FURNITURE_CATEGORY_MAPPING.md` et `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`.
- Verification : `npm run verify:prod-furniture` OK.
- Aucune ecriture Firestore prod, aucune modification rules, aucun deploy.

Deploiement prod du 2026-08-30 - connexion sans mot de passe, checkout et securite commandes :

- Accord utilisateur explicite recu : demande de commit et deploiement production.
- Commit applicatif : `a5e3ea2` (`feat: secure passwordless checkout and order flow`).
- Connexion par code email a 6 chiffres, panier invite/migration de compte, checkout particulier/entreprise, commande par virement, facture et restauration de stock deployes.
- Operations destructives reservees au compte developpeur ; compte admin client limite aux operations quotidiennes.
- Secret prod `OTP_HMAC_SECRET` cree dans Secret Manager sans valeur affichee ni versionnee.
- Dependances frontend et Functions mises a jour ; `npm audit --omit=dev` et `npm --prefix functions audit --omit=dev` : 0 vulnerabilite.
- `npm run preflight:prod` : OK avec env prod, catalogue 53 meubles, SEO 25/25, analytics, panier, securite admin 13/13, OTP 10/10, syntaxe Functions, audits dependances, build prod et bundle prod.
- `firebase deploy --only functions --project tousatable-client` : OK, 33 Functions actives dont `requestEmailOtp`, `verifyEmailOtp` et `cancelAndDeleteOrderAdmin`.
- `firebase deploy --only firestore:rules --project tousatable-client` : OK, regles compilees et publiees.
- `firebase deploy --only hosting --project tousatable-client` : OK, release Hosting publiee.
- Post-deploy : audit Functions OK (33 Functions, 15 secrets attaches), audit SEO public 32/32, domaine public, routes catalogue/comptoir/admin, `web.app` et `publicCatalog` HTTP 200.
- CLI Firebase remise sur `sandbox (sandboxtat)`.
- Aucune copie sandbox vers prod, aucune migration et aucune ecriture dans les documents Firestore catalogue/commandes existants.

Correctif prod du 2026-08-30 - authentification SMTP OTP :

- Cause confirmee dans les logs : appels OTP avec Auth et App Check valides, puis echec SMTP Gmail `EAUTH`.
- Nouveau mot de passe d'application Google cree pour la production et enregistre uniquement dans Secret Manager `GMAIL_PASSWORD`, sans affichage ni versionnement dans le depot.
- `requestEmailOtp` redeployee et active avec la nouvelle version du secret ; authentification SMTP verifiee sans envoi d'email.
- Le front transforme desormais les erreurs App Check en message utilisateur et n'affiche plus les messages techniques bruts.
- `npm run preflight:prod` : OK ; Hosting prod publie et bundle public controle.
- Aucune ecriture Firestore prod et aucun email de test envoye.

Alignement infrastructure sandbox/prod du 2026-08-30 :

- Cause du second echec OTP identifiee dans les logs : App Check et le code etaient valides, puis `verifyEmailOtp` echouait sur `auth/insufficient-permission` pendant `createCustomToken`.
- Le service account prod possede maintenant le meme role auto-cible `roles/iam.serviceAccountTokenCreator` que la sandbox.
- App Check utilise reCAPTCHA Enterprise dans les deux builds ; cles, TTL, domaines et enforcement Firestore/Auth sont coherents. Storage reste volontairement non enforce dans les deux projets.
- Les rules Storage sandbox ont ete alignees sur les rules prod ; les rules Firestore etaient deja identiques.
- Auth Email/Anonyme/Google, IAM d'invocation Functions, secrets, index, APIs et headers Hosting ont ete verifies et alignes.
- Les 33 Functions ont ete redeployees depuis la meme source sur sandbox et prod ; toutes utilisent les versions actives des secrets auxquelles elles sont attachees.
- `npm run verify:env-parity` ajoute et integre au preflight : 46/46 controles passes sans lecture ni ecriture de donnees Firestore.
- Builds Hosting sandbox et prod republies ; aucun document catalogue, commande ou utilisateur modifie par l'audit.
- Le token debug App Check qui etait embarque dans l'ancien bundle prod a ete retire du build et revoque cote production ; il reste autorise uniquement en sandbox pour localhost. Les gates env et bundle bloquent son retour.

Correctif prod du 2026-08-30 - double envoi OTP mobile :

- Les logs prod confirment un premier `requestEmailOtp` reussi en HTTP 200 avec `email_otp_sent`, suivi quelques secondes plus tard d'un second appel HTTP 429 pour la meme demande.
- Le code avait donc bien ete envoye ; l'erreur du second appel ecrasait a tort le message de succes dans l'interface.
- L'envoi possede maintenant un verrou synchrone contre les doubles requetes. Un HTTP 429 conserve l'ecran de saisie et indique qu'un code vient deja d'etre envoye.
- Gate OTP porte a 12/12 avec controles du verrou d'envoi et du comportement 429.
- Correction exclusivement frontend : aucune ecriture Firestore, aucune modification catalogue et aucun deploiement Functions requis.
- Le collage Gmail/gestionnaire de presse-papiers est aussi distribue dans les six cases OTP. La troncature HTML `maxLength=1`, incompatible avec certains collages Chrome mobile, a ete retiree ; l'etat React conserve un chiffre par case.

Restauration commandes production du 2026-08-30 :

- Accord explicite recu pour restaurer les 18 commandes historiques deja validees dans la conversation et presentes en sandbox.
- Dry-run : 18/18 sources presentes, aucun ID cible existant, 18/18 comptes Auth prod trouves et UID identiques, adresses et articles presents, montant cumule `15 836 EUR`.
- `onOrderCreated` protege par un marqueur systeme exact pour ne pas renvoyer les anciens emails lors de cette restauration ; Function ciblee deployee sur sandbox et prod apres `npm run preflight:prod` vert.
- Import prod atomique via `batch.create` : 18 documents crees, aucun document existant ecrase, aucun stock ni document catalogue modifie.
- Etat final verifie en lecture : 22 commandes actives et `21 571 EUR` de chiffre d'affaires.
- Logs prod : 18/18 triggers historiques ignores pour les notifications, 0 erreur Function.

Durcissement facturation sandbox du 2026-08-30 :

- Decision metier : aucun chantier d'avoir ou d'annulation comptable ajoute. Le flux reste une commande par virement.
- Nouvelles commandes : numero annuel sequentiel `F-AAAA-NNNNN`, alloue dans la meme transaction Firestore que la commande et la reservation du stock.
- Les anciennes commandes ne sont pas renumerotees : leur reference historique reste conservee pour eviter de contredire une facture deja transmise.
- PDF genere une seule fois cote serveur, stocke dans un chemin Storage prive avec empreinte SHA-256 et protection contre l'ecrasement ; le navigateur telecharge cette copie au lieu de regenerer la facture.
- Acces facture : Auth, email verifie, App Check et controle d'appartenance de la commande. Aucun lien Storage permanent n'est expose.
- Facture enrichie : dates d'emission et de vente, total HT, TVA non applicable, net a payer, echeance a reception, escompte, penalites de retard et indemnite B2B de 40 EUR.
- Entreprise avec adresse de facturation differente : la raison sociale, le SIRET et la TVA restent ceux de l'entreprise commanditaire ; seule l'adresse change. Le serveur rejette aussi une identite incoherente envoyee hors UI.
- Gate `npm run verify:invoice` ajoute au preflight prod : 22 controles, dont la bascule annuelle selon le fuseau `Europe/Paris`.
- Verification locale : syntaxe Functions OK, cart boundary OK, build Vite OK, PDF entreprise A4 inspecte visuellement, extraction texte OK et cas 35 lignes/3 pages sans chevauchement.
- Deploiement effectue uniquement sur `sandboxtat` : Firestore rules, Storage rules, `createOrder`, `getInvoicePdf`, `onOrderCreated`, `onOrderUpdated` et Hosting. Compilation rules et publication OK.
- Smoke sandbox : formulaire entreprise affiche l'identite juridique en lecture seule lorsque seule l'adresse de facturation change ; endpoint facture non authentifie refuse en HTTP 401.
- Test Storage reel sur une ancienne commande de test sandbox : PDF prive cree puis relu deux fois avec le meme contenu et la meme empreinte ; seul le champ `invoice` de cette commande de test a ete ajoute, sans changement de statut/stock et sans email.
- Conditions de reglement simplifiees : le bloc principal indique uniquement virement exigible a reception, avant expedition, puis expedition apres encaissement. Les mentions de retard obligatoires restent en petite ligne uniquement sur les factures professionnelles et disparaissent des factures particuliers.
- Recette navigateur entreprise complete sur `sandboxtat` : commande reelle de test `F-2026-00001` a 100 EUR, email du compte confirme, informations juridiques relues dans le checkout, reservation stock atomique, IBAN affiche et emails Functions termines sans erreur.
- Telechargement client valide depuis `Mes commandes` : `getInvoicePdf` a repondu en HTTP 200 avec Auth et App Check valides ; le PDF Chrome, le fichier Storage prive et l'empreinte rattachee a la commande sont strictement identiques. Rendu A4 inspecte visuellement sans chevauchement ni contenu manquant.
- Production non modifiee par ce chantier. La parite Functions est volontairement temporairement rouge (34 sandbox / 33 prod) jusqu'a un accord explicite de deploiement production.

## Reste a suivre

1. Decider le traitement des legacy env vars Functions: nettoyage + rotation recommandes.
2. Surveiller les logs `syncSessionBeacon` et `publicCatalog`.
3. Faire une validation manuelle admin login/publication quand disponible.

## Non fait volontairement

- Aucune ecriture Firestore prod.
- Aucune migration sandbox vers prod.
- Aucune importation de meubles test.

## Commande de reprise

Avant de reprendre:

```bash
npm run preflight:prod
```

Si le preflight passe, suivre le runbook:

```bash
_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md
```
