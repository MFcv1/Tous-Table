# ⚡ Commandes Rapides (Terminal)

Ce fichier récapitule les commandes essentielles.  
**Environnements (source de vérité) :** `_DOCS/SANDBOX_ARCHITECTURE_2026.md`

---

## 🛠️ Développement Local (Sandbox)

```bash
npm run dev
```

*Accès :* `http://localhost:5173`  
*Data :* projet Firebase **sandboxtat** via `.env.local` (`VITE_APP_LOGICAL_NAME=sandboxtat`)

### Mobile (même Wi-Fi)

```bash
npm run dev -- --host
```

---

## 🚀 Builds

| But | Commande | Env file |
|-----|----------|----------|
| Build sandbox / test | `npm run build` | `.env` / mode default |
| Build **production** | `npm run build:prod` | `.env.prod` |

⚠️ Ne jamais déployer la prod avec un simple `npm run build`.

---

## ☁️ Firebase CLI

```bash
firebase use              # voir le projet actif
firebase use sandbox      # sandboxtat
firebase use prod         # tousatable-client — DANGER sans accord
```

### Deploy sandbox (sur demande)

```bash
firebase use sandbox
npm run build
firebase deploy
# URL: https://sandboxtat.web.app
```

### Deploy production (accord user explicite + preflight)

```bash
firebase use prod
npm run build:prod
# puis firebase deploy selon runbook
firebase use sandbox      # revenir en non-prod
```

---

## 📚 Docs liées

- `_DOCS/SANDBOX_ARCHITECTURE_2026.md`
- `_DOCS/DEPLOIEMENT_PROD_RUNBOOK.md`
- `_DOCS/HANDOFF_LIVE_STOCK_SANDBOX.md`
