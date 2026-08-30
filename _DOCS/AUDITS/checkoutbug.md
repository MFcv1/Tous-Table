# Rapport d'implémentation - Bug Checkout & UX

## 1. Amélioration de l'UX "Ajout au Panier" (Terminé & Validé)
- **Fichier modifié** : `src/App.jsx`
- **Changement** : Modification de la fonction `addToCart` pour retourner un booléen de succès.
- **Fonctionnalité "Pending Add"** : Si un utilisateur n'est pas connecté, l'article est mémorisé. Dès que l'utilisateur se connecte, l'article est automatiquement ajouté et le panier s'ouvre.
- **Résultat** : Suppression de l'affichage du panier vide avant la connexion.

## 2. Fix Autocomplétion Adresse Mobile (En cours de résolution)
Le problème persiste sur Android/iOS : la liste de suggestions ne s'affiche pas ou est masquée.

### Tentative 1 : Optimisation des attributs natifs
- **Fichier** : `src/pages/CheckoutView.jsx`
- **Actions** :
    - Ajout de `inputMode="numeric"` sur le Code Postal.
    - Activation de `autoComplete="postal-code"` et `address-level2`.
    - Ajout de `e.target.select()` au focus pour faciliter la correction.

### Tentative 2 : Correction du contexte d'empilement (Stacking Context)
- **Actions** :
    - **Z-Index** : Passage de `z-50` à `z-[100]` pour la liste de suggestions.
    - **Structure DOM** : Déplacement du bloc de suggestions après la grille (Code Postal / Ville) pour garantir qu'il soit le dernier élément rendu (priorité visuelle).
    - **Events** : Ajout de `onInput` en plus de `onChange` pour capturer les frappes sur les claviers virtuels (Gboard/Samsung).
    - **Force UI** : Utilisation de `autoComplete="new-password"` pour tenter d'écraser l'UI native de Chrome qui peut masquer notre liste.

## 3. Analyse technique du blocage actuel
Sur certains navigateurs mobiles (Chrome Android notamment) :
1. **L'Overlay Natif** : Le navigateur affiche son propre gestionnaire d'adresses qui se superpose exactement là où notre liste devrait apparaître.
2. **Focus & Clavier** : L'ouverture du clavier décale le viewport et peut parfois "clipper" les éléments positionnés en `absolute` s'ils sortent du conteneur parent.
3. **API Gouv** : Vérifier si la requête `fetch` vers `api-adresse.data.gouv.fr` n'est pas bloquée par une politique de sécurité ou un mode "Économie de données" sur le téléphone.

## 4. Étapes suivantes suggérées
- Tester en désactivant temporairement `transform-gpu` sur les inputs parents.
- Utiliser un portail (React Portal) pour rendre la liste à la racine du body, évitant tout problème de `relative/absolute` dans les formulaires.
- Vérifier les logs console via un débogueur distant (Chrome Remote Debugging) pour voir si le `fetch` renvoie bien des résultats sur mobile.

## 5. Correctif 2026-08-29 — confirmation client, facture et fiabilité commande

Contexte : le formulaire entreprise présentait une confirmation visuelle, mais celle-ci pouvait être contournée par le bouton final. Les nom/prénom du contact n'étaient pas inclus dans la validation réelle et la case « adresse de facturation » n'avait aucun effet sur la commande ni sur le PDF.

Changements :

- validation centralisée particulier/entreprise avec erreurs par champ (e-mail, téléphone, code postal, SIRET 14 chiffres, TVA optionnelle) ;
- récapitulatif intégré à la page, sans popup, avec trois blocs explicites : entreprise, contact/livraison, facturation ;
- paiement verrouillé tant que le client n'a pas cliqué sur « Tout est correct » ; toute modification invalide la confirmation précédente ;
- vraie adresse de facturation distincte, stockée dans `shipping.billing` et utilisée par les deux générateurs PDF et les e-mails commande ;
- nom de livraison entreprise = contact, nom de facturation = raison sociale ;
- après confirmation du lien e-mail, bouton « J'ai confirmé » qui recharge l'utilisateur Firebase et force un nouveau token pour éviter le blocage par token obsolète ;
- validation minimale répétée dans `createOrder` côté serveur pour empêcher le contournement du front ;
- logs structurés `checkout_order_event` sans e-mail, adresse, téléphone ni autre PII, avec `attemptId`, empreinte courte du UID, méthode, résultat et motif ;
- transactions multi-articles du parcours virement corrigées : toutes les lectures Firestore sont faites avant les écritures et les quantités de planches sont correctement réservées ;
- restauration de stock à l'annulation regroupée par produit, y compris lorsque plusieurs lignes désignent le même article.
- le client Stripe historique n'est plus initialisé sur le parcours virement ; la branche carte dormante reste hors recette et son comportement n'a pas été remanié.

