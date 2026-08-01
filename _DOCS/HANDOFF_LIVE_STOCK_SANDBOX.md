# Handoff — Live catalogue stock + Sandbox

**Pour démarrer une nouvelle conversation proprement.**

## Lire dans cet ordre

1. `AGENTS.md` (règles prod / coûts Firebase)
2. `_DOCS/SANDBOX_ARCHITECTURE_2026.md` (prod vs sandboxtat, env, git)
3. `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` (**plan d’implémentation exécutable**)

## Prompt à coller

```
Implémente le plan _DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md phase par phase.
Contexte env : _DOCS/SANDBOX_ARCHITECTURE_2026.md

- Branche git : feature/live-catalog-stock-ab (créer si besoin) — PAS de branche "sandbox"
- Tests : sandbox sandboxtat via .env.local + npm run dev
- Interdit : écriture Firestore prod, deploy prod, modifier analytics, élargir Stripe/SEO
- Commencer par Phase 0 puis gate 0.5 APP_ID (functions hardcode) avant le live UI
- Parcours paiement à tester : virement/deferred only
- Remplir le journal en bas du plan
- Pas de merge main / deploy sans mon OK explicite
```

## Rappels express

| Sujet | Décision |
|-------|----------|
| Branche sandbox git ? | **Non** — feature branch par mission |
| Où tester ? | **sandboxtat** |
| Piège #1 | Functions `APP_ID` hardcodé `tat-made-in-normandie` |
| Piège #2 | Vieux docs env = `tatmadeinnormandie` (obsolète) |
| Live UI | gallery + detail only + anti-stale HTTP |
| Cancel | restore stock toujours (phase 1) |

## Copies plan

- `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` (source)
- `.hermes/plans/` (miroir si présent)
