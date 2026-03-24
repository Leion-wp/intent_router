---
name: intent-router-react-flow
description: Frontend guidelines and workflow for React Flow nodes, connection rules, theming, and state management in the Intent Router project. Use this skill whenever interacting with, creating, or modifying React Flow nodes or canvas elements in webview-ui/src/.
---

# Intent Router React Flow Frontend Skill

## 1. Création de Nodes Custom

Tous les nouveaux nœuds React Flow doivent être créés dans `webview-ui/src/nodes/` et utiliser l'API fonctionnelle de React enveloppée dans `memo`.

### Checklist d'ajout de node :
1. **Composant React :** Créer `NomDuNode.tsx` dans `webview-ui/src/nodes/`.
   - Utiliser `memo` pour l'export de bas de fichier.
   - Les handles doivent utiliser les IDs explicites conformes au système (ex: `in` pour l'entrée, `success`/`failure` pour les sorties).
2. **Style & Thème :** Appliquer les classes CSS existantes (`glass-node`, `glass-node-header`, `glass-node-body`). L'apparence repose sur l'effet "glassmorphism".
3. **Enregistrement :** Importer et ajouter le composant dans le dictionnaire `nodeTypes` situé au début de `webview-ui/src/App.tsx`.
4. **Build Pipeline :** Implémenter la logique de sérialisation du nœud (transformation du node visuel en step exécutable) dans la fonction `buildPipeline` de `webview-ui/src/App.tsx`. Ceci nécessite de définir `intent`, `payload` et `description`.
5. **Quick Add (Optionnel) :** Ajouter le support si nécessaire dans la mécanique de création par défaut.

## 2. Règles de Connexion (useFlowConnectionHandlers)

- **Validation :** La compatibilité est gérée via `createSocketTypeResolver`. Si `sourceType` et `targetType` sont incompatibles, la connexion échoue visuellement avec un Toast.
- **Remplacement :** L'éditeur applique une règle stricte : lorsqu'une nouvelle connexion arrive vers un `targetHandle` spécifique (généralement `in`), la précédente connexion entrante sur ce même port est automatiquement supprimée.
- **Auto-connexion :** Il est interdit de relier un nœud à lui-même (`source === target`).
- **Aspect :** Les connexions générées utilisent systématiquement `MarkerType.ArrowClosed` en terminaison.

## 3. Mise à jour des Données des Nodes (State)

- **Source de vérité unique :** Ne jamais gérer d'états répliqués au sein d'un composant de node via des `useState` isolés s'ils doivent être persistés.
- **Mutation :** Pour mettre à jour `node.data`, il faut impérativement appeler la fonction `updateNodeData(id, patch)` disponible via le `FlowEditorContext`.
  ```tsx
  const { updateNodeData } = useContext(FlowEditorContext);
  // Exemple
  updateNodeData(id, { args: newArgs });
  ```

## 4. Interaction Canvas (Quick Add, Insertion, Menu)

- **Logique extraite :** Ces interactions sont dans `webview-ui/src/hooks/useFlowCanvasInteractions.ts`.
- **Double Clic (Quick Add) :** Le déclencheur du Quick Add au milieu du canvas est un `event.detail === 2`. La position est résolue via `screenToFlowPosition`.
- **Insertion sur lien :** Cliquer sur le composant "plus" d'un lien (edge) ouvre le Quick Add en attachant l'edge ciblé au contexte (`setQuickAddEdge`), ce qui permettra d'insérer le nouveau nœud entre les deux nœuds existants.
- **Context Menu :** Les clics droits ouvrent un menu de contexte custom (`NodeContextMenu`) pour la suppression, copie, duplication, ou réduction (collapse).

## 5. Thème et Tokens (types/theme.ts)

- Pas de Tailwind. Le système s'appuie sur des variables CSS injectées programmatiquement sur `:root` par `applyThemeTokensToRoot`.
- **Variables Globales à utiliser :**
  - `--ir-node-bg`, `--ir-node-border`, `--ir-node-text`
  - `--ir-edge-idle`, `--ir-edge-running`, `--ir-edge-success`, `--ir-edge-error`
- **Design System Local :** Les overlays et composants "flottants" utilisent un style inline fort basé sur du `rgba(0,0,0,x)` et `rgba(255,255,255,x)` avec `backdropFilter` pour maintenir l'aspect moderne "glass".
- Les couleurs sémantiques sont codées en dur pour l'état (ex: `STATUS_COLORS.success = '#4caf50'`).
