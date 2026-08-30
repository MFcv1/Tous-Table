# Architecture Firestore Rules : L'introduction de la variable `{appId}`

Ce document technique documente le changement structurel apporté aux règles de sécurité Firestore (`firestore.rules`) lors de la migration des produits, en passant d'un repère figé à une structure dynamique multi-environnementale.

---

## 1. La situation "AVANT" (Nom de projet figé)

Avant cette modification, le chemin d’accès aux données était explicitement figé avec le nom du dossier de base de données de production :

```firestore
// AVANT : Le nom est écrit "en dur"
match /artifacts/tat-made-in-normandie/public/data/affiliate_products/{productId} { ... }
```

### La Contrainte Majeure ❌
Toute requête Firestore qui ne visait pas exactement le "tiroir" `tat-made-in-normandie` était systématiquement rejetée.

**Impact sur vos deux environnements actuels :**
- **Production (`https://tousatable-madeinnormandie.fr/`)** : Aucun problème. Le front-end pointe bien vers ce dossier qui est encodé dans ses constantes. La requête passe.
- **Sandbox (`https://tatmadeinnormandie.web.app/`)** : Si, pour éviter de polluer les données de production, votre application Sandbox pointe sur un bucket ou un dossier de données différent (comme `tat-sandbox`), le fichier Firestore bloque l'accès (`403 Permission Denied`). 

Pour corriger cela, il aurait fallu maintenir un fichier `firestore-prod.rules` et un fichier `firestore-sandbox.rules`. Ce processus manuel est une porte ouverte aux bugs (défaut de déploiement) et aux vulnérabilités (oublier de patcher les deux fichiers en même temps).

---

## 2. La situation "APRÈS" (Approche Dynamique)

La modification intègre la variable de chemin `{appId}` (symbolisée par les accolades) :

```firestore
// APRÈS : Le chemin s'adapte automatiquement à l'appelant
match /artifacts/{appId}/public/data/affiliate_products/{productId} { ... }
```

### Le Principe ✅
La règle indique dorénavant à Firestore : *"Applique toutes ces règles de haute sécurité (vérification de rôle Artisan, typage des données, etc.) sur la collection `affiliate_products`, **peu importe le nom du projet/dossier parent** (qui sera stocké temporairement dans la variable `{appId}`)."*

---

## 3. Ce que cette "Feature" apporte concrètement

### A. Fichier Universel (Write Once, Deploy Anywhere)
C'est le plus gros avantage. Vous possédez désormais **un seul et unique fichier** `firestore.rules`.
Lors de vos déploiements (`firebase deploy`), vous envoyez ce même fichier sur la Production ET sur la Sandbox. Il protège les deux intelligemment, s'adaptant à celui qui l'interroge.

### B. Isolation propre des environnements de Test
La Sandbox (`https://tatmadeinnormandie.web.app/`) peut maintenant posséder ses bases de données complètement isolées de la Prod (`https://tousatable-madeinnormandie.fr/`). Les développements et tests massifs peuvent être menés sur la Sandbox sans aucune crainte de casser ou de polluer la Boutique officielle, tout en bénéficiant de 100% de la même couverture de sécurité fonctionnelle.

### C. Scalabilité et "Future-Proof"
Si "Tous à Table" ouvre demain un site annexe en marque blanche ou une application mobile dédiée, vous n'aurez pas besoin de reprogrammer les autorisations de lecture/écriture de la Boutique. L'architecture est capable de grandir sans effort cognitif de maintenance.

---

**Bilan Technique :** Cette modification "fortuite" (introduite initialement lors du débogage d'App Check) s'avère être la validation pure et dure des normes d'architecture logicielle modernes ("DRY" - Don't Repeat Yourself). Elle est **indispensable** au bon fonctionnement du multi-projet.

## 4. Frontière des opérations destructrices (2026-08-29)

Les comptes avec custom claim `admin` gardent les lectures et mises à jour nécessaires à
l'exploitation. Les suppressions critiques ne passent plus par le SDK client :

- `orders/{orderId}` : lecture/mise à jour admin, création et suppression directes
  interdites ; les mises à jour client admin sont limitées au statut opérationnel et
  aux rappels d'expédition ; l'annulation destructive passe par une callable développeur ;
- `affiliate_clicks/{clickId}` : création authentifiée et lecture admin conservées,
  suppression directe interdite ;
- `sys_metadata/admin_users` : lecture admin seulement et écriture réservée à l'e-mail
  développeur exact ; les autres métadonnées gardent leurs créations/mises à jour admin,
  mais leur suppression est réservée au développeur.

Cette règle est commune aux deux environnements. Elle est locale et doit être déployée
avec les Functions correspondantes pour éviter une période où l'interface et la
frontière serveur seraient désalignées.
