# Stratégie de Développement : Intent Router V2

Ce document définit le plan de découpage en 4 Pull Requests (PR) périmétrées pour implémenter la nouvelle vision UX/UI et Engine.

## PR 1 : Visual Foundation (Horizontal & Alive)
**Objectif :** Transformer l'expérience visuelle pour correspondre aux standards CI/CD (Gahuche -> Droite) et améliorer le feedback immédiat.

**Prompt à m'envoyer :**
```text
@workspace Implementation PR 1: Visual Foundation

1. **Layout Horizontal** :
   - Modifie `webview-ui/src/nodes/ActionNode.tsx` pour placer les Handles (connecteurs) à Gauche (Target) et à Droite (Source).
   - Ajuste le positionnement automatique dans `webview-ui/src/App.tsx` pour un flux horizontal (x + offset, y constant).

2. **Connecteurs Réactifs** :
   - Dans `App.tsx`, modifie la logique de rendu des `Edges`.
   - Les connecteurs doivent changer de couleur en fonction du statut du nœud *source* :
     - Gris : Idle (Défaut)
     - Bleu : Running
     - Vert : Success
     - Rouge : Error
   - **Important** : Le changement de couleur doit se faire uniquement quand le nœud source a *terminé* son exécution (Success/Error) ou démarre (Running).

3. **Nettoyage** :
   - Vérifie que le CSS supporte bien le layout horizontal sans overflow étrange.
```

---

## PR 2 : Data Engine (Inputs & Branching Serialization)
**Objectif :** Supporter les nœuds de variables ("Prompt") et la connexion "Un-vers-Plusieurs" sans casser l'exécution séquentielle.

**Prompt à m'envoyer :**
```text
@workspace Implementation PR 2: Data Engine & Variables

1. **Nouveau Nœud : PromptNode** :
   - Crée un composant `webview-ui/src/nodes/PromptNode.tsx`.
   - Il doit permettre de définir une variable (ex: `branchName`) et une valeur par défaut.
   - Il doit avoir un Handle `Source` à droite.

2. **Sérialisation Topologique (App.tsx)** :
   - Refactorise complètement la fonction `savePipeline` dans `webview-ui/src/App.tsx`.
   - Abandonne la boucle simple. Implémente un **Tri Topologique (Topological Sort)**.
   - Cela doit permettre de connecter un `PromptNode` à 3 terminaux différents.
   - Le résultat JSON doit rester une liste plate `steps` (exécution séquentielle) mais ordonnée correctement (Dépendances d'abord).
   - Exemple : Si A est connecté à B et C, l'ordre généré doit être [A, B, C].

3. **Injection** :
   - Assure-toi que les valeurs définies dans le PromptNode sont bien passées dans le payload des étapes suivantes via le mécanisme de variables existant (`${input:...}`).
```

---

## PR 3 : Capabilities (VS Code Presets)
**Objectif :** Ajouter la capacité de gérer l'environnement VS Code lui-même (No-Code Extensions).

**Prompt à m'envoyer :**
```text
@workspace Implementation PR 3: VS Code Provider

1. **Nouveau Provider : vscodeAdapter.ts** :
   - Crée `src/providers/vscodeAdapter.ts`.
   - Implémente la capability `vscode.installExtensions`.
   - Elle doit accepter une liste d'IDs d'extensions (ex: `['ms-python.python', 'esbenp.prettier-vscode']`).

2. **Exécution** :
   - Utilise `vscode.commands.executeCommand('workbench.extensions.installExtension', id)` pour l'installation.
   - Gère les erreurs proprement si une extension est introuvable.

3. **UI Schema** :
   - Déclare ce provider dans `src/registry.ts` avec un argument de type `string[]` (ou une zone de texte multiligne parsée) pour les IDs.
```

---

## PR 4 : Flow Control (Routing Logic)
**Objectif :** Introduire la logique conditionnelle simple (Success vs Error) sans complexifier l'UI.

**Prompt à m'envoyer :**
```text
@workspace Implementation PR 4: Routing Engine

1. **Schema Update (Types)** :
   - Modifie `src/types.ts` pour ajouter `onFailure?: string` (ID du step cible) à l'interface `Intent`.

2. **Engine Refactor (PipelineRunner)** :
   - Refactorise `src/pipelineRunner.ts`.
   - Remplace la boucle `for` linéaire par une machine à états (Pointer-based).
   - Logique :
     - Si Success : `currentIndex++` (Comportement par défaut).
     - Si Error et `onFailure` défini : `currentIndex = findIndex(onFailure)`.
     - Si Error et pas de `onFailure` : Stop.

3. **Serialization (UI)** :
   - Mets à jour `App.tsx` pour détecter si un connecteur est relié à un Handle "Error" (à créer sur `ActionNode` en rouge ?) ou utilise une convention (ex: un Toggle "On Error" sur le nœud qui crée une sortie alternative).
   - *Alternative simple V1* : Si un nœud a deux sorties, la première est Success, la deuxième est Error. Sérialise le lien vers la propriété `onFailure`.
```

---

## 5 Améliorations Proactives (Classées)

Voici 5 propositions pour aller plus loin, respectant la philosophie "Middle OS" et "Human First".

1.  **Live Terminal Streaming (NOW)**
    *   *Concept :* Streamer la sortie du terminal directement dans le nœud du graphe (mini-console) au lieu d'ouvrir le panel en bas.
    *   *Valeur :* Immersion totale. On ne quitte jamais le graphe des yeux.

2.  **Snapshot & Rollback (LATER)**
    *   *Concept :* Chaque exécution sauvegarde un "Snapshot" de l'état du graphe. On peut cliquer sur une exécution passée dans l'historique et "restaurer" le graphe tel qu'il était à ce moment-là.
    *   *Valeur :* Sécurité et traçabilité (Time Machine pour les pipelines).

3.  **Global Environment Panel (LATER)**
    *   *Concept :* Un panneau latéral pour gérer les variables globales (Secrets, Env Vars) qui sont injectées dans tous les terminaux.
    *   *Valeur :* Évite de répéter les configurations dans chaque nœud.

4.  **Headless Runner (CLI) (LATER)**
    *   *Concept :* Pouvoir lancer `code --run-pipeline my-flow.intent.json` sans ouvrir l'interface graphique.
    *   *Valeur :* Permet d'utiliser tes flows dans de vraies CI/CD (GitHub Actions) ou scripts shell.

5.  **Git Graph Visualization Node (NEVER / MOONSHOT)**
    *   *Concept :* Un nœud spécial qui affiche le vrai graphe Git du repo courant en temps réel.
    *   *Valeur :* Contexte visuel ultime pour les opérations de merge/rebase. (Classé "Never" car très complexe à maintenir vs utiliser l'extension Git Graph existante).
