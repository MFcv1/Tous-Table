# SEOlivre - Tous a Table

Ce fichier est le journal de bord SEO du projet.  
Chaque agent qui modifie une partie importante du SEO doit le lire avant d'agir, puis ajouter une entree claire apres l'implementation.

Regle de travail :

- Ne jamais deployer en production sans accord explicite.
- Ne jamais modifier Firestore prod pour une amelioration SEO sans validation humaine.
- Ne pas casser l'interface marketplace, meubles ou planches : ces pages gardent leur design et leur grille.
- Prioriser les changements invisibles, les URLs propres, les schemas, le sitemap et le contenu editorial uniquement quand il s'integre au design existant.
- Pour chaque etape, noter : objectif, fichiers touches, impact SEO, risque UI, tests effectues, reste a faire.

## Table des chapitres

1. Audit initial et socle technique
2. Architecture URL propre
3. Sitemap et partage social
4. Marketplace, meubles et planches
5. Le Comptoir
6. SEO local Ifs / Caen / Normandie
7. SEO national France et pays frontaliers
8. Donnees structurees
9. Search Console et suivi post-deploiement

---

## Chapitre 1 - Audit initial et socle technique

Date : 6 mai 2026  
Statut : fait

Objectif :

- Reprendre l'etat SEO global du site apres les changements de routing, marketplace et production.
- Documenter les risques avant de poursuivre.

Fichiers / documents :

- `_DOCS/SEO_AUDIT_EXPORT_2026.md`
- `_DOCS/SEO_ROADMAP_REFACTOR_2026.md`

Constats :

- Le site avait une base correcte mais trop dependante des query params et du rendu SPA.
- Les pages e-commerce fortes n'avaient pas encore d'URLs propres.
- Le sitemap devait etre aligne avec les nouvelles routes.
- La racine devait devenir l'entree marketplace, avec la page vitrine deplacee vers `/a-propos`.

Impact SEO :

- Base de decision pour la refonte.
- Roadmap claire : architecture, sitemap, contenu categorie, local/national, schemas, suivi Search Console.

Risque UI :

- Aucun changement UI dans cette etape.

Tests :

- Audit manuel code + documentation Google Search Central.

Reste a faire :

- Completer le contenu SEO visible sur les pages qui peuvent le recevoir sans casser l'interface.

---

## Chapitre 2 - Architecture URL propre

Date : 6 mai 2026  
Statut : commence localement

Objectif :

- Remplacer les anciennes URLs `?page=...`, `?product=...` et hash par des routes propres.

Routes cibles :

- `/` : marketplace principale.
- `/a-propos` : page vitrine, histoire, atelier.
- `/meubles-anciens` : collection meubles.
- `/meubles-anciens/buffets`
- `/meubles-anciens/tables-de-ferme`
- `/meubles-anciens/armoires`
- `/meubles-anciens/commodes-chevets`
- `/meubles-anciens/chaises-bancs`
- `/meubles-anciens/autres`
- `/planches-a-decouper-anciennes`
- `/comptoir`
- `/produit/slug-id`

Fichiers touches :

- `src/utils/seoRoutes.js`
- `src/App.jsx`
- `src/Router.jsx`
- `src/pages/GalleryView.jsx`
- `src/designs/architectural/MarketplaceLayout.jsx`
- `src/designs/architectural/components/ProductCard.jsx`
- `src/designs/architectural/ArchitecturalProductDetail.jsx`
- `src/components/layout/GlobalMenu.jsx`
- `src/components/layout/Footer.jsx`
- `functions/src/seo/seoTools.js`

Impact SEO :

- URLs plus lisibles pour Google et les utilisateurs.
- Canonicals et sitemap peuvent converger vers les memes URLs.
- Les fiches produit deviennent descriptives via slug.

Risque UI :

- Moyen au depart car le routing touche la navigation.
- Mesure prise : ne pas changer les layouts, seulement les chemins et callbacks.

Tests :

- `npm run build` OK.
- Preview locale : `/`, `/a-propos`, categories, `/comptoir`, `/produit/test-id` en 200.
- Recherche locale : anciens patterns `?page=gallery`, `?page=shop`, `?product`, `#gallery` nettoyes.

Reste a faire :

- Refaire un smoke test visuel complet avant tout deploy Hosting.

---

## Chapitre 3 - Sitemap et partage social

Date : 7 mai 2026
Statut : renforce localement, aucun deploy

Objectif :

- Consolider le sitemap et les metas de partage sans toucher aux donnees prod.
- Eviter les titres generiques et les descriptions corrompues dans les apercus Open Graph.
- Garder les URLs sitemap alignees avec les nouvelles routes propres.

Fichiers touches :

- `index.html`
- `public/manifest.json`
- `functions/src/seo/seoTools.js`
- `src/components/shared/SEO.jsx`
- `SEOlivre.md`

Changements :

- `src/components/shared/SEO.jsx` :
  - default `siteTitle` nettoye en ASCII : `Tous a Table Made in Normandie` ;
  - default description remplacee par un texte plus propre autour de l atelier a Ifs, meubles anciens restaures, bois massif, livraison locale, France et pays frontaliers ;
  - suppression des caracteres corrompus dans les metas par defaut.
- `index.html` :
  - head statique nettoye en ASCII ;
  - title, description, keywords, Open Graph et Twitter description alignes avec le positionnement meubles anciens restaures ;
  - JSON-LD statique `FurnitureStore` conserve et nettoye ;
  - point d entree React `/src/main.jsx`, fonts, favicon, manifest et canonical conserves.
- `public/manifest.json` :
  - nom et short name nettoyes en ASCII ;
  - positionnement aligne sur `Meubles anciens restaures` ;
  - `start_url` fixe sur `/`.
- `functions/src/seo/seoTools.js` :
  - fichier reecrit proprement en ASCII pour eliminer les caracteres corrompus ;
  - conservation du sitemap XML dynamique existant ;
  - conservation des URLs produits propres via `/produit/slug-id` ;
  - ajout de metas de partage par route pour :
    - `/`
    - `/meubles-anciens`
    - toutes les categories meubles ;
    - `/planches-a-decouper-anciennes`
    - `/comptoir`
    - `/a-propos`
    - `/livraison-meubles-anciens-france`
  - `shareMeta` accepte maintenant `path`, `url` ou `product` pour choisir la meta ;
  - extraction prudente de l ID produit depuis `/produit/slug-id` ;
  - ajout de `og:site_name`, `og:type`, metas Twitter detaillees et canonical ;
  - cache court conserve : `public, max-age=300, s-maxage=300`.

Impact SEO :

- Les apercus sociaux et robots qui utilisent la Function de partage ne tombent plus sur `Ma Boutique`.
- Les pages fortes ont un title/description coherent avec leur intention de recherche.
- Le sitemap reste coherent avec la nouvelle architecture routee.

Limite actuelle :

- `shareMeta` est exportee cote Functions, mais les URLs publiques normales restent servies par Hosting vers `index.html`.
- Les pages React mettent bien a jour leurs metas via `SEO.jsx`, mais certains robots sociaux ne rendent pas toujours le JavaScript.
- Si l'objectif devient des apercus sociaux dynamiques parfaits pour chaque fiche produit, il faudra ajouter une strategie dediee :
  - soit une URL de partage explicite type `/share?product=...` ;
  - soit une solution SSR/prerender ;
  - soit une logique edge/hosting plus avancee selon les contraintes Firebase.

Risque UI :

- Nul : changement invisible, uniquement metas/sitemap/share.
- Aucun changement marketplace, meubles, planches ou Firestore.

Tests :

- `node --check functions/src/seo/seoTools.js` OK.
- `npm run build` OK.
- Recherche locale : plus de `Ma Boutique` ni de sequences mojibake dans `functions/src/seo/seoTools.js` et `src/components/shared/SEO.jsx`.
- Recherche locale `index.html` : title/OG/schema statiques propres, build Vite OK.
- Manifest public verifie et nettoye en ASCII.
- Preview local sur port 4192 :
  - `/`, `/a-propos`, `/comptoir`, `/livraison-meubles-anciens-france`, `/meubles-anciens`, `/meubles-anciens/buffets`, `/planches-a-decouper-anciennes`, `/produit/test-id` repondent en 200 ;
  - HTML statique de `/` verifie : title, description et schema `FurnitureStore` presents ;
  - serveur preview arrete apres verification.

Reste a faire :

- Ne deployer la Function `sitemap/shareMeta` qu avec accord explicite.
- Apres deploy : tester `/sitemap.xml`, inspecter une categorie, une fiche produit et la page livraison dans Search Console.
- Decider plus tard si les apercus sociaux produit doivent etre dynamiques hors React.

---

## Chapitre 5 - Le Comptoir

Date : 6 mai 2026  
Statut : en cours localement

Objectif :

- Transformer `/comptoir` en page SEO forte autour de la boutique bois, entretien meuble ancien, soin du bois massif et restauration, sans mettre le mot "affiliation" dans le SEO principal.
- Garder l'identite UI "Le Comptoir".
- Ne pas toucher aux pages meubles et planches.

Fichiers touches :

- `src/pages/ShopView.jsx`

Changements :

- Meta title remplace par : `Le Comptoir - Boutique Bois & Entretien Meuble Ancien`.
- Meta description remplacee sans mention "affiliation".
- Ajout d'un schema JSON-LD invisible :
  - `CollectionPage`
  - `BreadcrumbList`
  - `FAQPage`
- Ajout d'une section editoriale courte apres le hero :
  - boutique bois
  - entretien meuble ancien
  - huiles, cires, savons, accessoires
  - selection courte et utile
- Ajout d'une FAQ visible en bas de page :
  - produits pour meuble ancien
  - protection table bois massif
  - usage pour meubles restaures et planches en bois

Impact SEO :

- La page peut viser des recherches informationnelles et transactionnelles autour de l'entretien du bois.
- Les donnees structurees renforcent la comprehension de la page.
- La FAQ donne du contenu indexable sans perturber la grille marketplace.

Risque UI :

- Faible a moyen : ajout de deux blocs visibles uniquement sur le Comptoir.
- Les pages meubles et planches ne sont pas touchees.
- Le layout existant du Comptoir est conserve.

Tests :

- `npm run build` OK.
- Bundle `ShopView-*.js` verifie : title/description/schema presents.
- Verification bundle : `Boutique Affiliation` / `Boutique affiliation` absents des metas Comptoir.
- Preview HTTP `/comptoir` verifiee en 200 pendant le controle local precedent.

Reste a faire :

- Ajouter si necessaire un maillage discret vers `/meubles-anciens` et `/a-propos`.
- Valider visuellement que les nouveaux blocs ne cassent pas le rythme de la page.

---

## Chapitre 4 - Marketplace, meubles et planches

Date : 6 mai 2026  
Statut : SEO invisible commence

Objectif :

- Ameliorer les signaux SEO de la marketplace sans toucher a la grille, aux cartes, aux animations ni au design des pages meubles/planches.

Fichiers touches :

- `src/pages/GalleryView.jsx`
- `src/utils/furnitureCategory.js`

Changements :

- Titres et descriptions SEO dynamiques selon la collection :
  - marketplace meubles
  - buffets
  - tables de ferme
  - armoires
  - commodes et chevets
  - chaises et bancs
  - autres meubles
  - planches a decouper anciennes
- Ajout d'un schema JSON-LD invisible :
  - `CollectionPage`
  - `BreadcrumbList`
- Ajout d'un `ItemList` JSON-LD invisible sur les collections :
  - liste limitee aux 24 premiers produits publies/filtrables ;
  - categorie meuble respectee avec le meme mapping legacy que l'interface ;
  - URLs produits propres via `/produit/slug-id`.
- Ajout de `src/utils/furnitureCategory.js` pour reprendre cote SEO la meme logique que l'affichage : `category` Firestore, puis mapping legacy par ID, puis fallback par nom.
- Les routes et canonicals restent alignes avec `src/utils/seoRoutes.js`.

Impact SEO :

- Chaque categorie transmet un signal plus clair a Google.
- Le breadcrumb aide a comprendre la hierarchie entre accueil, meubles anciens et categorie.
- `ItemList` aide Google a comprendre quels produits appartiennent a la collection ou categorie.
- Aucune modification de donnees Firestore.

Risque UI :

- Tres faible : changement invisible dans les metas et les schemas seulement.
- La grille marketplace, les meubles et les planches ne sont pas modifies visuellement.

Tests :

- `npm run build` OK.
- Bundle `GalleryView-*.js` verifie : titres categories, `CollectionPage`, `BreadcrumbList` presents.
- Bundle `GalleryView-*.js` verifie : `ItemList`, `numberOfItems`, `itemListElement`, `Product` presents.
- Aucun test visuel necessaire pour cette etape : changement invisible SEO uniquement.

Reste a faire :

- Ajouter plus tard du contenu categorie visible uniquement si le design le permet et apres validation humaine.

---

## Chapitre 6 - SEO local Ifs / Caen / Normandie

Date : 6 mai 2026  
Statut : page livraison commencee localement

Objectif :

- Creer une page discrete et utile sur la livraison des meubles anciens, sans toucher a la structure visuelle marketplace/meubles/planches.
- Couvrir le local Ifs / Caen, la Normandie, la France entiere et les pays frontaliers sur devis.

Fichiers touches :

- `src/pages/DeliveryView.jsx`
- `src/utils/seoRoutes.js`
- `src/Router.jsx`
- `src/App.jsx`
- `src/components/layout/Footer.jsx`
- `functions/src/seo/seoTools.js`

Changements :

- Nouvelle route locale : `/livraison-meubles-anciens-france`.
- Page accessible discretement depuis le footer, colonne `Aide`, lien `Livraison`.
- Page construite comme contenu editorial responsive :
  - hero livraison atelier
  - zones : Ifs/Caen, Normandie, France entiere, pays frontaliers
  - methode de transport
  - FAQ livraison
- Suppression du bloc central de demande de devis : le prix se fixe directement entre client, vendeur et transporteur selon le meuble et le trajet.
- Ajout au sitemap local via `functions/src/seo/seoTools.js`.
- Ajout de schemas invisibles sur la page :
  - `WebPage`
  - `BreadcrumbList`
  - `FAQPage`

Impact SEO :

