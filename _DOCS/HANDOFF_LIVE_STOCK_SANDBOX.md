# Handoff — Live catalogue stock + Sandbox

**Pour démarrer une nouvelle conversation proprement.**

## Lire dans cet ordre

1. **`_DOCS/todo.md`** ← **fichier directeur** (où on en est + prompts de reprise)
2. `AGENTS.md` (règles prod / coûts)
3. `_DOCS/SANDBOX_ARCHITECTURE_2026.md`
4. `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` (détail technique des phases)

## Prompt à coller

```
Lis d'abord _DOCS/todo.md (directeur) puis _DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md.
Exécute la phase indiquée dans todo.md « Phase courante ».
À chaque fin de phase : mets à jour todo.md + réponds avec Fait / Reste / Prompt de reprise.
Contexte : _DOCS/SANDBOX_ARCHITECTURE_2026.md
- Branche feature/live-catalog-stock-ab · sandbox sandboxtat only
- Live public gallery|detail only · pas de deploy prod sans OK
```

## Rappels

| Sujet | Décision |
|-------|----------|
| Directeur avancement | `_DOCS/todo.md` |
| Plan technique | `_DOCS/PLAN_LIVE_CATALOG_STOCK_AB.md` |
| Branche sandbox git ? | **Non** — feature branch |
| Où tester ? | **sandboxtat** |
| Fin de chaque phase | Fait + Reste + prompt suite dans le chat **et** dans todo.md |
