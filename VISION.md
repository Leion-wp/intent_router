# Intent Router — Vision (V1 → V2)

## North Star
**Le graphe devient l’OS. VS Code devient le runtime/hôte.**

- VS Code = *kernel + drivers* (FS, terminal, extensions, permissions, UI surface).
- Intent Router = *userspace + scheduler + orchestrateur* (graph editor, pipeline engine, history, policies).
- Le graphe = *surface de contrôle unique* (cohérence, continuité cognitive, confiance).

## Invariant UX (non-négociable)
**Never leave the graph.**  
Tout ce qui concerne la création, l’édition, l’exécution, le debugging et l’historique doit être faisable *sans quitter le graphe*.

Conséquences UX attendues :
- Exécuter depuis le canvas (Run global / Run from here).
- Configurer un node sans ouvrir de fichier/settings (drawer/panel dans la webview).
- Inspecter logs/snapshots/restore dans la webview.
- Focus mode (graph fullscreen) pour minimiser la friction.

## Modèle mental
Un pipeline est un **DAG** d’intentions.
- Le builder sert à **composer**.
- Le runner sert à **ordonner** (topological sort / routing) et **exécuter** (séquentiel, robuste).
- L’utilisateur doit comprendre “où on en est” à tout moment : statut par node, logs par node, run global.

## Déterministe vs Interactif (clé V2)
Deux catégories de nodes, visibles et explicites :

### Déterministe (⚙)
Exécution reproductible, “CI-like” :
- terminal / git / docker / fs / http…
- exit code
- retry/caching (potentiel)

### Interactif / Non-déterministe (👤)
Dépend d’un humain ou d’une UI :
- pause / approvals
- prompts runtime
- chat/codex (si intégré)
- actions VS Code dépendantes du contexte UI

**Règle produit :** ne pas bloquer par défaut → *warn + confirm + explain*.  
Mais permettre un mode “CI strict” qui refuse les nodes 👤.

## Custom Nodes (V2) — trajectoire saine
Objectif : permettre de créer des nodes “métier” sans coder.

### C1 (prioritaire) — Schema-driven custom nodes (sans rebuild .vsix)
Un custom node est un **artefact versionnable**, pas du code opaque :
- `id`, `title`, `intent`
- `schema` (fields, types, validations, defaults)
- `mapping` → payload
- UI générée automatiquement dans le graphe

Stockage : workspace (ex: `.intent-router/nodes.json`) ou settings workspace.

### C2 (plus tard) — Plugin system / code
Seulement si le besoin apparaît chez des users :
- contributions externes
- versioning + sécurité + contrat d’API

## “Extension qui s’auto-modifie”
Possible, mais **jamais par défaut**.

Forme recommandée :
- Dev Mode explicite
- pipeline “build-extension → package → install VSIX → reload”
- HITL (human-in-the-loop) obligatoire
- logs visibles dans le graphe

## Principes de confiance (V1+)
- Aucune mutation silencieuse (settings/workspace/fichiers).
- Toujours rendre visible : *ce qui va être fait*, *où*, *avec quels inputs*, *avec quel risque*.
- Restore/rollback clairs, compatibles avec runs “anciens”.

