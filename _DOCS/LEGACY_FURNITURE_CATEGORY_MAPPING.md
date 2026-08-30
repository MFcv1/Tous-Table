# Mapping categories meubles prod legacy

## Pourquoi ce fichier existe

Le site utilise `src/data/legacyFurnitureCategories.js` pour classer certains meubles de production par ID stable.

Ce mapping est une securite de transition :

- il evite d'ecrire dans Firestore prod uniquement pour corriger une categorie ;
- il permet aux anciens meubles publies avant la normalisation du champ `category` de rester affiches dans les bons filtres ;
- il bloque un deploiement prod si un meuble prod n'est pas classe, via `npm run verify:prod-furniture` inclus dans `npm run preflight:prod`.

Le mapping est uniquement cote frontend. Il ne doit jamais etre reinjecte automatiquement dans Firestore.

## Comportement corrige le 2026-05-29

Le systeme garde le garde-fou prod, mais ne force plus l'ajout manuel des nouveaux meubles dans le mapping legacy.

`npm run verify:prod-furniture` accepte maintenant un meuble prod si :

- son champ Firestore `category` est valide ;
- ou son ID est present dans `src/data/legacyFurnitureCategories.js`.

Le preflight prod echoue encore avec une sortie du type :

```text
missing: [{ "id": "ID_DU_MEUBLE", "category": null }]
```

si un meuble n'a ni categorie Firestore valide ni fallback legacy.

Exemple rencontre le 2026-05-16 :

- `A89ATxl7ULCgYpRIHZcI` : Console en rotin, categorie `autre`
- `vnEaQJ75pTTYwglvCll0` : Table exterieur sur mesures, categorie `table`

Ces deux IDs ont ete ajoutes au mapping local pour debloquer le preflight, sans ecriture Firestore prod.

## Methode actuelle avant deploy prod

1. Lancer `npm run preflight:prod`.
2. Si `verify:prod-furniture` signale des meubles dans `missing`, ne pas deployer.
3. Lire les documents prod concernes en lecture seule.
4. Si le meuble est nouveau, corriger le champ `category` via l'admin ou une migration explicite validee par l'utilisateur.
5. Si le meuble est vraiment legacy et ne doit pas etre modifie en prod, ajouter son ID dans `src/data/legacyFurnitureCategories.js`.
6. Relancer `npm run preflight:prod`.
7. Deployer uniquement si le preflight est vert.

## TODO long terme

Objectif : supprimer la dependance au mapping manuel pour les nouveaux meubles, tout en gardant une compatibilite propre pour les anciens documents.

### 1. Auditer les donnees prod

- Verifier que chaque document `furniture` prod possede un champ `category` valide.
- Categories valides attendues : `buffet`, `table`, `chaise`, `armoire`, `commode`, `autre`.
- Identifier les anciens meubles sans `category` ou avec une valeur invalide.

### 2. Migrer proprement les categories manquantes

- Preparer un script de migration explicite, relu avant execution.
- Ne jamais lancer cette migration sans accord utilisateur.
- La migration doit uniquement ecrire le champ `category` manquant ou invalide sur les meubles prod concernes.
- Journaliser uniquement les IDs et les categories appliquees, jamais de secret.

### 3. Adapter le code frontend

- Garder `getFurnitureCategory(item)` comme point d'entree unique.
- Prioriser `item.category` quand il est valide.
- Utiliser `LEGACY_FURNITURE_CATEGORY_BY_ID` uniquement comme fallback pour les anciens documents.
- Ne pas supprimer le mapping tant qu'il reste au moins un meuble legacy non migre.

### 4. Adapter le gate `verify:prod-furniture` - fait le 2026-05-29

Le gate doit accepter un meuble prod si :

- son champ Firestore `category` est valide ;
- ou son ID est present dans `LEGACY_FURNITURE_CATEGORY_BY_ID`.

Le gate doit continuer a echouer si :

- un meuble n'a ni categorie Firestore valide ni fallback mapping ;
- une categorie est hors liste ;
- le mapping contient des IDs qui n'existent plus en prod, sauf decision explicite de garder une archive.

Verification initiale : `npm run verify:prod-furniture` OK le 2026-05-29.

Nettoyage du 2026-08-30 : quatre fallbacks (`O9nOJSI5v7CGVxsWMpWJ`,
`Sbi5LHe6v3SjtUbY2eqx`, `Zxiiz1aQgT7NG8IxGhxU`, `zHwnm17ybqkWCmr0Kz2a`)
ont été retirés après que le gate en lecture seule a confirmé que ces documents
n'existent plus dans le catalogue production actuel. Aucune écriture Firestore n'a été
effectuée ; les anciens dumps d'audit restent l'archive historique.

### 5. Nettoyer progressivement

- Apres migration complete, reduire le mapping aux seuls vrais cas historiques.
- Documenter la date de migration dans ce fichier.
- Mettre a jour `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md` et `_DOCS/PROD_READINESS_STATUS.md`.

## Decision actuelle

Court terme : conserver le mapping, car il protege les deploiements prod sans ecrire dans Firestore.

Long terme : migrer les categories dans Firestore prod et transformer le mapping en fallback legacy uniquement.