Vérifications locales :

```bash
node --check functions/src/commerce/createOrder.js
node --check functions/src/commerce/cancelOrder.js
node --check functions/src/email/orderEmails.js
node # test validation/payload entreprise + test génération PDF avec facturation distincte
npm run build
```

Recette navigateur locale effectuée en desktop et 390×844 : erreurs visibles, focus premier champ, récapitulatif entreprise, facturation distincte, confirmation et déverrouillage du paiement.

Recette E2E sandbox effectuée le 29/08/2026 : connexion OTP puis Google, panier d'un meuble, commande virement de 30 €, réservation du meuble, page Mes commandes avec informations de règlement, e-mail client et facture PDF téléchargée/inspectée. La commande reste volontairement en attente afin de ne pas déclencher l'annulation et le retour stock sans accord utilisateur.

Reste obligatoire avant prod : décider du sort de la commande test et, si demandé, vérifier en live l'annulation et le retour stock. Stripe est désactivé et explicitement hors du parcours de recette : le code historique et son UI dormante ne sont ni un prérequis ni un moyen de paiement client.

## 6. Correctif 2026-08-30 — quantités et isolation du panier

Les recettes multi-articles ont révélé trois défauts frontend : le total affiché ignorait
`quantity`, le panier authentifié était recopié dans la clé invitée globale, et cette clé
était supprimée avant la confirmation Firestore lors d'une migration.

Corrections locales :

- calcul unique `prix × quantité` pour le panier, le checkout et le badge ;
- contrôles `− / +` bornés par le stock catalogue et par la limite serveur de 100 unités ;
- identité d'une ligne fondée sur `(collectionName, originalId)` afin que deux collections
  ne se contaminent pas si leurs identifiants coïncident ;
- consolidation des anciens doublons Firestore en additionnant leurs quantités ;
- `tat_local_cart` réservé aux invités via une enveloppe versionnée `scope: guest` ; les
  anciens tableaux sans propriétaire sont volontairement ignorés car leur UID d'origine
  est impossible à prouver ;
- suppression totale du miroir local des paniers authentifiés : un panier A ne peut plus
  devenir la source de migration du compte B ;
- transfert invité revendiqué par le premier UID cible avant toute écriture, avec un
  identifiant stable persisté sur chaque ligne Firestore ; la fusion reste additive sans
  doubler les quantités si la réponse du commit est perdue ;
- toutes les mutations du stockage invité (sauvegarde, revendication, suppression) sont
  sérialisées par Web Locks entre onglets ; sans verrou inter-onglets disponible, la
  migration échoue fermée plutôt que de risquer de copier un panier vers deux UID ;
- plusieurs transferts interrompus peuvent coexister avec un nouveau panier invité : ils
  restent séparés, sont tous repris par leur UID et aucun marqueur encore utile n'est évincé ;
- suppression de la source locale uniquement après succès du batch, retry automatique
  avec backoff et reprise immédiate au retour du réseau ;
- état visuel associé à son UID : lors d'un passage A → B, les lignes de A deviennent
  invisibles dès le changement d'identité, avant même le premier snapshot de B.
- migration exécutée dans une transaction Firestore avec identifiants de ligne
  déterministes : deux onglets ne peuvent plus appliquer deux fois le même transfert ni
  écraser une modification concurrente ;
- création de commande différée idempotente : l'`attemptId` reste stable pendant les
  retries, détermine le document commande côté serveur et empêche un second décrément de
  stock si la première réponse s'est perdue ;
- le serveur retire atomiquement uniquement les quantités commandées, sur les lignes
  canoniques comme legacy ; un replay ou un ajout effectué dans un autre onglet n'est
  jamais effacé avec le reste du panier ;
- une réponse tardive liée au compte A ne vide plus l'état visuel du compte B ;
- la fiche produit, l'analytics et le contact WhatsApp résolvent strictement la collection
  active, sans fallback vers une autre collection partageant le même identifiant ;
- restauration d'une commande déjà libérée (`payment_failed`, `canceled` ou
  `stockReserved: false`) ignorée afin d'éviter une inflation du stock.

Gate ajouté :

```bash
npm run verify:cart-boundary
```

Il vérifie les totaux, le nombre d'unités, la séparation des collections, la conservation
des doublons, la revendication UID, la stabilité de l'identifiant de transfert, le rejet
du stockage legacy sans propriétaire, la fusion additive et l'ordre `commit → clear`.
Ce gate fait désormais partie de `npm run preflight:prod`.

État au moment de cette note : gates ciblés, build et preflight complet réussis ; frontend
et `createOrder` déployés uniquement sur `sandboxtat`, puis smoke HTTP validé en 200. La
recette navigateur reste à rejouer après restauration du plugin de contrôle Chrome.
Aucun déploiement production.