- Cible les requetes autour de livraison meuble ancien, transport meuble ancien France, livraison meuble Caen / Ifs.
- Rassure les clients nationaux sans surcharger les pages produits.
- Soutient le positionnement local et national dans une seule page forte.

Risque UI :

- Faible : nouvelle page isolee.
- Pas de modification de grille, cartes, animations ou pages meubles/planches.
- Le lien est discret dans le footer.

Tests :

- `npm run build` OK.
- Bundle `DeliveryView-*.js` verifie : route, title SEO, schemas et contenu transport presents.
- Verification bundle : le bloc `Demander un devis` et la phrase `Pour estimer la livraison` sont absents apres suppression.
- Preview locale tentee puis interrompue; serveur de test nettoye. A refaire visuellement avant deploy.

Reste a faire :

- Eventuellement ajouter un lien discret depuis les fiches produit apres validation visuelle.
- Ajouter Search Console apres deploy, uniquement avec accord.

---

## Chapitre 8 - Donnees structurees

Date : 6 mai 2026  
Statut : en cours

Objectif :

- Ajouter progressivement des schemas utiles et alignes avec le contenu reel visible.

Etat actuel :

- `/comptoir` : `CollectionPage`, `BreadcrumbList`, `FAQPage`.
- Marketplace / categories / planches : `CollectionPage`, `BreadcrumbList`.
- Fiches produit : `Product`, `Offer`, `BreadcrumbList`.
- `/a-propos` : `WebPage`, `WebSite`, `FurnitureStore`, `LocalBusiness`, `BreadcrumbList`, `FAQPage`.

Regle :

- Ne pas ajouter de schema qui promet un contenu absent de la page.
- Ne pas utiliser les schemas comme substitut a un vrai contenu visible.

Tests :

- A faire apres deploy : Rich Results Test et Search Console.

---

## Chapitre 8B - Fiches produit

Date : 6 mai 2026  
Statut : schema invisible renforce localement

Objectif :

- Renforcer les fiches produit sans modifier leur interface.
- Aider Google a comprendre le produit, son prix, sa disponibilite, son etat d objet ancien et sa place dans la collection.

Fichiers touches :

- `src/designs/architectural/ArchitecturalProductDetail.jsx`
- `SEOlivre.md`

Changements :

- Schema `Product` transforme en `@graph`.
- Ajout / renforcement :
  - `Product`
  - `Offer`
  - `BreadcrumbList`
  - `sku`
  - `category`
  - `material`
  - `itemCondition: UsedCondition`
  - `seller: FurnitureStore`
- Gestion prudente du prix : le prix est emis uniquement s il existe et si le produit n est pas en `priceOnRequest`.
- Disponibilite basee sur `sold` et `stock`.

Impact SEO :

- Meilleure lecture des fiches produits comme pages ecommerce.
- Breadcrumb produit coherent avec `/meubles-anciens` ou `/planches-a-decouper-anciennes`.

Risque UI :

- Nul : JSON-LD invisible uniquement.

Tests :

- `npm run build` OK.
- Bundle `ProductDetail-*.js` verifie : `BreadcrumbList`, `UsedCondition`, `itemCondition`, `seller`, `sku`, `category`, `priceOnRequest` presents.

---

## Chapitre 6B - Page A propos et SEO local atelier

Date : 6 mai 2026  
Statut : schema invisible renforce localement

Objectif :

- Renforcer `/a-propos` comme page de confiance locale autour de l atelier de restauration a Ifs / Caen.
- Garder la page vitrine strictement identique visuellement.

Fichiers touches :

- `src/pages/HomeView.jsx`
- `SEOlivre.md`

Changements :

- Remplacement du schema inline `FurnitureStore` ancien par un `@graph` plus robuste :
  - `WebPage`
  - `WebSite`
  - `FurnitureStore`
  - `LocalBusiness`
  - `BreadcrumbList`
  - `FAQPage`
- Ajout des signaux locaux et metiers :
  - Ifs
  - Caen
  - Normandie
  - France
  - restauration de meubles anciens
  - tables de ferme, buffets, armoires, bois massif

Impact SEO :

- Google comprend mieux que `/a-propos` est la page atelier / entreprise locale.
- Les signaux locaux soutiennent les futures pages livraison et la marketplace.

Risque UI :

- Nul : changement invisible uniquement dans JSON-LD.

Tests :

- `npm run build` OK.
- Bundle `index-*.js` verifie :
  - `FurnitureStore` present ;
  - `LocalBusiness` present ;
  - `/a-propos#webpage` present ;
  - `FAQPage` present ;
  - `Caen` present.

---

## Chapitre 10 - Cloture audit visuel local avant pause

Date : 6 mai 2026, soir  
Statut : fait localement, aucun deploy

Objectif :

- Verifier que les ajouts SEO visibles ne cassent pas l'interface existante.
- Controler en priorite les pages ajoutees ou enrichies :
  - `/livraison-meubles-anciens-france`
  - `/comptoir`
  - `/meubles-anciens/buffets`
- Garder intact le design marketplace, meubles et planches.

Regle appliquee :

- Aucun deploy production.
- Aucune ecriture Firestore.
- Aucune migration data.
- Les corrections visuelles ont ete limitees aux nouveaux blocs SEO/livraison/Comptoir.

Corrections issues de l'audit :

1. Page livraison

- Fichier : `src/pages/DeliveryView.jsx`
- Probleme detecte en capture mobile : titre et paragraphe hero coupes horizontalement.
- Probleme detecte en capture laptop 1366x768 : titre trop massif, hero coupe verticalement.
- Correction :
  - retours de ligne controles sur mobile pour le titre et l'intro ;
  - reduction du padding vertical hero ;
  - taille desktop laptop reduite, tres grand titre reserve au `2xl`.
- Risque UI :
  - faible, page nouvelle et isolee ;
  - aucune page meuble/planche modifiee.

2. Comptoir

- Fichier : `src/pages/ShopView.jsx`
- Probleme detecte en capture mobile : texte visible corrompu par mojibake sur plusieurs mots accentues.
- Probleme detecte en capture mobile : paragraphe hero coupe a droite.
- Correction :
  - nettoyage des textes visibles en ASCII propre ;
  - remplacement des caracteres corrompus dans les familles, tutoriels, commentaires visibles et footer transparence ;
  - retours de ligne controles sur mobile pour le paragraphe hero.
- Important SEO :
  - le SEO principal reste formule comme `Boutique Bois & Entretien Meuble Ancien` ;
  - ne pas mettre `affiliation` dans les metas principales ;
  - la mention de transparence reste en bas de page, discrete et hors angle SEO principal.
- Risque UI :
  - faible a moyen, car la page Comptoir a du contenu visible ;
  - la grille produits et les cartes ne sont pas restructurees.

3. Marketplace / meubles

- Route auditee : `/meubles-anciens/buffets`.
- Capture mobile : la page charge, hero et boutons principaux visibles.
- Decision :
  - ne pas retoucher la composition existante ;
  - le rendu editorial avec image croppee et grand texte reste volontairement conserve.
- Point a surveiller :
  - sur viewport 390px, le dernier bouton du header est tres proche du bord droit dans Chrome headless. Ce point semble global au header, pas lie au SEO. Ne pas le corriger sans validation visuelle humaine, car le header existe sur toutes les pages publiques.

Tests effectues :

- `npm run build` OK apres les corrections.
- Routes locales testees en preview, toutes en 200 :
  - `/`
  - `/a-propos`
  - `/comptoir`
  - `/livraison-meubles-anciens-france`
  - `/meubles-anciens`
  - `/meubles-anciens/buffets`
  - `/planches-a-decouper-anciennes`
  - `/produit/test-id`
- `git diff --check` OK hors warnings CRLF habituels Windows.
- Recherche `rg` sur `ShopView.jsx` et `DeliveryView.jsx` : plus de sequences mojibake visibles.
- Captures temporaires supprimees.
- Serveur `vite preview` local arrete.

Etat avant pause :

- Build local OK.
- Pages publiques critiques en 200.
- Aucun deploy.
- Prod intacte.
- Les meubles client ne sont pas touches en base.
- Le rangement des anciens meubles reste gere cote code par le mapping/fallback existant, sans migration Firestore prod.

Reste a faire avant tout deploy prod :

- Refaire un smoke test navigateur manuel sur vrai Chrome visible :
  - accueil marketplace ;
  - galerie meubles ;
  - filtres categories ;
  - page produit ;
  - Comptoir ;
  - page livraison ;
  - panier ;
  - menu mobile.
- Verifier visuellement le header mobile sur iPhone/Android reel ou emulateur stable.
- Faire valider par humain que la nouvelle page livraison et les blocs Comptoir s'integrent bien au design.
- Ne deployer Hosting prod qu'apres accord explicite.

---

## Chapitre 11 - Prochaine phase gatee : contenu categorie visible

Date : 7 mai 2026  
Statut : plan pret, implementation bloquee volontairement avant validation UI

Pourquoi cette phase est gatee :

- La roadmap demande du contenu SEO visible par categorie.
- Ces changements toucheraient la page marketplace/meubles, que le client veut garder intacte visuellement.
- Aucune implementation visible ne doit etre lancee sans validation humaine sur le placement, la densite et le rendu responsive.

Objectif SEO :

- Donner a chaque categorie une intro utile et indexable sans transformer la page en landing page.
- Renforcer les requetes :
  - buffets anciens restaures ;
  - tables de ferme anciennes ;
  - armoires anciennes ;
  - commodes et chevets anciens ;
  - chaises et bancs anciens ;
  - meubles anciens en bois massif ;
  - livraison meuble ancien France / Normandie / Caen.

Principe UI a respecter :

- Ne pas casser le hero actuel.
- Ne pas modifier les cartes produits.
- Ne pas changer le masonry, les filtres, le tri ou les animations.
- Ne pas ajouter de gros bloc marketing au-dessus de la grille.
- Integrer le texte dans une zone discrete, editorialement premium, idealement proche de la barre categorie ou sous la premiere zone produit.
- Mobile : texte court, sans pousser les produits trop bas.
- Desktop : texte lisible mais secondaire face a la collection.

Plan d'implementation propose, a valider avant code :

1. Creer une map de contenu categorie invisible/visible dans `src/pages/GalleryView.jsx` ou un fichier dedie type `src/data/categorySeoContent.js`.
2. Ajouter une micro-intro visible uniquement quand une categorie precise est active, pas sur tous les filtres avances.
3. Texte cible :
   - 2 a 4 lignes maximum sur desktop ;
   - 2 paragraphes courts maximum sur mobile ;
   - pas de bourrage de mots-cles ;
   - mention livraison seulement de maniere naturelle.
4. Ajouter un maillage interne discret :
   - autres categories meubles ;
   - `/livraison-meubles-anciens-france` ;
   - `/a-propos` si pertinent.
5. Garder les schemas actuels `CollectionPage`, `BreadcrumbList`, `ItemList` et ne pas dupliquer les signaux.

Fichiers probables :

- `src/pages/GalleryView.jsx`
- eventuellement `src/data/categorySeoContent.js`
- eventuellement `src/designs/architectural/MarketplaceLayout.jsx` si le bloc doit etre rendu dans le layout existant
- `SEOlivre.md`

Risques :

- UI : moyen si le bloc est trop haut ou trop large.
- Mobile : moyen si le texte repousse la grille.
- SEO : faible si le contenu reste utile et specifique.

Gate de validation avant implementation :

- Choisir l'emplacement exact du bloc :
  - option A : sous la barre categories/filtres, avant la grille ;
  - option B : apres les 8 ou 12 premiers produits ;
  - option C : bloc repliable discret en bas de page.
- Valider le style :
  - editorial minimal ;
  - compact ;
  - aucun effet hero ;
  - aucun card nesting.
- Valider les textes par categorie avant deploy.

Tests requis apres implementation :

- `npm run build`.
- Preview local :
  - `/meubles-anciens/buffets`
  - `/meubles-anciens/tables-de-ferme`
  - `/meubles-anciens/armoires`
  - `/meubles-anciens/commodes-chevets`
  - `/meubles-anciens/chaises-bancs`
  - `/meubles-anciens/autres`
  - `/planches-a-decouper-anciennes`
- Captures mobile 390x844 et laptop 1366x768.
- Verification manuelle :
  - pas de chevauchement ;
  - pas de texte coupe ;
  - grille produits intacte ;
  - filtres toujours ergonomiques ;
  - header mobile non aggrave.

Decision actuelle :

- Ne pas coder cette phase tant que l'emplacement et le style ne sont pas valides.
- Continuer uniquement sur des changements invisibles, documentation ou verification tant que la validation UI n'est pas donnee.

---

## Chapitre 12 - Point d'arret et reprise propre

Date : 7 mai 2026  
Statut : pause volontaire, aucun deploy

Etat actuel :

- Le socle SEO invisible est en place localement :
  - routes propres ;
  - canonicals ;
  - metas par page ;
  - sitemap/shareMeta cote Functions ;
  - schemas JSON-LD ;
  - ItemList sur les collections ;
  - page livraison locale/nationale ;
  - Comptoir renforce sans angle "affiliation".
- Le design marketplace, meubles et planches n'a pas ete volontairement refondu.
- Les meubles prod ne sont pas modifies en base.
- Le rangement des anciens meubles reste gere par le code via ordre prudent :
  - `category` Firestore si present ;
  - mapping legacy par ID ;
  - fallback par nom ;
  - `autre`.
- Aucun deploy Hosting ou Functions n'a ete fait pendant cette phase.

Ce qui est validable sans coder demain :

1. Relire ce livre SEO du chapitre 10 au chapitre 12.
2. Choisir l'emplacement du futur contenu categorie visible :
   - option A : sous la barre categories/filtres, avant la grille ;
   - option B : apres les 8 ou 12 premiers produits ;
   - option C : bloc discret/repliable en bas de page.
3. Valider que le lien livraison reste uniquement discret dans le footer ou s'il faut un lien aussi depuis les fiches produit.
4. Valider si le Comptoir garde le nom `Le Comptoir` ou si le wording public doit devenir `Shop`/`Boutique`.

Ce qu'il ne faut pas faire sans validation :

- Ne pas ajouter de gros bloc texte au-dessus de la grille meubles.
- Ne pas modifier les cartes produits.
- Ne pas changer le masonry, les filtres ou les animations marketplace.
- Ne pas deployer en prod.
- Ne pas ecrire dans Firestore prod.

Prochaine action recommandee :

