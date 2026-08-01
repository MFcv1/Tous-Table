# Architecture Multi-Environnement : Prod vs Sandbox (Août 2026)

Ce document récapitule l'ensemble du travail d'architecture réalisé pour séparer totalement l'environnement de développement (Sandbox) de la Production (Prod), tout en permettant de cloner la base de données pour les tests.

**Ce document est à fournir à tout agent IA devant effectuer un audit ou travailler sur l'environnement local/Sandbox.**

---

## 1. Les Projets Firebase

- **PRODUCTION** : `tousatable-client` (Domaine : `tousatable-madeinnormandie.fr`)
- **SANDBOX** : `sandboxtat` (Domaine : `sandboxtat.web.app` ou `localhost`)

Ces deux projets sont 100% étanches. Les clés API sont différentes et l'App Check de Google bloque tout accès croisé depuis le front-end.

## 2. Séparation de la Base de Données (Firestore)

Pour que la Sandbox et la Prod puissent partager **exactement le même code source** sans risque de collision, une variable dynamique a été introduite dans les règles de sécurité (`firestore.rules`) et dans l'arborescence : la variable `{appId}`.

- En Prod, les données sont stockées dans : `artifacts/tat-made-in-normandie/...`
- En Sandbox, les données sont stockées dans : `artifacts/sandboxtat/...`

Le fichier `firestore.rules` utilise `match /artifacts/{appId}/...` pour protéger les deux environnements de manière identique avec le même code ("Write Once, Deploy Anywhere").

## 3. Configuration des Variables d'Environnement

Le projet réagit automatiquement selon qu'il est lancé en `dev` ou buildé pour la `prod`.

- **`.env.local` (Sandbox / Dev)** :
  - Contient les clés API de `sandboxtat`.
  - Définit `VITE_APP_ID="sandboxtat"`, demandant au code source de lire le nœud `artifacts/sandboxtat`.

- **`.env.production` (Prod)** :
  - Contient les clés API de `tousatable-client`.
  - Définit `VITE_APP_ID="tat-made-in-normandie"`, demandant au code source de lire le nœud `artifacts/tat-made-in-normandie`.

## 4. Script de Migration (Clone Prod -> Sandbox)

Un script exclusif côté serveur (`migration-script/migrate.js`) a été codé pour cloner la base de données Prod vers la Sandbox. Il utilise le **Firebase Admin SDK** avec les identifiants de service pour contourner la protection App Check.

**Fonctionnement du script :**
- Il copie les collections principales (`orders`, `users`, `affiliate_clicks`, etc.).
- Il copie la collection `artifacts/tat-made-in-normandie` et **la renomme à la volée** en `artifacts/sandboxtat`.
- Il explore récursivement tous les sous-dossiers virtuels (`public/data/furniture`, `public/data/cutting_boards`, etc.) pour s'assurer que l'intégralité du catalogue est clonée.
- **Optimisation** : Il exclut volontairement les collections analytiques volumineuses (`analytics_sessions` ~4000 docs, `client_errors`) pour garder la Sandbox rapide et légère.

*Commande pour l'exécuter : `node migrate.js` dans le dossier `migration-script`.*

## 5. Sécurité des Emails (Protection du Client)

Pour éviter que le client (`tousatablemadeinnormandie@gmail.com`) ne reçoive des dizaines d'emails de test (fausses commandes) générés par la Sandbox, la Cloud Function d'envoi de mail (`orderEmails.js`) a été sécurisée.

- Une fonction `isProductionProject()` vérifie le `process.env.GCLOUD_PROJECT`.
- Le mail du client n'est injecté dans les destinataires **que si** le projet est `tousatable-client`.
- Sur la Sandbox (`sandboxtat`), les secrets Cloud Functions (`GMAIL_EMAIL` et `GMAIL_PASSWORD`) ont été définis avec l'adresse du développeur (`matthis.fradin2@gmail.com`). Toutes les alertes de test tombent donc uniquement chez le dev.

## 6. Prochaines Étapes (Déploiement)

Le système de déploiement multi-cibles (`npm run dashboard` lié au script NextJS de déploiement) est la dernière brique.
Il doit être mis à jour pour détecter ces deux environnements distincts, afin de permettre au développeur de :
- Déployer d'un clic sur la Sandbox pour des tests en direct.
- Déployer d'un clic sur la Production une fois la version validée. 

L'architecture actuelle (`.firebaserc` gérant les alias `default` et `prod`) permet cette double connexion de déploiement.

---
**Statut actuel** : La Sandbox est pleinement opérationnelle, peuplée de toutes les données du catalogue et les requêtes locales via `npm run dev` pointent bien vers `sandboxtat`. Un audit ou des tests intensifs peuvent y être menés sans **aucun** impact sur la base de production ou sur la facturation.
