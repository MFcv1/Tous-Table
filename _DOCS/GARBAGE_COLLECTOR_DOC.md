# 🧹 Documentation Technique : Le "Garbage Collector" (Maintenance Système)

**Fonction Cloud :** `runGarbageCollector`  
**Localisation :** `functions/index.js`  
**Rôle :** Nettoyer les données corrompues, orphelines ou inutiles pour optimiser les performances et réduire les coûts de stockage avant la mise en production.

---

## 🏗️ Architecture et Fonctionnement

Le script est divise en deux phases distinctes exécutées séquentiellement pour garantir la cohérence des données.

### 1️⃣ Phase 1 : Chasse aux Fantômes (Firestore Database) 👻
Cette phase nettoie la **base de données textuelle**.

*   **Le Problème :** Lorsqu'un produit (meuble ou planche) est supprimé manuellement, ses sous-collections (`bids`, `likes`, `comments`, `shares`) peuvent parfois persister si la suppression n'a pas été récursive. Ces documents deviennent des "fantômes" : le parent n'existe plus, mais les enfants occupent de l'espace.
*   **L'Algorithme :**
    1.  Le script scanne **toutes** les références de documents dans les collections `furniture` et `cutting_boards`.
    2.  Pour chaque référence, il vérifie si le document parent existe réellement (`snap.exists`).
    3.  **Si le document n'existe pas (Fantôme) :**
        *   Il déclenche une suppression récursive de toutes les sous-collections connues (`bids`, `likes`, `comments`, `shares`, `logs`).
        *   Il supprime définitivement ces "restes".
    4.  **Si le document existe (Vivant) :**
        *   Il analyse le champ `images` du produit.
        *   Il extrait les chemins d'accès (paths) de toutes les images valides et les ajoute à une **Liste Blanche (Allowlist)** pour la phase 2.

### 2️⃣ Phase 2 : Nettoyage des Orphelins (Firebase Storage) 📸
Cette phase nettoie le **stockage de fichiers** (disque dur). C'est l'étape qui libère de l'espace disque réel.

*   **Le Problème :** Supprimer une fiche produit dans la base de données ne supprime pas toujours les fichiers images associés dans le Storage. Ces images "orphelines" s'accumulent, coûtent de l'argent et ne sont plus jamais affichées.
*   **L'Algorithme :**
    1.  Le script liste **tous** les fichiers présents dans les dossiers `furniture/` et `cutting_boards/` du Storage.
    2.  Pour chaque fichier trouvé, il compare son nom avec la **Liste Blanche** générée lors de la Phase 1.
    3.  **Si le fichier n'est PAS dans la Liste Blanche :**
        *   C'est une image orpheline (aucun produit actif ne l'utilise).
        *   **Action : Suppression immédiate et définitive.**
    4.  **Sécurité :**
        *   Il ne touche pas aux fichiers système (préfixe `sys_`).
        *   Il ne supprime que les formats image (`.jpg`, `.png`, `.webp`).

---

## 🚀 Utilisation

*   **Via l'Admin Dashboard :** Bouton "Maintenance Système" dans la "Zone de Danger".
*   **Permissions :** Réservé strictement au compte développeur `matthis.fradin2@gmail.com`. Un Custom Claim `admin` seul est refusé.
*   **Performance :**
    *   Timeout étendu à **540 secondes** (9 minutes) pour traiter de gros volumes.
    *   Mémoire allouée : **1GB** (nécessaire pour lister des milliers de fichiers).

## ⚠️ Précautions pour le Futur

Si vous demandez des optimisations ou des modifications sur ce script, gardez en tête :
1.  **L'ordre est crucial :** Il faut toujours scanner la Base de Données (Phase 1) **AVANT** le Stockage (Phase 2) pour construire la Liste Blanche des images légitimes. Inversez l'ordre, et vous risquez de supprimer des images utilisées.
2.  **Pagination :** Actuellement, le script liste tout. Si le site dépasse 10 000 produits ou images, il faudra implémenter une pagination (cursors) pour éviter le crash mémoire.
3.  **Backups :** Idéalement, faire un backup complet avant de lancer ce script sur une production massive.

---
*Dernière mise à jour : 29 Août 2026 — garde `checkIsSuperAdmin`, correctif local non déployé.*