1. Faire un smoke visuel local complet sur Chrome :
   - `/`
   - `/meubles-anciens`
   - `/meubles-anciens/buffets`
   - `/planches-a-decouper-anciennes`
   - `/produit/test-id`
   - `/comptoir`
   - `/livraison-meubles-anciens-france`
   - `/a-propos`
2. Capturer mobile 390x844 et laptop 1366x768.
3. Si tout est intact, seulement ensuite proposer une micro-implementation du contenu categorie visible.
4. Apres validation humaine, lancer `npm run build` puis refaire preview.

Critere de reprise :

- La roadmap ne reprend en code visible que lorsque l'emplacement et le style du contenu categorie sont valides.
- Tant que ce n'est pas valide, seules les verifications, la documentation et les corrections invisibles restent autorisees.

---

## Chapitre 13 - Audit de couverture avant reprise

Date : 7 mai 2026  
Statut : audit documentaire fait, objectif global non clos

Objectif audite :

- Reprendre la roadmap SEO la ou elle etait arretee.
- Ne pas casser l'interface marketplace/meubles/planches.
- Ne pas deployer sans accord.
- Ne pas modifier la base prod.
- Documenter precisement ce qui reste a faire.

Checklist prompt vers artefacts :

| Exigence | Artefact verifie | Evidence locale | Etat |
|---|---|---|---|
| Routes propres SEO | `src/utils/seoRoutes.js`, `src/App.jsx`, `src/Router.jsx` | Routes `/meubles-anciens`, categories, `/planches-a-decouper-anciennes`, `/comptoir`, `/a-propos`, `/livraison-meubles-anciens-france` retrouvees par `rg` | OK local |
| Sitemap routes | `functions/src/seo/seoTools.js` | Routes principales et categories presentes dans `STATIC_ROUTES` | OK local |
| Partage social/metas | `functions/src/seo/seoTools.js`, `src/components/shared/SEO.jsx`, `index.html` | `shareMeta`, metas par route, title/description statiques propres | OK local, deploy Functions requis plus tard |
| Comptoir SEO sans angle affiliation | `src/pages/ShopView.jsx` | `CollectionPage`, `BreadcrumbList`, `FAQPage`, contenu boutique bois/entretien | OK local |
| Marketplace schemas invisibles | `src/pages/GalleryView.jsx` | `CollectionPage`, `BreadcrumbList`, `ItemList`, `Product` retrouves | OK local |
| Fiches produit schemas invisibles | `src/designs/architectural/ArchitecturalProductDetail.jsx` | `Product`, `Offer`, `UsedCondition`, `FurnitureStore`, `BreadcrumbList` retrouves | OK local |
| SEO local Ifs/Caen/livraison | `src/pages/DeliveryView.jsx`, `src/components/layout/Footer.jsx`, `functions/src/seo/seoTools.js` | Page livraison existe, lien footer present, route sitemap presente | OK local |
| Page A propos / atelier | `src/pages/HomeView.jsx` | `FurnitureStore`, `LocalBusiness`, `BreadcrumbList`, `FAQPage` presents | OK local |
| Meubles prod intacts | Process | Aucune commande d'ecriture Firestore/deploy; uniquement code local et docs | OK |
| UI marketplace intacte | Process + limite volontaire | Aucun contenu categorie visible code apres Chapitre 11; prochaines modifications visibles gatees | Non valide visuellement, gate obligatoire |
| Prod deploy | Process | Aucun deploy Hosting/Functions lance | OK |
| Documentation reprise | `SEOlivre.md` | Chapitres 10, 11, 12 et 13 documentent pause, gate, prochaine action | OK |

Commandes de verification lancees pour cet audit :

- `rg -n "livraison-meubles-anciens-france|meubles-anciens|planches-a-decouper-anciennes|comptoir|a-propos" src/utils/seoRoutes.js src/Router.jsx src/App.jsx src/components/layout/Footer.jsx functions/src/seo/seoTools.js`
- `rg -n "CollectionPage|BreadcrumbList|ItemList|FAQPage|Product|FurnitureStore|LocalBusiness|UsedCondition" src/pages src/designs/architectural src/components/shared functions/src/seo/seoTools.js index.html`
- `Test-Path SEOlivre.md`
- `Test-Path src/pages/DeliveryView.jsx`
- `Test-Path src/utils/furnitureCategory.js`
- `Test-Path src/utils/seoRoutes.js`
- `Test-Path _DOCS/SEO_ROADMAP_REFACTOR_2026.md`
- `git status --short --branch`

Points encore non couverts :

- Smoke visuel navigateur complet apres les derniers changements locaux.
- Captures mobile 390x844 et laptop 1366x768.
- Validation humaine de l'emplacement du contenu categorie visible.
- Rich Results Test Google apres deploy.
- Search Console apres deploy.
- Deploy Hosting/Functions, uniquement apres accord explicite.

Conclusion d'audit :

- La reprise SEO a avance jusqu'au point ou la suite devient visible dans l'UI.
- Le prochain travail code doit attendre validation, car il touche la page marketplace que le client veut conserver intacte.
- Le goal global de roadmap SEO ne doit pas etre marque termine : il reste des gates visuels et post-deploy.

---

## Chapitre 14 - Handoff prochain agent

Date : 7 mai 2026  
Statut : point d'arret final pour reprise demain

Demande utilisateur au moment de l'arret :

- Documenter `SEOlivre.md`.
- Dire exactement ou la roadmap s'arrete.
- Mettre la roadmap a jour pour que le prochain agent reparte sur une base propre.
- Ne pas continuer a coder ce soir.

Etat technique au point d'arret :

- `npm run build` a ete relance et passe OK.
- Warning restant : chunks > 500 kB, non bloquant SEO/deploy.
- Une preview locale a ete lancee sur le port `4194`, puis stoppee avant arret.
- Aucun smoke visuel complet n'a ete termine apres ce dernier build.
- Aucun deploy prod.
- Aucune ecriture Firestore prod.
- Aucun import sandbox vers prod.

Travail SEO local deja fait :

- Routes propres :
  - `/`
  - `/meubles-anciens`
  - `/meubles-anciens/buffets`
  - `/meubles-anciens/tables-de-ferme`
  - `/meubles-anciens/armoires`
  - `/meubles-anciens/commodes-chevets`
  - `/meubles-anciens/chaises-bancs`
  - `/meubles-anciens/autres`
  - `/planches-a-decouper-anciennes`
  - `/comptoir`
  - `/a-propos`
  - `/livraison-meubles-anciens-france`
  - `/produit/slug-id`
- SEO invisible :
  - titles/descriptions/canonicals ;
  - JSON-LD `CollectionPage`, `BreadcrumbList`, `ItemList`, `Product`, `Offer`, `FAQPage`, `FurnitureStore`, `LocalBusiness` ;
  - sitemap/shareMeta cote Functions ;
  - index/manifest nettoyes.
- SEO visible deja ajoute :
  - Comptoir : contenu boutique bois/entretien + FAQ ;
  - Livraison : page editoriale dediee ;
  - A propos : schema local renforce.

Point exact ou la roadmap s'arrete :

- La prochaine phase utile est le contenu SEO visible par categorie sur la marketplace.
- Cette phase est bloquee volontairement car elle touche la page meubles/marketplace que l'utilisateur ne veut surtout pas casser.
- Aucun bloc texte categorie ne doit etre code avant validation humaine de l'emplacement et du style.

Decision a prendre demain avant de coder :

1. Choisir l'emplacement du contenu categorie :
   - option A : sous la barre categories/filtres, avant la grille ;
   - option B : apres les 8 ou 12 premiers produits ;
   - option C : bloc discret/repliable en bas de page.
2. Choisir si la page Comptoir garde le nom `Le Comptoir` ou devient `Shop`/`Boutique` dans les libelles visibles.
3. Choisir si la page livraison reste seulement dans le footer ou si un lien discret est ajoute aux fiches produit.

Premiere action recommandee au prochain agent :

1. Lire `SEOlivre.md` chapitres 10 a 14.
2. Lancer :
   - `npm run build`
   - `npm run preview -- --host 127.0.0.1 --port 4194`
3. Faire un smoke visuel local sur :
   - `/`
   - `/meubles-anciens`
   - `/meubles-anciens/buffets`
   - `/planches-a-decouper-anciennes`
   - `/produit/test-id`
   - `/comptoir`
   - `/livraison-meubles-anciens-france`
   - `/a-propos`
4. Capturer au minimum :
   - mobile 390x844 ;
   - laptop 1366x768.
5. Verifier :
   - pas de chevauchement ;
   - menu mobile intact ;
   - header intact ;
   - grille meubles intacte ;
   - cartes produits intactes ;
   - filtres toujours ergonomiques ;
   - pas de texte coupe ;
   - aucune regression evidente sur Comptoir et Livraison.
6. Stopper la preview locale apres test.

Regles de securite a conserver :

- Ne jamais deployer en prod sans accord explicite.
- Ne jamais ecrire dans Firestore prod pour le SEO.
- Ne jamais importer de donnees sandbox vers prod.
- Ne pas changer les cartes meubles, planches, masonry, filtres ou animations sans validation.
- Tout changement visible marketplace doit etre petit, reversible et teste mobile/tablette/laptop/desktop.

Definition de "pret pour la suite" :

- Smoke visuel local OK.
- Emplacement du contenu categorie valide.
- Style du contenu categorie valide.
- Textes categories valides ou au moins limites a des micro-copies prudentes.

Definition de "pret deploy SEO" :

- Smoke visuel local OK.
- `npm run build` OK.
- Preview locale OK.
- Accord explicite utilisateur.
- Deploy Functions si sitemap/shareMeta doit partir.
- Deploy Hosting seulement apres validation finale.
- Apres deploy : Rich Results Test, inspection Search Console, verification sitemap.

---

## Chapitre 15 - Tracking Comptoir et analytics affiliation

Date : 7 mai 2026  
Statut : implemente localement, aucun deploy

Objectif :

- Adapter le tracking utilisateur apres les nouvelles pages SEO et routes propres.
- Fiabiliser le suivi des visites directes sur `/comptoir`.
- Mieux tracer les clics "Decouvrir" du Comptoir vers les liens externes, notamment Amazon.
- Ajouter dans l'onglet admin "Boutique Affiliation" un graphe des visiteurs du Comptoir avec les intervalles demandes : 1H, 5H, 1J, 2 semaines, 1 mois, 3 mois, 6 mois, 1 an.
- Ajouter une estimation du temps moyen passe sur Le Comptoir.

Fichiers touches :

- `src/components/shared/AnalyticsProvider.jsx`
- `src/utils/tracking.js`
- `src/features/admin/AdminAnalytics.jsx`
- `SEOlivre.md`

Changements :

- `AnalyticsProvider.jsx` :
  - reecriture propre en ASCII ;
  - conservation des gardes anti-double session ;
  - enregistrement de la vue initiale juste apres `initLiveSession`, pour que les arrivees directes sur `/comptoir`, `/livraison-meubles-anciens-france`, `/a-propos`, etc. apparaissent dans le parcours ;
  - deduplication de la meme vue via une cle stable ;
  - conservation du tracking des clics affiliation dans le journey sous `affiliate_shop_grid`, `affiliate_shop_tutorial` ou `affiliate_gallery_detail`.
- `tracking.js` :
  - ajout de `referrer: window.location.pathname || '/'` dans `affiliate_clicks`, champ deja autorise par les rules ;
  - l'ouverture externe reste prioritaire et ne depend pas de l'ecriture Firestore.
- `AdminAnalytics.jsx` :
  - ajout de labels lisibles pour les nouvelles pages du parcours : Marketplace, Fiche produit, Le Comptoir, Livraison, A propos, Checkout, Mes commandes ;
  - ajout de labels pour les clics affiliation : Clic Comptoir, Clic Tutoriel Comptoir, Clic depuis fiche meuble ;
  - ajout des filtres boutique : 1H, 5H, 1J, 2 Sem., 1 Mois, 3 Mois, 6 Mois, 1 An ;
  - ajout d'un graphe "Visiteurs sur Le Comptoir" calcule depuis les sessions ayant une etape Comptoir ou un clic Comptoir ;
  - ajout des KPIs boutique : visiteurs Comptoir uniques, temps moyen Comptoir estime, clics Amazon, produits cliques ;
  - conservation du graphe d'evolution des clics sortants.

Impact SEO / data :

- Les nouvelles routes SEO deviennent visibles dans les parcours admin au lieu de rester des noms techniques.
- Les visites directes du Comptoir sont comptabilisables apres initialisation de session, ce qui etait fragile avant.
- Le Comptoir peut maintenant etre lu comme une page avec trafic propre, temps moyen estime et clics sortants, pas seulement comme une collection de clics affilies.

Limites :

- Les graphes admin restent calcules sur les sessions chargees par `AdminAnalytics` (`limit(1000)`) et les clics charges (`limit(3000)`).
- Le temps moyen Comptoir est une estimation basee sur les durees entre etapes de journey. Pour les anciennes sessions sans etape `shop`, le calcul utilise prudemment les clics Comptoir comme signal de repli.
- Aucune migration historique Firestore n'a ete faite.

Risque UI :

- Faible a moyen : changement limite a l'onglet admin "Boutique Affiliation" et au rendu des libelles de parcours.
- Aucune modification visuelle des pages publiques Comptoir, marketplace, meubles ou planches.

Tests :

- `npm run build` OK.
- Aucun deploy.
- Aucune ecriture Firestore prod.

Reste a faire :

- Smoke test admin visuel sur l'onglet "Boutique Affiliation".
- Verifier en environnement local/sandbox qu'une arrivee directe sur `/comptoir` cree bien une etape `shop` dans `analytics_sessions.journey` apres heartbeat.
- Verifier qu'un clic "Decouvrir" cree un document `affiliate_clicks` avec `source`, `sessionId` si disponible et `referrer`.

---

## Chapitre 16 - Contenu categorie visible marketplace

Date : 7 mai 2026  
Statut : implemente localement, aucun deploy

Objectif :

- Reprendre la phase gatee du chapitre 11 apres validation implicite de reprise.
- Ajouter du contenu SEO visible par categorie sans transformer la marketplace en landing page.
- Garder intactes les cartes produits, le masonry, les filtres, le tri et les animations.
- Ne pas creer de nouvelle page : les routes propres existantes restent identiques.

Fichiers touches :

- `src/data/categorySeoContent.js`
- `src/designs/architectural/MarketplaceLayout.jsx`
- `SEOlivre.md`

Changements :

- Ajout de `src/data/categorySeoContent.js` :
  - micro-contenu pour buffets, tables de ferme, chaises/bancs, armoires, commodes/chevets, autres meubles ;
  - micro-contenu pour les planches a decouper anciennes ;
  - liens internes discrets vers categories liees, livraison, Comptoir ou A propos.
- Ajout du composant `CategorySeoIntro` dans `MarketplaceLayout.jsx` :
  - rendu sous les categories/filtres, juste avant la grille ;
  - structure non cardee, simple `border-y`, pour rester secondaire face aux produits ;
  - responsive mobile en une colonne, desktop en deux colonnes ;
  - texte court, sans bourrage de mots-cles.
- Affichage conditionnel :
  - visible sur les pages categories meubles ;
  - visible sur `/planches-a-decouper-anciennes` ;
  - masque sur `/meubles-anciens` general ;
  - masque des qu un filtre avance matiere/prix est actif, pour ne pas melanger contenu categorie et resultats filtres.

Impact SEO :

- Les pages categories ont maintenant un contenu indexable visible, coherent avec leurs titles/descriptions et schemas existants.
- Le maillage interne renforce les liens entre categories, livraison, Comptoir et page atelier.
- Aucun schema n a ete modifie : le contenu visible soutient les schemas deja presents sans dupliquer les signaux.

Impact admin data :

- Aucune nouvelle route et aucun changement de nom de page n'ont ete ajoutes.
- L'onglet data admin n'a donc pas besoin d'un nouveau mapping de page pour cette etape.
- Rappel maintenu : si une prochaine etape cree ou renomme une page, `src/features/admin/AdminAnalytics.jsx` devra etre mis a jour avec le libelle de parcours correspondant.

Risque UI :

- Faible a moyen : contenu visible sur marketplace, mais limite a un bloc compact sous les filtres.
- Les cartes produits, le masonry, le tri et les filtres ne sont pas modifies.
- Le bloc disparait quand les filtres avancés s appliquent.

Tests :

- `npm run build` OK.
- Preview locale lancee sur `http://127.0.0.1:4195`.
- Routes testees en HTTP 200 :
  - `/meubles-anciens/buffets`
  - `/meubles-anciens/tables-de-ferme`
  - `/meubles-anciens/armoires`
  - `/meubles-anciens/commodes-chevets`
  - `/meubles-anciens/chaises-bancs`
  - `/meubles-anciens/autres`
  - `/planches-a-decouper-anciennes`
- Verification bundle : les textes categories sont presents dans `dist/assets/GalleryView-*.js`.
- `git diff --check` OK hors warnings CRLF Windows.

---

## Chapitre 19 - Schema local A propos aligne

Date : 7 mai 2026
Statut : deploy Hosting prod effectue, controles publics OK, validation Search Console restante

Objectif :

- Continuer la roadmap SEO sur un lot invisible.
- Corriger le schema local de la page `/a-propos`.
- Aligner les signaux business de la page A propos avec le schema statique racine deja present dans `index.html`.

Fichiers touches :

- `src/pages/HomeView.jsx`
- `SEOlivre.md`

Changements :

- Correction du `priceRange` invalide :
  - avant : `EUR EUR-EUR EUR EUR` ;
  - apres : `EUR 500 - EUR 3000`.
- Ajout du `logo` dans le schema `FurnitureStore` / `LocalBusiness`.
- Extension de `areaServed` :
  - Ifs ;
  - Caen ;
  - Deauville ;
  - Bayeux ;
  - Normandie ;
  - France.
- Extension de `sameAs` :
  - Instagram ;
  - TikTok ;
  - Facebook ;
  - Le Bon Coin ;
  - Google Maps.
- Ajout de `hasOfferCatalog` :
  - tables de ferme anciennes ;
  - buffets et armoires anciennes ;
  - commodes, chevets, chaises et bancs anciens ;
  - planches a decouper anciennes et bois massif.

Impact SEO :

- Le schema local de `/a-propos` devient plus propre et coherent.
- Google recoit des signaux business plus complets sur l atelier, les zones desservies et les familles de produits.
- Aucun contenu visible n est modifie.

Impact admin data :

- Aucune nouvelle route.
- Aucun renommage de page.
- Aucun nouveau type d evenement analytics.
- `src/features/admin/AdminAnalytics.jsx` n a donc pas besoin de modification pour cette etape.

Tests :

- `npm run build` OK.
- Preview locale `/a-propos` : HTTP 200.
- Verification bundle : `EUR 500 - EUR 3000` present dans `dist/assets/index-*.js`.
- Verification source : `hasOfferCatalog`, `instagram.com/tous.table.made.in`, `tiktok.com/@tous.table.made.in`, `leboncoin.fr/boutique/tous-a-table-made-in-normandie` presents dans `src/pages/HomeView.jsx`.
- `git diff --check` OK hors warnings CRLF Windows.

---

## Chapitre 20 - Audit visuel pre-deploy SEO

Date : 7 mai 2026
Statut : audit local effectue, aucun deploy

Objectif :

- Verifier les surfaces SEO visibles avant de continuer la roadmap.
- S assurer que les ajouts SEO ne cassent pas la disposition principale des meubles.
- Controler desktop et mobile sur les pages les plus sensibles.

Pages auditees en preview locale :

- `/meubles-anciens/buffets`
- `/planches-a-decouper-anciennes`
- `/comptoir`
- `/livraison-meubles-anciens-france`
- `/a-propos`

Captures generees :

- `buffets-desktop.png` en 1366 x 1600
- `buffets-mobile.png` en 390 x 1400
- `planches-desktop.png` en 1366 x 1600
- `comptoir-desktop.png` en 1366 x 1600
- `comptoir-mobile.png` en 390 x 1400
- `livraison-desktop.png` en 1366 x 1600
- `livraison-mobile.png` en 390 x 1400
- `apropos-desktop.png` en 1366 x 1400

Constats :

- La page categorie meubles conserve son hero, ses filtres, son tri et sa zone masonry.
- Le bloc SEO categorie apparait sous les filtres, avant la grille, sans remplacer la disposition principale.
- La grille principale n a pas ete modifiee pendant cet audit.
- Le Comptoir mobile affiche le bloc editorial et les liens internes sans casser le layout.
- La page livraison affiche la carte France + villes + flux sans page blanche.
- `/a-propos` reste accessible en preview.

Limites :

- La preview locale peut ne pas contenir tous les produits prod. Une categorie peut afficher `Aucune piece disponible` sans indiquer une regression de layout.
- Sur mobile, le hero marketplace est haut : le bloc SEO categorie peut etre sous le premier ecran. C est conforme au layout existant, a verifier humainement avant deploy.
- Les captures ne remplacent pas un smoke humain complet sur iPhone/Android reel.

Decision :

- Aucun changement de design supplementaire n a ete fait dans ce chapitre.
- Pas de modification admin data : aucune page creee ou renommee.
- Prochaine etape : audit SEO technique routes, canonicals, schemas et sitemap/shareMeta.

---

## Chapitre 21 - Audit SEO technique routes schemas sitemap

Date : 7 mai 2026
Statut : audit local effectue, aucun deploy

Objectif :

- Verifier la coherence entre routes publiques, canonicals, schemas JSON-LD, sitemap et shareMeta.
- Recontroler les Functions SEO sans les redeployer.
- Identifier ce qui reste obligatoirement post-deploy.

Routes controlees en HTTP preview :

- `/`
- `/meubles-anciens`
- `/meubles-anciens/buffets`
- `/planches-a-decouper-anciennes`
- `/comptoir`
- `/livraison-meubles-anciens-france`
- `/a-propos`

Resultat :

- Toutes les routes ci-dessus repondent en HTTP 200 sur `http://127.0.0.1:4195`.
- `SEO.jsx` conserve la generation du canonical via `resolvedUrl`.
- `GalleryView.jsx` couvre :
  - `CollectionPage`
  - `BreadcrumbList`
  - `ItemList`
  - `Product` dans les items de liste.
- `ShopView.jsx` couvre :
  - `CollectionPage`
  - `BreadcrumbList`
  - `FAQPage`
  - `ItemList` Comptoir.
- `DeliveryView.jsx` couvre :
  - `WebPage`
  - `BreadcrumbList`
  - `FAQPage`.
- `HomeView.jsx` couvre `/a-propos` avec :
  - `WebPage`
  - `WebSite`
  - `FurnitureStore`
  - `LocalBusiness`
  - `BreadcrumbList`
  - `FAQPage`.
- `ArchitecturalProductDetail.jsx` couvre les fiches produit avec :
  - `Product`
  - `Offer`
  - `UsedCondition`
  - `FurnitureStore`
  - `BreadcrumbList`.

Sitemap / shareMeta :

- `functions/src/seo/seoTools.js` contient toutes les routes SEO publiques :
  - `/meubles-anciens`
  - `/meubles-anciens/buffets`
  - `/meubles-anciens/tables-de-ferme`
  - `/meubles-anciens/armoires`
  - `/meubles-anciens/commodes-chevets`
  - `/meubles-anciens/chaises-bancs`
  - `/meubles-anciens/autres`
  - `/planches-a-decouper-anciennes`
  - `/comptoir`
  - `/a-propos`
  - `/livraison-meubles-anciens-france`
- `ROUTE_SHARE_META` couvre les memes routes principales.
- Les chemins produit dynamiques utilisent `getProductPath`.

Verifications techniques :

- `node --check functions/src/seo/seoTools.js` OK.
- `node --check functions/helpers/config.js` OK.
- Verification bundle :
  - `Livraison meubles anciens France` present dans `DeliveryView-*.js`.
  - `Product` / schemas produit retrouves dans `ProductDetail-*.js` et `GalleryView-*.js`.
  - `ItemList` retrouve dans les bundles.

Limites :

- Le dump DOM Chrome complet des metas/canonicals a timeoute sur un lot de routes. L audit local s appuie donc sur :
  - verification source ;
  - build Vite ;
  - presence bundle ;
  - HTTP preview.
- Rich Results Test et Search Console ne peuvent etre consideres comme valides qu apres deploy public.

Decision :

- Aucun changement code effectue dans ce chapitre.
- Aucun deploy.
- Aucun besoin de modifier `AdminAnalytics.jsx`, car aucune route n a ete creee ou renommee.
- Prochaine etape : preflight deploy et controles securite/vulnerabilites sans deploy prod.

---

## Chapitre 22 - Preflight deploy securite et dependances

Date : 7 mai 2026
Statut : fait localement, aucun deploy

Objectif :

- Auditer le lot SEO avant deploy sans pousser en production.
- Verifier le bundle prod, les dependances runtime, les Functions et les regles Firestore.
- Corriger les vulnerabilites qui peuvent etre traitees sans migration lourde.

Fichiers touches :

- `package.json`
- `package-lock.json`
- `firestore.rules`
- `src/utils/csvExport.js`
- `src/features/admin/AdminNewsletter.jsx`
- `src/features/admin/AdminOrders.jsx`
- `src/features/admin/AdminDashboard.jsx`
- `src/features/admin/AdminAuctions.jsx`
- `SEOlivre.md`

Actions securite :

- `postcss` mis a jour en `8.5.14`.
- `protobufjs` mis a jour en `7.5.6`.
- `dompurify` mis a jour en `3.4.2`.
- `brace-expansion` mis a jour en `1.1.14`.
- Suppression de `xlsx@0.18.5`, qui avait deux alertes high sans correctif npm officiel.
- Remplacement des exports admin XLSX par un export CSV local :
  - pas de dependance externe ;
  - separateur `;` adapte Excel FR ;
  - BOM UTF-8 ;
  - protection contre l injection de formule CSV pour les cellules commencant par `=`, `+`, `-` ou `@`.
- Durcissement Firestore de `affiliate_clicks` :
  - liste de champs autorises conservee ;
  - validation stricte des types ;
  - tailles maximales ;
  - `tier` limite a `essentiel`, `premium`, `expert` ;
  - `timestamp` obligatoire en type timestamp ;
  - champs optionnels encadres.

Verifications :

- `npm audit --omit=dev --json` : 0 vulnerabilite runtime/prod.
- `npm audit --json` : 2 vulnerabilites moderate restantes en dev-only :
  - `vite@5.4.21` ;
  - `esbuild@0.21.5`.
- Le correctif npm propose pour Vite exige une migration majeure vers `vite@8.0.11`. Decision : ne pas faire cette migration dans le preflight SEO, car elle touche l outillage de build/dev et doit etre testee comme chantier dedie.
- `npm run build:prod` OK.
- `npm run verify:prod-bundle` OK :
  - 40 fichiers scannes ;
  - aucune config sandbox ;
  - aucun loader Stripe actif.
- `npm run verify:prod-env` OK :
  - Firebase prod ;
  - namespace prod ;
  - paiements carte desactives.
- `npm run verify:prod-furniture` OK :
  - lecture prod uniquement ;
  - 28 meubles ;
  - 28 mappings categorie ;
  - aucun `missing`, `extra` ou `invalidCategories`.
- `npm run verify:functions-syntax` OK.
- `firebase deploy --only firestore:rules --dry-run --project tatmadeinnormandie` OK :
  - regles Firestore compilees ;
  - dry-run uniquement ;
  - aucun deploy.
- `git diff --check` OK hors warnings CRLF Windows.

Impact SEO :

- Aucun changement de route.
- Aucun changement de la grille meubles/planches.
- Le bundle prod est plus propre : le gros chunk `xlsx` a disparu, remplace par un helper CSV de moins d 1 kB.

Risque UI :

- Public : nul, aucune page publique modifiee dans ce chapitre.
- Admin : les exports passent de `.xlsx` a `.csv`. C est volontaire pour retirer une dependance vulnérable sans migrer vers une autre librairie lourde.

Reste a faire :

- Programmer un chantier separe pour la migration Vite majeure si on veut supprimer les deux alertes dev-only restantes.
- Avant deploy prod, refaire un smoke admin export CSV sur sandbox.

---

## Chapitre 23 - Audit admin data analytics apres roadmap SEO

Date : 7 mai 2026
Statut : fait localement, aucun deploy

Objectif :

- Verifier le rappel utilisateur : si une page est ajoutee ou renommee, la page data admin doit rester coherente.
- Auditer le tracking de parcours et les libelles admin apres les routes SEO.
- Verifier que les durcissements securite ne touchent pas la disposition marketplace.

Fichiers audites :

- `src/App.jsx`
- `src/utils/seoRoutes.js`
- `src/components/shared/AnalyticsProvider.jsx`
- `src/utils/tracking.js`
- `src/features/admin/AdminAnalytics.jsx`
- `firestore.rules`

Constats routes / analytics :

- Les routes SEO publiques ne creent pas de nouveaux types de vue :
  - `/meubles-anciens` et les categories restent `gallery` ;
  - `/planches-a-decouper-anciennes` reste `gallery` avec collection `cutting_boards` ;
  - `/comptoir` reste `shop` ;
  - `/livraison-meubles-anciens-france` reste `delivery` ;
  - `/a-propos` reste `about`.
- `AdminAnalytics.jsx` contient deja les libelles utiles :
  - `about` -> `A propos` ;
  - `gallery` -> `Marketplace` ;
  - `shop` -> `Le Comptoir` ;
  - `delivery` -> `Livraison` ;
  - `detail` -> `Fiche produit`.
- Le suivi affiliation garde ses evenements dedies :
  - `affiliate_shop_grid` ;
  - `affiliate_shop_tutorial` ;
  - `affiliate_gallery_detail`.
- Aucun renommage de page n impose une modification supplementaire de `AdminAnalytics.jsx`.

Constats securite data :

- `AnalyticsProvider` ne cree pas de session tant que l auth n est pas resolue et ignore les admins.
- Les sessions analytics restent ecrites par Cloud Functions, pas directement par le client.
- Les clics affiliation restent creables par les visiteurs authentifies anonymes, mais la regle Firestore impose maintenant un schema strict.
- `trackAffiliateClick` ouvre le lien partenaire avec `noopener,noreferrer`.
- Les exports admin ne chargent plus `xlsx`.

Limites :

- Pas de smoke admin reel avec compte client dans ce chapitre, pour eviter toute ecriture non validee en donnees client.
- Pas de deploy Firestore rules ou Hosting.
- Les captures visuelles publiques deja faites ne remplacent pas un test manuel admin export CSV en sandbox.

Decision :

- Aucun changement necessaire dans `src/features/admin/AdminAnalytics.jsx`.
- La grille principale meubles/planches n a pas ete modifiee.
- Les points critiques avant deploy sont maintenant documentes.

---

## Chapitre 24 - Gate automatisable roadmap SEO

Date : 7 mai 2026
Statut : fait localement, aucun deploy

Objectif :

- Continuer la roadmap avec un audit de fin de section reproductible.
- Eviter que les prochains changements SEO cassent silencieusement une route, un schema, le sitemap, `shareMeta`, l analytics admin ou les durcissements securite.
- Integrer ce controle au preflight existant sans deploy.

Fichiers touches :

- `scripts/verify-seo-roadmap.mjs`
- `scripts/preflight-prod.mjs`
- `package.json`
- `SEOlivre.md`

Controle ajoute :

- Nouvelle commande :
  - `npm run verify:seo-roadmap`
- Integration dans :
  - `npm run preflight:prod`

Le verificateur controle :

- `functions/src/seo/seoTools.js` :
  - toutes les routes SEO publiques sont dans `CATEGORY_URLS` ;
  - toutes les routes SEO publiques sont couvertes par `ROUTE_SHARE_META` ;
  - les balises Open Graph, Twitter et canonical existent dans `shareMeta`.
- `src/utils/seoRoutes.js` :
  - les routes SEO sont reconnues cote client ;
  - les vues `about`, `shop`, `delivery`, `gallery` sont toujours mappees.
- `src/components/shared/SEO.jsx` :
  - canonical ;
  - JSON-LD ;
  - Open Graph ;
  - Twitter card.
- Schemas attendus :
  - `GalleryView.jsx` : `CollectionPage`, `BreadcrumbList`, `ItemList`, `Product` ;
  - `ShopView.jsx` : `CollectionPage`, `BreadcrumbList`, `FAQPage`, `ItemList` ;
  - `DeliveryView.jsx` : `WebPage`, `BreadcrumbList`, `FAQPage` ;
  - `HomeView.jsx` : `FurnitureStore`, `LocalBusiness`, `hasOfferCatalog`, `FAQPage`, `BreadcrumbList` ;
  - `ArchitecturalProductDetail.jsx` : `Product`, `Offer`, `UsedCondition`, `FurnitureStore`, `BreadcrumbList`.
- `AdminAnalytics.jsx` :
  - libelles des vues SEO ;
  - evenements affiliation.
- `firestore.rules` :
  - schema strict `affiliate_clicks`.
- Dependances :
  - `xlsx` absent de `package.json` ;
  - aucun usage XLSX runtime dans `src`.
- Documentation :
  - chapitres 20 a 23 presents dans `SEOlivre.md`.

Verifications :

- `npm run verify:seo-roadmap` OK :
  - 16 checks passes.
- `npm run build:prod` OK.
- `npm run preflight:prod` OK :
  - config prod OK ;
  - 28 meubles prod, 28 mappings categorie, aucun missing/extra/invalid ;
  - gate SEO roadmap OK ;
  - Functions syntax OK ;
  - build prod OK ;
  - bundle prod OK, 40 fichiers scannes ;
  - audit Functions prod en lecture seule : 30 Functions, 0 legacy env, 11 secrets branches, runtime `nodejs22` ;
  - aucun deploy.

Impact SEO :

- La roadmap gagne un garde-fou executable a chaque fin de section.
- Les futures modifications de page devront passer ce gate avant deploy.
- Le controle ne remplace pas Search Console ni Rich Results Test apres deploy public.

Impact UI / marketplace :

- Aucun changement visuel.
- Aucune modification de la grille meubles/planches.

Limites :

- Le gate verifie la presence et la coherence source ; il ne valide pas le rendu DOM final comme Googlebot.
- Warning Vite restant : chunks superieurs a 500 kB, non bloquant SEO mais a surveiller performance.
- Les deux alertes dev-only `vite/esbuild` restent liees a une migration majeure Vite.

Reste a faire :

- Smoke visuel manuel preview avant accord deploy.
- Apres deploy public : sitemap public, Rich Results Test, inspection Search Console.

---

## Chapitre 25 - Smoke visuel mobile preview SEO

Date : 7 mai 2026
Statut : implemente localement, aucun deploy

Objectif :

- Reprendre la roadmap SEO par le point restant le plus important : verifier le rendu reel des pages SEO avant tout deploy.
- Auditer les pages publiques fortes en preview, surtout mobile 390 px et desktop.
- Corriger uniquement les debordements visuels qui peuvent nuire a la comprehension SEO/UX.
- Ne pas toucher a la disposition principale des meubles, a la grille produit, ni aux donnees client.

Pages auditees :

- `/meubles-anciens/buffets`
- `/planches-a-decouper-anciennes`
- `/comptoir`
- `/livraison-meubles-anciens-france`
- `/a-propos`

Fichiers touches :

- `src/designs/architectural/MarketplaceLayout.jsx`
- `src/designs/architectural/components/ArchitecturalHeader.jsx`
- `SEOlivre.md`

Constats :

- Les routes SEO testees repondent en HTTP 200 sur la preview locale.
- La page livraison rend bien la carte particulaire France/pays frontaliers.
- La page Comptoir et la page A propos ne presentent pas de page blanche.
- Sur mobile, le hero marketplace avait un debordement horizontal :
  - switcher Mobilier / Planches / Comptoir trop large ;
  - CTA et texte trop proches des limites ;
  - actions du header galerie poussees hors viewport.

Corrections appliquees :

- `MarketplaceLayout.jsx` :
  - switcher mobile transforme en grille compacte 2 colonnes + Comptoir pleine largeur ;
  - reduction mobile des paddings, tailles et tracking des boutons du switcher ;
  - wrapper hero contraint en largeur viewport ;
  - titre, description et CTA ajustes sur mobile pour eviter le clipping horizontal ;
  - ajout de `overflow-x-hidden` au shell marketplace.
- `ArchitecturalHeader.jsx` :
  - contrainte `100vw` explicite sur le header galerie ;
  - login/logout masques sous `sm` sur header galerie mobile pour laisser la place aux actions utiles ;
  - barre d actions mobile galerie dediee : theme, panier, menu ;
  - aucune modification du header desktop/tablette au-dela de la separation mobile.

Garanties UI / catalogue :

- La grille principale meubles/planches n'a pas ete modifiee.
- Les filtres, categories et cartes produit restent dans leur architecture existante.
- Aucun changement de route publique.
- Aucun changement de libelle de page analytics.
- `src/features/admin/AdminAnalytics.jsx` n'a donc pas besoin de modification pour ce lot.

Verifications :

- `npm run preflight:prod` OK :
  - config prod OK ;
  - 28 meubles prod, mappings categories OK ;
  - gate SEO roadmap OK ;
  - Functions syntax OK ;
  - build prod OK ;
  - bundle prod OK ;
  - audit Functions prod lecture seule : 30 Functions, 0 legacy env, 11 secrets, runtime `nodejs22` ;
  - aucun deploy.
- `npm run build:prod` OK.
- `npm run verify:seo-roadmap` OK :
  - 16 checks passes.
- `npm run verify:prod-bundle` OK :
  - 40 fichiers scannes ;
  - aucun config sandbox ;
  - aucun loader Stripe actif dans le bundle.
- `git diff --check` OK hors warnings CRLF Windows sur les deux fichiers UI touches.
- Captures Edge headless :
  - `buffets-mobile-preview-after3.png` : header mobile, switcher, CTA visibles ;
  - `planches-mobile-preview-after.png` : header mobile, switcher, CTA visibles ;
  - captures precedentes desktop/mobile conservees dans le dossier temporaire local de smoke.

Limites :

- Les captures ont ete faites en preview locale, pas sur le domaine public.
- Le texte anime `TextType` peut etre capture en cours de frappe ; ce n'est pas un bug SEO.
- Les warnings de taille de chunks Vite restent non bloquants mais a surveiller pour la performance.
- Les tests Search Console / Rich Results restent a faire apres deploy public.

Reste a faire :

- Accord explicite avant deploy Hosting.
- Apres deploy : verifier sitemap public, Rich Results Test et inspection Search Console.

---

## Chapitre 26 - Audit public sitemap et prerequis Search Console

Date : 7 mai 2026
Statut : audit public effectue, deploy prod requis, aucun deploy

Objectif :

- Passer du smoke local aux controles publics :
  - sitemap public ;
  - Rich Results Test ;
  - inspection Search Console.
- Verifier l'etat reel du domaine `https://tousatable-madeinnormandie.fr` avant de demander les tests Google.

Checks publics effectues :

- Nouvelle commande ajoutee :
  - `npm run audit:public-seo`
- Role de la commande :
  - verifier `robots.txt` ;
  - verifier `/sitemap.xml` ;
  - verifier la presence des routes propres dans le sitemap ;
  - echouer si des URLs legacy en query string restent dans le sitemap ;
  - verifier les routes publiques HTTP 200 ;
  - verifier `shareMeta` direct sur les routes SEO fortes.
- Routes publiques testees en HTTP :
  - `/` : HTTP 200 ;
  - `/sitemap.xml` : HTTP 200 ;
  - `/robots.txt` : HTTP 200 ;
  - `/meubles-anciens` : HTTP 200 ;
  - `/meubles-anciens/buffets` : HTTP 200 ;
  - `/planches-a-decouper-anciennes` : HTTP 200 ;
  - `/comptoir` : HTTP 200 ;
  - `/livraison-meubles-anciens-france` : HTTP 200 ;
  - `/a-propos` : HTTP 200.
- `robots.txt` public :
  - `User-agent: *`
  - `Allow: /`
  - `Sitemap: https://tousatable-madeinnormandie.fr/sitemap.xml`

Blocage constate :

- `npm run audit:public-seo` echoue volontairement tant que la prod sert l'ancien SEO :
  - 11 checks failed au 7 mai 2026 ;
  - les routes publiques sont en 200, mais sitemap/shareMeta sont obsoletes.
- Le sitemap public est encore l'ancien sitemap prod :
  - `loc_count = 59` ;
  - `clean_route_count = 0` ;
  - `query_url_count = 58` ;
  - premiere URL propre OK : `/` ;
  - puis anciennes URLs : `/?page=gallery`, `/?product=...`.
- Les routes SEO propres ne sont pas encore dans le sitemap public :
  - `/meubles-anciens` absent ;
  - `/meubles-anciens/buffets` absent ;
  - `/planches-a-decouper-anciennes` absent ;
  - `/comptoir` absent ;
  - `/livraison-meubles-anciens-france` absent ;
  - `/a-propos` absent.
- URL directe Cloud Function prod :
  - `https://us-central1-tousatable-client.cloudfunctions.net/sitemap` retourne aussi l'ancien sitemap ;
  - `shareMeta?path=/meubles-anciens` retourne encore le titre legacy `Ma Boutique`.

Conclusion technique :

- Le code local est pret et verifie par `npm run preflight:prod`.
- La prod n'a pas encore recu les dernieres Functions `sitemap` / `shareMeta`.
- Rich Results Test et inspection Search Console ne doivent pas etre consideres comme finaux tant que le domaine public ne sert pas le nouveau sitemap et les nouvelles metas.

Acces Search Console :

- Aucun acces Search Console/API utilisable localement n'a ete detecte.
- `gcloud` n'est pas disponible dans l'environnement local.
- L'inspection Search Console demandera :
  - soit une connexion manuelle au compte proprietaire de la propriete ;
  - soit des identifiants API Search Console valides avec acces a la propriete.
- Runbook post-deploy ajoute :
  - `_DOCS/SEO_PUBLIC_GOOGLE_CHECKS.md`
  - contient les URLs Rich Results Test et les etapes Search Console a documenter.

Risque :

- Lancer Rich Results Test maintenant testerait l'ancien etat public, pas la roadmap locale finalisee.
- Soumettre le sitemap maintenant dans Search Console resoumettrait un sitemap qui ne contient pas les URLs propres.

Prochaine action recommandee :

- Demander accord explicite pour deploy prod :
  - Functions : `sitemap`, `shareMeta` ;
  - Hosting : build public si les dernieres pages/schema/UI doivent aussi etre en ligne.
- Apres deploy :
  - lancer `npm run audit:public-seo` ;
  - re-fetch `/sitemap.xml` et verifier `clean_route_count > 0`, `query_url_count = 0` ou fortement reduit selon politique produit ;
  - lancer Rich Results Test sur les URLs propres ;
  - faire inspection Search Console et demander indexation des pages strategiques.

---

## Chapitre 27 - Deploy prod SEO et audit public vert

Date : 7 mai 2026
Statut : deploy prod effectue, audits publics OK, Search Console manuel restant

Accord utilisateur :

- L'utilisateur a valide le deploy prod SEO apres demande d'audit prealable.
- Workflow suivi :
  - `.agent/workflows/production_workflow.md` ;
  - `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`.

Audit pre-deploy :

- `firebase use` avant ciblage : `tatmadeinnormandie`.
- `firebase use prod` OK :
  - alias `prod` ;
  - projet `tousatable-client`.
- `npm run preflight:prod` OK :
  - config prod OK ;
  - namespace prod OK ;
  - paiements carte desactives ;
  - 28 meubles prod ;
  - 28 mappings categories ;
  - aucun mapping manquant, extra ou invalide ;
  - gate SEO roadmap OK ;
  - syntax Functions OK ;
  - build prod OK ;
  - bundle prod OK ;
  - audit Functions prod avant deploy : 30 Functions, 0 legacy env, 11 secrets.

Deploy effectue :

```bash
firebase deploy --only functions:sitemap,functions:shareMeta,hosting --project tousatable-client
```

Resultat :

- `sitemap(us-central1)` update OK.
- `shareMeta(us-central1)` update OK.
- Hosting `tousatable-client` release OK.
- Aucun import sandbox.
- Aucune ecriture Firestore prod.

Securisation apres deploy :

- `firebase use default` OK :
  - retour sur `tatmadeinnormandie`.
- Le deploy Firebase a reintroduit automatiquement des variables d'environnement non secretes sur `sitemap` et `shareMeta` :
  - `FIREBASE_CONFIG` ;
  - `GCLOUD_PROJECT` ;
  - `EVENTARC_CLOUD_EVENT_SOURCE`.
- Nettoyage refait via API Cloud Functions `updateMask=environmentVariables`, sans afficher de valeur sensible.
- Audit final Functions :
  - `functions = 30` ;
  - `functionsWithLegacyEnv = 0` ;
  - `legacyEnvTotal = 0` ;
  - `secretTotal = 11` ;
  - runtime `nodejs22`.

Audit public SEO apres deploy :

- Commande :

```bash
npm run audit:public-seo
```

- Resultat :
  - 32 checks passes.
- Sitemap public :
  - HTTP 200 ;
  - `loc_count = 69` ;
  - routes propres requises presentes ;
  - `query_url_count = 0` ;
  - `product_path_url_count = 57`.
- `robots.txt` :
  - HTTP 200 ;
  - pointe vers `https://tousatable-madeinnormandie.fr/sitemap.xml`.
- Routes publiques HTTP 200 :
  - `/` ;
  - `/meubles-anciens` ;
  - `/meubles-anciens/buffets` ;
  - `/meubles-anciens/tables-de-ferme` ;
  - `/meubles-anciens/armoires` ;
  - `/meubles-anciens/commodes-chevets` ;
  - `/meubles-anciens/chaises-bancs` ;
  - `/meubles-anciens/autres` ;
  - `/planches-a-decouper-anciennes` ;
  - `/comptoir` ;
  - `/a-propos` ;
  - `/livraison-meubles-anciens-france`.
- `shareMeta` direct OK :
  - `/meubles-anciens` : titre et canonical propres ;
  - `/comptoir` : titre et canonical propres ;
  - `/livraison-meubles-anciens-france` : titre et canonical propres ;
  - `/a-propos` : titre et canonical propres.

Smoke public complementaire :

- `publicCatalog` prod :
  - `furniture = 28` ;
  - `cutting_boards = 29` ;
  - `affiliate_products = 44` ;
  - total public lu = 101 documents.
- Captures Edge headless publiques :
  - `buffets-mobile.png` ;
  - `planches-mobile.png` ;
  - `livraison-desktop.png` ;
  - `comptoir-desktop.png`.
- Verification visuelle :
  - header mobile visible ;
  - switcher mobile visible ;
  - CTA visible ;
  - carte livraison visible.

Checks locaux apres deploy :

- `npm run verify:seo-roadmap` OK :
  - 16 checks passes.
- `firebase use` final :
  - `tatmadeinnormandie`.
- `git status --short` :
  - propre avant ajout de cette note documentaire.

Limites :

- Rich Results Test officiel reste manuel via Google :
  - https://search.google.com/test/rich-results
- Search Console reste manuel cote proprietaire :
  - soumission sitemap ;
  - inspection URL ;
  - demande d'indexation.
- Le dump DOM Edge multi-route a timeoute ; les validations automatisees retenues sont donc `audit:public-seo`, checks HTTP, `shareMeta`, `publicCatalog` et captures headless.

Prochaine etape Google Search Console :

- Soumettre `https://tousatable-madeinnormandie.fr/sitemap.xml`.
- Inspecter et demander indexation pour les URLs strategiques listees dans `_DOCS/SEO_PUBLIC_GOOGLE_CHECKS.md`.
- Me transmettre les captures ou les statuts Search Console / Rich Results pour documentation finale.

---

## Chapitre 18 - Carte particulaire livraison France

Date : 7 mai 2026
Statut : implemente localement, aucun deploy

Objectif :

- Rendre la page livraison plus vivante et plus explicite.
- Montrer visuellement que la livraison part de l atelier de Ifs vers toute la France et peut etre etudiee vers les pays frontaliers.
- Garder la page utile, premium et lisible, sans creer de nouvelle route.

Fichiers touches :

- `src/pages/DeliveryView.jsx`
- `SEOlivre.md`

Changements :

- Ajout d une section `DeliveryParticleMap` sous le hero livraison :
  - carte SVG stylisee en particules ;
  - point depart `IFS`, atelier pres de Caen ;
  - trajectoires animees vers regions francaises et pays frontaliers ;
  - clusters de particules pour Belgique/Luxembourg, Suisse et Espagne ;
  - micro-indicateurs : local 20 km, France, pays frontaliers, sur devis.
- Reprise qualitative de la carte apres retour visuel :
  - contour de France reconstruit depuis des coordonnees lon/lat simplifiees ;
  - particules plus denses et plus petites ;
  - grandes villes en points majeurs : Paris, Bordeaux, Lyon, Marseille, Lille, Nantes, Toulouse, Strasbourg, Rennes, Nice ;
  - ajout de la Corse ;
  - suppression de l allumage des points au scroll.
- Animation GSAP :
  - flux fins animes en continu depuis Ifs vers les villes ;
  - pulse tres discret autour de Ifs ;
  - respect de `prefers-reduced-motion`.
- Retouche visuelle du 8 mai 2026 :
  - contour France affine avec plus de points lon/lat pour une silhouette moins schematique ;
  - bord particulaire plus net, moins jittere ;
  - pulse autour de Ifs corrige sans `scale` SVG, animation par rayon fixe sur le meme centre.
- Amelioration des cartes zones :
  - remplacement des libelles generiques `Zone 01/02/03/04` par des libelles utiles : Remise locale, Trajet regional, Transport France, Sur devis.

Impact SEO / UX :

- La promesse de livraison France entiere et pays frontaliers devient comprehensible en quelques secondes.
- Le texte visible continue de soutenir les requetes livraison meuble ancien France, Caen, Ifs, Normandie et pays frontaliers.
- La page reste sur `/livraison-meubles-anciens-france`.

Impact admin data :

- Aucune nouvelle route.
- Aucun renommage de page.
- Aucun nouveau type d evenement analytics.
- `src/features/admin/AdminAnalytics.jsx` n a donc pas besoin de modification pour cette etape.

Tests :

- `npm run build` OK.
- Preview locale `/livraison-meubles-anciens-france` : HTTP 200.
- Verification bundle `DeliveryView-*.js` : texte livraison et carte presents.
- Captures headless :
  - desktop 1440 x 1400 ;
  - mobile 390 x 1200 ;
  - carte rendue, particules visibles, pas de page blanche.
- `git diff --check` OK hors warnings CRLF Windows.
- `npm run build` OK le 8 mai 2026 apres retouche carte/pulse.

Limite de verification :

- Capture initiale mobile/laptop via Chrome headless effectuee sur `/meubles-anciens/buffets`.
- La capture scrollee exacte du bloc categorie n'a pas ete retenue comme preuve finale car le pilotage CDP local a timeoute. Verification visuelle humaine recommandeee sur la preview avant deploy.

Reste a faire :

- Smoke visuel manuel sur la preview :
  - mobile 390px ;
  - laptop 1366px ;
  - categories meubles ;
  - planches ;
  - filtres matiere/prix pour verifier que le bloc se masque.
- Ne pas deployer Hosting avant accord explicite.

---

## Chapitre 17 - Maillage Comptoir et livraison fiche produit

Date : 7 mai 2026
Statut : implemente localement, aucun deploy

Objectif :

- Continuer la roadmap SEO sans creer de nouvelle page.
- Renforcer le Comptoir comme page editoriale utile autour de l'entretien du bois.
- Ajouter un signal schema sur la selection produits du Comptoir.
- Relier les fiches produit a la page livraison deja creee.

Fichiers touches :

- `src/pages/ShopView.jsx`
- `src/designs/architectural/ArchitecturalProductDetail.jsx`
- `SEOlivre.md`

Changements :

- Ajout d'un `ItemList` schema.org dans le JSON-LD du Comptoir :
  - jusqu'a 24 produits publies recus par la page ;
  - nom, marque, image, description et offre EUR si le prix est disponible ;
  - URL d'offre ramenee a `/comptoir` pour garder le signal centre sur la page locale.
- Ajout d'un maillage visible discret dans le bloc editorial du Comptoir :
  - lien vers `/meubles-anciens` ;
  - lien vers `/livraison-meubles-anciens-france` ;
  - lien vers `/a-propos`.
- Ajout d'un lien discret dans les fiches produit :
  - `Livraison France et pays frontaliers` ;
  - destination `/livraison-meubles-anciens-france` ;
  - place sous la zone prix/actions, sans changer le tunnel panier.

Impact SEO :

- Le Comptoir gagne un signal structure complementaire entre `CollectionPage`, `FAQPage` et liste de produits.
- Les pages fortes se relient mieux : Comptoir, marketplace, atelier et livraison.
- Les fiches produit transmettent plus clairement le contexte livraison, utile pour les requetes meuble ancien + transport/livraison.

Impact admin data :

- Aucune nouvelle route et aucun renommage de page.
- Aucun nouveau type d'evenement analytics.
- `src/features/admin/AdminAnalytics.jsx` n'a donc pas besoin de modification pour ce lot.
- Rappel : si une prochaine etape ajoute une page ou change un libelle de parcours, l'onglet data admin devra etre mis a jour.

Risque UI :

- Faible : ajout de liens texte secondaires, non cardes.
- Le Comptoir garde son layout actuel.
- La fiche produit garde ses CTA panier/encheres inchanges.

Tests :

- `npm run build` OK.
- Preview locale sur `http://127.0.0.1:4195`.
- Routes testees en HTTP 200 :
  - `/comptoir`
  - `/meubles-anciens`
  - `/livraison-meubles-anciens-france`
- Verification bundle :
  - `ItemList` / `Selection entretien bois ancien du Comptoir` presents dans `dist/assets/ShopView-*.js` ;
  - `Voir les meubles anciens` present dans `dist/assets/ShopView-*.js` ;
  - `Livraison France et pays frontaliers` present dans `dist/assets/ProductDetail-*.js`.
- `git diff --check` OK hors warnings CRLF Windows.

---

## Chapitre 28 - Correction Search Console extraits produits

Date : 7 mai 2026
Statut : deploy prod valide par Search Console live

Contexte Search Console :

- URL testee en live : `https://tousatable-madeinnormandie.fr/meubles-anciens`.
- Page indexable et fil d Ariane valide.
- Erreur Rich Results : `Extraits de produits`, 24 elements non valides.
- Message Google : `Il faut indiquer "offers", "review", ou "aggregateRating"`.
- Les captures recues montrent des `Product` issus de la page liste avec `name`, `url`, `image`, mais sans `offers`.

Objectif :

- Corriger les `Product` JSON-LD sans inventer de fausses donnees.
- Ajouter uniquement des `Offer` basees sur un prix reel et un statut stock/vendu exploitable.
- Ne pas ajouter de faux avis, fausses notes ou `aggregateRating`.
- Garder la correction invisible cote UI.

Fichiers touches :

- `src/pages/GalleryView.jsx`
- `src/designs/architectural/ArchitecturalProductDetail.jsx`
- `src/data/legacyFurnitureCategories.js`
- `scripts/verify-seo-roadmap.mjs`
- `SEOlivre.md`

Changements :

- `GalleryView.jsx` :
  - ajout de `getStructuredDataPrice(item)` ;
  - ajout de `getStructuredDataAvailability(item)` ;
  - ajout de `buildProductListSchema(item, url, image)` ;
  - les items de `ItemList` recoivent maintenant un `Product` avec `offers` seulement si le prix est fiable ;
  - si le prix est absent, nul, invalide ou `priceOnRequest`, le `ListItem` garde son URL mais n emet pas de `Product` incomplet.
- `ArchitecturalProductDetail.jsx` :
  - meme logique de prix fiable ;
  - le schema `Product` de fiche detail est emis seulement quand un prix reel existe ;
  - le `BreadcrumbList` reste emis meme si le produit est en prix sur demande.
- `verify-seo-roadmap.mjs` :
  - le gate marketplace verifie maintenant aussi `Offer`, `priceCurrency`, `availability` et `UsedCondition`.
- `legacyFurnitureCategories.js` :
  - ajout du mapping local `aeqBE7DDp0V7Liro0LKa: autre` pour `Malle ancienne 1920` ;
  - correction necessaire car le preflight prod a detecte 29 meubles prod pour 28 mappings ;
  - aucune ecriture Firestore prod : le document prod avait deja `category: autre`.

Mapping prix / statut vers `offers` :

- Prix :
  - source : `currentPrice ?? startingPrice ?? price` ;
  - conversion via `Number(...)` ;
  - accepte uniquement un nombre fini strictement superieur a `0` ;
  - refuse si `priceOnRequest === true`.
- Disponibilite :
  - `InStock` si `sold` est faux et `stock ?? 1` est strictement superieur a `0` ;
  - `OutOfStock` si `sold` est vrai ou si le stock vaut `0` ou moins.
- Etat :
  - `itemCondition: https://schema.org/UsedCondition`, coherent avec meubles anciens / pieces en bois massif.
- Devise :
  - `priceCurrency: EUR`.

Impact SEO :

- Les produits avec prix/statut exploitables ont maintenant un `Offer` conforme dans les listes marketplace/categorie.
- L erreur Google `Il faut indiquer "offers", "review", ou "aggregateRating"` doit disparaitre pour ces produits apres deploy et nouvelle validation.
- Les produits sans prix fiable ne generent pas de faux signal produit eligible, ce qui evite les donnees structurees trompeuses.

Risque UI :

- Nul attendu : JSON-LD invisible uniquement.
- Aucune modification de grille meubles/planches.
- Aucun changement de filtres, layout, CTA ou navigation visible.

Securite / donnees :

- Deploy limite a Hosting uniquement, avec accord utilisateur.
- Aucune ecriture Firestore prod.
- Aucun secret lu ou consigne.
- Aucun faux avis ou note artificielle ajoute.

Tests effectues :

- Premier `npm run preflight:prod` bloque comme prevu :
  - `prodFurnitureCount = 29` ;
  - `mappingCount = 28` ;
  - missing `aeqBE7DDp0V7Liro0LKa`.
- Lecture prod read-only du document manquant :
  - `name = Malle ancienne 1920` ;
  - `category = autre` ;
  - `currentPrice = 120` ;
  - `stock = 1` ;
  - `sold = false`.
- Mapping local ajoute puis `npm run preflight:prod` OK :
  - `prodFurnitureCount = 29` ;
  - `mappingCount = 29` ;
  - no missing ;
  - no extra ;
  - no invalid categories.
- `npm run build` OK.
- `npm run verify:seo-roadmap` OK : 16 checks passes.
- `git diff --check` OK hors warnings CRLF Windows.
- `firebase deploy --only hosting --project tousatable-client` OK.
- `firebase use default` OK apres deploy :
  - alias final `tatmadeinnormandie`.
- `npm run audit:public-seo` OK :
  - 32 checks passes ;
  - sitemap public `loc_count = 70` ;
  - `product_path_url_count = 58` ;
  - routes propres OK.
- Smoke HTTP prod OK :
  - `/meubles-anciens` HTTP 200 ;
  - `/meubles-anciens/buffets` HTTP 200 ;
  - `/produit/malle-ancienne-1920-aeqBE7DDp0V7Liro0LKa` HTTP 200.
- Bundle public prod verifie :
  - `GalleryView-DtxPMqUO.js` contient `Offer`, `priceCurrency`, `availability`, `UsedCondition` ;
  - `ProductDetail-CCqEYfa1.js` contient `Offer`, `priceCurrency`, `UsedCondition`, `priceOnRequest`.

Reste a faire :

- Suivre la prise en compte par l index Google dans les prochains jours.
- Si Google remonte ensuite une erreur `price` sur certains produits, verifier si ces produits sont en `priceOnRequest` ou avec prix manquant dans les donnees admin avant toute modification.

Validation Google Search Console :

- Tests live effectues apres deploy prod Hosting.
- `/meubles-anciens` :
  - Google a acces a l URL ;
  - page peut etre indexee ;
  - `Extraits de produits` : 24 elements valides ;
  - `Fiches de marchand` : 24 elements valides ;
  - `Fil d Ariane` : 1 element valide ;
  - indexation demandee.
- `/meubles-anciens/buffets` :
  - Google a acces a l URL ;
  - page peut etre indexee ;
  - `Extraits de produits` : 7 elements valides ;
  - `Fiches de marchand` : 7 elements valides ;
  - `Fil d Ariane` : 1 element valide.
- `/produit/malle-ancienne-1920-aeqBE7DDp0V7Liro0LKa` :
  - Google a acces a l URL ;
  - page peut etre indexee ;
  - `Extraits de produits` : 1 element valide ;
  - `Fiches de marchand` : 1 element valide ;
  - `Fil d Ariane` : 1 element valide.

Conclusion Search Console :

- L ancienne erreur obligatoire `Il faut indiquer offers, review ou aggregateRating` n apparait plus dans les tests live.
- `offers` est reconnu par Google sur :
  - galerie ;
  - categorie ;
  - fiche produit.
- `review` et `aggregateRating` restent absents volontairement :
  - ils sont facultatifs/non bloquants ;
  - le site n a pas de systeme d avis client ;
  - aucun faux avis ou fausse note ne doit etre ajoute.
- Le rapport general `Achats > Extraits de produits` affiche encore `Nous n avons trouve aucune donnee`, donc aucun bouton `Valider la correction` n est disponible a ce stade.
- Sitemap GSC :
  - `/sitemap.xml` soumis ;
  - etat `Operation effectuee` ;
  - derniere lecture : 7 mai 2026 ;
  - pages decouvertes affichees : 69 ;
  - sitemap renvoye manuellement via `sitemap.xml`.
- Note : l audit public local voit 70 URLs apres ajout de `Malle ancienne 1920`; l ecart avec les 69 URLs GSC peut venir du delai de relecture Google.

---

## Chapitre 29 - Correction canonicals concurrents et doublons Search Console

Date : 18 mai 2026
Statut : implemente localement, aucun deploy

Contexte Search Console :

- Captures utilisateur du 18 mai 2026 :
  - pages indexees : 3 ;
  - exemples indexees : `/comptoir`, `/a-propos`, `/` ;
  - pages non indexees : 77 ;
  - motifs visibles :
    - `Page en double sans URL canonique selectionnee par l'utilisateur` : 3 ;
    - `Detectee, actuellement non indexee` : 61 ;
    - `Autre page avec balise canonique correcte` : 13.
- Audit public lance localement :
  - `npm run audit:public-seo` OK ;
  - sitemap public HTTP 200 ;
  - `loc_count = 91` ;
  - `query_url_count = 0` ;
  - `product_path_url_count = 79` ;
  - routes SEO propres en HTTP 200 ;
  - `shareMeta` retourne les canonicals attendus.

Diagnostic :

- Le sitemap public est sain et contient les routes propres.
- Les 61 pages `Detectee, actuellement non indexee` correspondent surtout a des URLs connues de Google mais non encore explorees/indexees ; ce motif n'indique pas a lui seul une erreur bloquante de code.
- Un risque reel a ete trouve dans le code :
  - `src/App.jsx` rendait un `<SEO />` global par defaut ;
  - les pages publiques rendaient ensuite leur propre `<SEO url="...">` ;
  - `react-helmet-async` peut conserver plusieurs `<link rel="canonical">` si les `href` sont differents ;
  - cela pouvait exposer une canonical racine et une canonical page en meme temps, signal coherent avec les doublons Search Console.
- Des variantes d URL propres mais doublons restaient aussi possibles :
  - `/index.html` ;
  - `/atelier` ;
  - trailing slash sur les routes SEO publiques.

Fichiers touches :

- `src/App.jsx`
- `firebase.json`
- `scripts/verify-seo-roadmap.mjs`
- `SEOlivre.md`

Changements :

- Suppression du `<SEO />` global dans `src/App.jsx`.
  - Les pages publiques gardent leur `<SEO>` specifique : galerie, categories, planches, Comptoir, A propos, livraison, fiches produit.
  - Objectif : une seule canonical claire par page rendue.
- Ajout de redirections Hosting 301 explicites :
  - `/index.html` vers `/` ;
  - `/atelier` vers `/a-propos` ;
  - trailing slash des routes SEO vers leur version sans slash.
- Renforcement du gate `verify:seo-roadmap` :
  - verifie que `App.jsx` ne remet pas un `<SEO />` global concurrent ;
  - verifie la presence des redirections canonicales principales dans `firebase.json`.

Impact SEO attendu :

- Reduction du risque `Page en double sans URL canonique selectionnee par l'utilisateur`.
- Nettoyage des variantes canonicals autour des routes publiques.
- Pas d impact direct sur les 61 pages `Detectee, actuellement non indexee` : pour celles-ci, la suite est surtout Search Console, demandes d indexation et delai Google.

Risque UI :

- Nul attendu :
  - changement invisible dans le head HTML rendu ;
  - redirections uniquement sur variantes d URL ;
  - aucune modification de grille, filtres, cartes, donnees ou Firestore.

Tests :

- `npm run audit:public-seo` avant correction locale : OK, 32 checks passes, prod actuelle saine.
- `npm run verify:seo-roadmap` apres correction : OK, 18 checks passes.
- Validation JSON `firebase.json` : OK.
- `npm run build` :
  - premier essai bloque par sandbox Windows `spawn EPERM` sur esbuild ;
  - relance hors sandbox approuvee : OK ;
  - warnings Vite existants : gros chunks et ancienne classe arbitraire Tailwind fantôme issue du scan documentaire.

Reste a faire :

- Ne pas deployer sans accord explicite.
- Apres deploy Hosting, relancer :
  - `npm run audit:public-seo` ;
  - inspections Search Console sur `/meubles-anciens`, categories, `/planches-a-decouper-anciennes`, `/livraison-meubles-anciens-france` et quelques fiches produit.
- Dans Search Console :
  - cliquer `Valider la correction` pour les motifs de doublon apres deploy ;
  - demander l indexation des pages fortes non encore explorees ;
  - attendre plusieurs jours/semaines pour les fiches produit, surtout celles avec contenu proche ou faible demande.

---

## Chapitre 30 - Passe SEO globale base stable Google

Date : 18 mai 2026
Statut : implemente localement, aucun deploy

Objectif :

- Refaire une passe large sur toutes les familles de pages publiques et privees apres les alertes Search Console.
- Aligner les signaux techniques sur les recommandations Google Search Central :
  - canonicalisation : https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
  - sitemaps : https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
  - robots meta : https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag
  - JavaScript SEO : https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
  - donnees structurees Product : https://developers.google.com/search/docs/appearance/structured-data/product
  - donnees structurees BreadcrumbList : https://developers.google.com/search/docs/appearance/structured-data/breadcrumb

Constats Google utilises :

- Google recommande d empiler des signaux coherents pour les canonicals : redirections, `rel="canonical"` et inclusion sitemap.
- Google deconseille d envoyer des canonicals contradictoires entre sitemap et balise canonical.
- Pour les SPA, Google doit pouvoir decouvrir des URLs propres via des liens `href` et l History API, pas via des fragments `#`.
- Le sitemap aide Google a decouvrir les URLs importantes mais ne garantit pas leur indexation.
- Les pages privees ou transactionnelles doivent exposer un `robots` clair si elles ne doivent pas entrer dans l index.
- Les donnees structurees produit et fil d Ariane doivent rester coherentes avec le contenu visible.

Audit effectue :

- Routes publiques SEO :
  - `/`
  - `/meubles-anciens`
  - categories mobilier
  - `/planches-a-decouper-anciennes`
  - `/comptoir`
  - `/a-propos`
  - `/livraison-meubles-anciens-france`
  - fiches produits `/produit/...`
- Routes privees/transactionnelles :
  - `/checkout`
  - `/mes-commandes`
  - `/admin`
- Routes Comptoir detail :
  - pages utiles pour l utilisateur, mais trop fines/affiliees pour etre poussees comme pages indexables autonomes.

Changements :

- `src/components/shared/SEO.jsx`
  - Ajout d une prop `robots`.
  - Valeur publique par defaut : `index,follow,max-image-preview:large`.
  - Chaque page peut maintenant declarer proprement son intention d indexation.
- `src/pages/CheckoutView.jsx`
  - Ajout `SEO` en `noindex,nofollow,noarchive`.
  - Couvre le rendu normal et le rendu "stock indisponible".
- `src/pages/MyOrdersView.jsx`
  - Ajout `SEO` en `noindex,nofollow,noarchive`.
  - Couvre le rendu chargement et le rendu principal.
- `src/pages/LoginView.jsx` et `src/Router.jsx`
  - Ajout `SEO` admin en `noindex,nofollow,noarchive`.
- `src/pages/ShopProductDetail.jsx`
  - Les fiches detail Comptoir restent visibles pour l experience utilisateur mais passent en `noindex,follow,max-image-preview:large`.
  - Le cas produit introuvable reste en `noindex,follow,noarchive`.
- `src/designs/architectural/ArchitecturalProductDetail.jsx`
  - Le cas fiche produit introuvable expose un `noindex,follow,noarchive` au lieu d une page sans consigne robots.
- `src/App.jsx`
  - Les deep links produit initialisent maintenant `selectedItemId` depuis la route.
  - Objectif : eviter qu une URL produit chargee directement affiche un etat vide avant que la page detail puisse emettre ses metas.
- `src/Router.jsx`, `src/designs/architectural/ArchitecturalProductDetail.jsx`
  - Ajout d un etat `isCatalogResolving` pour les deep links produit.
  - Tant que le catalogue charge, la fiche transitoire ne renvoie pas `noindex`.
  - `noindex,follow,noarchive` est reserve au vrai cas produit introuvable apres resolution du catalogue.
- `src/App.jsx`
  - Resolution explicite des deux collections catalogue (`furniture` et `cutting_boards`) pour les deep links produit.
  - Si un produit n est pas encore trouve, le fallback charge meubles + planches avant de conclure qu il est introuvable.
  - Objectif : eviter de marquer par erreur une planche ancienne en `noindex` si seul le mobilier a deja repondu.
- `src/data/categorySeoContent.js`, `src/designs/architectural/MarketplaceLayout.jsx`, `src/pages/GalleryView.jsx`
  - Ajout d un bloc editorial distinct pour `/meubles-anciens`.
  - La racine `/` et la collection `/meubles-anciens` ne s appuient plus exactement sur le meme bloc SEO visible.
  - Separation des metas entre `/` et `/meubles-anciens` :
    - `/` : marque/atelier et promesse generale ;
    - `/meubles-anciens` : collection de meubles anciens a vendre.
- `scripts/verify-seo-roadmap.mjs`
  - Gate renforce pour couvrir :
    - balise robots dans le composant SEO ;
    - pages privees en noindex ;
    - fiches detail Comptoir en noindex ;
    - intro visible dediee a `/meubles-anciens` ;
    - metas distinctes entre `/` et `/meubles-anciens` ;
    - absence de `noindex` pendant le chargement d un deep link produit ;
    - nettoyage `dist/` avant les builds pour eviter de deployer des chunks perimes.
- `scripts/clean-dist.mjs`, `package.json`
  - Ajout d un nettoyage borne au dossier `dist` du workspace avant `npm run build` et `npm run build:prod`.
  - Contexte : le preflight a detecte d anciens chunks encore presents dans `dist/assets`, contenant une ancienne config sandbox/test.
  - Objectif : empecher Firebase Hosting de deployer des assets obsoletes si le dossier de build n est pas propre.

Positionnement par type de page :

- Indexables fortes :
  - `/`
  - `/meubles-anciens`
  - categories mobilier
  - `/planches-a-decouper-anciennes`
  - `/comptoir`
  - `/a-propos`
  - `/livraison-meubles-anciens-france`
  - fiches meubles/planches vendues par Tous a Table si elles ont contenu, image, offre et canonical coherents.
- Non indexables volontaires :
  - checkout ;
  - commandes client ;
  - admin/login ;
  - fiches Comptoir affiliees detaillees ;
  - etats produit introuvable.

Tests :

- `npm run verify:seo-roadmap` : OK, 21 checks.
- `node --check functions/src/seo/seoTools.js` : OK.
- Validation JSON `firebase.json` : OK.
- `npm run build` :
  - OK apres relance hors sandbox Windows approuvee ;
  - warnings connus Vite/Tailwind uniquement.
- `git diff --check` :
  - OK ;
  - warnings CRLF Windows uniquement.

Reste a faire apres accord deploy :

- Deployer Hosting uniquement apres validation explicite.
- Relancer `npm run audit:public-seo` contre la prod deployee.
- Dans Search Console :
  - inspecter en live `/meubles-anciens`, 2 categories, `/planches-a-decouper-anciennes`, `/livraison-meubles-anciens-france` et 3 fiches produit ;
  - demander l indexation des pages fortes ;
  - lancer `Valider la correction` sur les motifs de doublon apres que la prod serve les nouveaux head/redirections.
- Surveiller pendant plusieurs jours :
  - baisse des doublons canonical ;
  - progression des pages explorees ;
  - maintien des 3 pages deja indexees.

---

## Chapitre 28 - Landing SEO racine Ifs Caen Calvados

Date : 22 mai 2026
Statut : fait localement, aucun deploy

Objectif :

- Transformer `/` en page d arrivee SEO locale et premium autour du showroom a Ifs, Caen, Calvados et Normandie.
- Garder la galerie marketplace definitive sur `/meubles-anciens` et les categories mobilier existantes.
- Mettre en avant la galerie, 4 meubles, Le Comptoir, une carte locale et une FAQ sans casser la grille principale.

Fichiers touches :

- `src/pages/RootLandingView.jsx`
- `src/Router.jsx`
- `src/App.jsx`
- `src/utils/seoRoutes.js`
- `src/utils/startupWarmup.js`
- `src/pages/GalleryView.jsx`
- `src/components/layout/GlobalMenu.jsx`
- `src/components/layout/Footer.jsx`
- `src/features/admin/AdminAnalytics.jsx`
- `src/index.css`
- `functions/src/seo/seoTools.js`
- `index.html`
- `scripts/verify-seo-roadmap.mjs`
- `SEOlivre.md`

Changements :

- `/` rend maintenant `RootLandingView` avec :
  - hero "Meubles anciens a Caen, restaures en Normandie" ;
  - CTA principal vers `/meubles-anciens` ;
  - bloc showroom local a Ifs ;
  - carte Calvados avec villes locales ;
  - meubles en vedette issus du catalogue public ;
  - mise en avant Comptoir ;
  - FAQ visible et schema `FAQPage`.
- `/a-propos` conserve l ancienne page atelier `HomeView`.
- `/meubles-anciens` reste l entree galerie mobilier.
- Les categories `/meubles-anciens/...` restent routees vers la galerie avec leurs filtres existants.
- Les CTA "Galerie" et "Marketplace" ne pointent plus vers `/`, mais vers `/meubles-anciens`.
- `GalleryView` ne produit plus de canonical temporaire `/` quand la galerie est montee pendant une transition.
- `publicCatalog` est utilise pour nourrir la landing ; aucun nouveau listener public large n est ajoute comme source normale.
- Le preloader reste actif sur `/` et le warmup cible maintenant les images de la landing, les premiers meubles et Le Comptoir.
- `AdminAnalytics` distingue `home: Accueil SEO` de `about: A propos` et `gallery: Galerie mobilier`.
- `shareMeta` et le head statique `index.html` sont alignes sur la nouvelle intention de `/`.
- Le gate `verify:seo-roadmap` verifie maintenant la landing racine et ses schemas.

Impact SEO :

- `/` devient une vraie page locale Ifs / Caen / Calvados, avec contenu visible, schema local, FAQ et maillage interne vers galerie, Comptoir, atelier et livraison.
- `/meubles-anciens` reste la page collection mobilier a vendre, sans conflit de canonical avec `/`.
- Le sitemap continue d inclure `/` et `/meubles-anciens` comme URLs propres distinctes.

Risque UI :

- Moyen sur le root uniquement.
- Mesures prises :
  - grille marketplace non modifiee ;
  - routing galerie/categories conserve ;
  - captures desktop et mobile sur `/` ;
  - capture desktop et mobile sur `/meubles-anciens` ;
  - correctif mobile pour eviter le debordement de la nav et du hero.

Tests :

- `npm run verify:seo-roadmap` : OK, 25 checks.
- `npm run verify:analytics-reliability` : OK.
- `npm run verify:functions-syntax` : OK.
- `npm run build` : OK apres relance hors sandbox Windows approuvee.
- `git diff --check` : OK ; avertissements CRLF Windows uniquement.
- Preview locale `http://127.0.0.1:4173/` : HTTP 200.
- Preview locale `http://127.0.0.1:4173/meubles-anciens` : HTTP 200.
- Captures Edge headless :
  - `/` avec preloader ;
  - `/` desktop sans preloader ;
  - `/` mobile sans preloader ;
  - `/meubles-anciens` desktop et mobile sans preloader.

Reste a faire :

- Smoke manuel dans un navigateur interactif avant deploy.
- Ne pas deployer sans accord explicite.
- Apres deploy approuve : lancer `npm run audit:public-seo`, verifier `/sitemap.xml`, `shareMeta?path=/`, Search Console et Rich Results Test sur `/`, `/meubles-anciens` et 2 categories.

### Polissage landing racine - 22 mai 2026

Objectif :

- Ameliorer la landing `/` apres revue visuelle : image hero plus nette, header complet, carte Calvados plus credible, sections plus vivantes et meilleure densite mobile.

Changements :

- Hero : remplacement de l image unique par un carousel de 2 visuels existants, mobilier et planches, avec sources desktop/mobile dediees.
- Hero : suppression du zoom au scroll sur le container image, reduction de la hauteur desktop et transition carousel adoucie par crossfade.
- Header : ajout de l entree `Livraison` dans la navigation flottante de la landing.
- Showroom : carte Calvados remplacee par une image generee via `imagegen`, compressee en WebP et enrichie de labels HTML exacts.
- Bento local : ajout de cartes symetriques pour tables de ferme, buffets, armoires/commodes, planches/entretien et livraison.
- Bento local : animation ajustee pour que les cartes atteignent leur position finale avant que la section soit pleinement sous les yeux.
- Galerie : grille mobile en 2x2 sur la section meubles en vedette, avec cartes plus compactes.
- Comptoir : cartes produits densifiees, sans grands vides bas, avec CTA interne.
- Motion : animations GSAP et CSS etendues aux cartes locales, produits et CTA final, uniquement via transform/opacity.

Tests :

- `npm run verify:seo-roadmap` : OK.
- `npm run verify:analytics-reliability` : OK.
- `npm run verify:functions-syntax` : OK.
- `npm run build` : OK apres relance hors sandbox Windows approuvee.
- `git diff --check` : OK ; avertissements CRLF Windows uniquement.
- Captures Edge headless sur `/` desktop/mobile et `/meubles-anciens` mobile.

### Micro-ajustements metas/schema landing racine - 25 mai 2026

Objectif :

- Rendre le title SEO de `/` plus court dans les SERP et harmoniser le schema LocalBusiness statique avec le schema React.

Changements :

- `src/components/shared/SEO.jsx` : ajout d une option `appendSiteTitle` pour permettre un title exact sur les pages qui le demandent, sans changer le comportement par defaut des autres pages.
- `src/pages/RootLandingView.jsx` : title de `/` passe a `Meubles anciens à Caen | Showroom à Ifs` sans suffixe automatique.
- `index.html` : title statique et `og:title` alignes en ASCII sur `Meubles anciens a Caen | Showroom a Ifs`.
- `index.html` : `priceRange` du schema statique passe a `EUR 100 - EUR 3000`, comme le schema React.
- `functions/src/seo/seoTools.js` : meta de partage racine alignee sur le nouveau title court.
- `scripts/verify-seo-roadmap.mjs` : attente du title racine mise a jour pour garder le gate SEO coherent.

Impact SEO :

- Signal title plus concis pour la page locale Ifs / Caen.
- Moins d incoherence entre les schemas LocalBusiness statique et React.

Risque UI :

- Nul : aucune structure visuelle modifiee.

Tests :

- `npm run verify:seo-roadmap` : OK, 25 checks.
- `npm run build` : OK avec warnings non bloquants existants CSS/chunks Vite.

### Alignement HomeSEO premier rendu - 26 mai 2026

Objectif :

- Eviter que Google Search Console capture l ancien H1 HomeSEO par defaut avant le chargement Firestore des reglages admin.

Changements :

- `src/utils/homeSEOSettings.js` : fallback `heroTitle` aligne sur `Meubles anciens restaures en Normandie.`.
- `src/pages/RootLandingView.jsx` : le title SEO React, la meta description et le schema `WebPage` utilisent maintenant `homeSEO.heroTitle` et `homeSEO.heroDescription`.

Impact SEO :

- Le premier rendu d un visiteur sans cache local, dont Googlebot, est plus proche de la version admin attendue.
- Les metas React et le schema suivent mieux la landing pilotee par HomeSEO.

Risque UI :

- Faible : changement limite au H1 de fallback, aux metas React et au schema.
- Aucun changement galerie, filtres meubles/planches ou Firestore prod.

Tests :

- `npm run verify:seo-roadmap` : OK, 25 checks.
- `npm run build` : OK apres relance hors sandbox Windows approuvee ; warnings non bloquants existants CSS/chunks Vite.

### Deploy prod SEO title/description - 27 mai 2026

Objectif :

- Publier en production le title Google racine, la description accentuee, `shareMeta` et `sitemap`.

Changements deployes :

- Hosting Firebase prod : `dist/index.html` publie avec `Meubles anciens Made in Normandie | Showroom à Ifs`.
- Function `shareMeta` : titles/descriptions SEO publics deployes.
- Function `sitemap` : sitemap public redeploye.

Verification publique apres deploy :

- HTML public `/` : title OK, `Meubles anciens Made in Normandie | Showroom à Ifs`.
- HTML public `/` : meta description OK, `Showroom local à Ifs près de Caen : meubles anciens restaurés, tables de ferme, buffets, armoires, commodes, planches à découper et produits d'entretien bois. Livraison Normandie et France.`
- `npm run audit:public-seo` : OK, 32 checks.
- `npm run audit:functions-env -- --project=tousatable-client` : OK, audit compte uniquement, aucun secret affiche.

Preflight :

- `npm run preflight:prod` : OK avant deploy.

Note Search Console :

- Google peut garder l'ancien resultat visible tant que la page n'a pas ete recrawlee et retraitee. Utiliser Inspection de l'URL > Tester l'URL en ligne > Demander une indexation sur `https://tousatable-madeinnormandie.fr/`.

### Correction accents descriptions SEO - 27 mai 2026

Objectif :

- Corriger les accents dans les textes SEO publics et remplacer `planches anciennes` par `planches à découper` dans la description racine.

Changements :

- `index.html` : meta description, descriptions Open Graph/Twitter, keywords et schema statique corriges avec accents.
- `functions/src/seo/seoTools.js` : titles/descriptions `shareMeta` corriges avec accents sur les routes publiques.
- `src/utils/homeSEOSettings.js` : fallbacks HomeSEO visibles corriges avec accents.
- `scripts/verify-seo-roadmap.mjs` : attente du fallback HomeSEO mise a jour.

Impact SEO :

- Le snippet cible de `/` devient : `Showroom local à Ifs près de Caen : meubles anciens restaurés, tables de ferme, buffets, armoires, commodes, planches à découper et produits d'entretien bois.`
- Les apercus sociaux et les metas statiques ne diffusent plus les versions sans accents.

Risque UI :

- Faible : changements textuels uniquement.

Tests :

- `npm run verify:seo-roadmap` : OK, 25 checks.
- `npm run verify:functions-syntax` : OK.
- `node --check functions/src/seo/seoTools.js` : OK.
- `npm run build` : OK apres relance hors sandbox Windows approuvee ; warnings non bloquants existants CSS/chunks Vite.

### Alignement title Google racine - 27 mai 2026

Objectif :

- Aligner le title statique que Google lit en premier sur le libelle souhaite pour le resultat de recherche.

Changements :

- `index.html` : title et `og:title` de `/` passent a `Meubles anciens Made in Normandie | Showroom à Ifs`.
- `functions/src/seo/seoTools.js` : title `shareMeta` de `/` aligne sur le meme libelle.
- `scripts/verify-seo-roadmap.mjs` : le gate SEO verifie maintenant ce title statique.

Impact SEO :

- Le signal title principal de la home n est plus `Meubles anciens a Caen | Showroom a Ifs`.
- Google devra recrawler puis retraiter la page apres deploy pour que le resultat visible change.

Risque UI :

- Nul : aucune structure visuelle modifiee.

Tests :

- `npm run verify:seo-roadmap` : OK, 25 checks.
- `npm run build` : OK apres relance hors sandbox Windows approuvee ; warnings non bloquants existants CSS/chunks Vite.
