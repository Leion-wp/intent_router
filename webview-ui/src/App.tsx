import React, { createContext, useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  MiniMap,
  ReactFlowProvider,
  Edge,
  Node,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css';

import Sidebar from './Sidebar';
import ActionNode from './nodes/ActionNode';
import PromptNode from './nodes/PromptNode';
import RepoNode from './nodes/RepoNode';
import VSCodeCommandNode from './nodes/VSCodeCommandNode';
import StartNode from './nodes/StartNode';
import CustomNode from './nodes/CustomNode';
import FormNode from './nodes/FormNode';
import SwitchNode from './nodes/SwitchNode';
import ScriptNode from './nodes/ScriptNode';
import AgentNode from './nodes/AgentNode';
import AppLayoutShell from './components/AppLayoutShell';
import ChromeControlsPanel from './components/ChromeControlsPanel';
import { edgeTypes } from './components/InsertableEdge';
import FlowToasts from './components/FlowToasts';
import NodeContextMenu from './components/NodeContextMenu';
import NodeInspectorDrawer from './components/NodeInspectorDrawer';
import QuickAddDock from './components/QuickAddDock';
import QuickAddPalette from './components/QuickAddPalette';
import RunControlBar from './components/RunControlBar';
import { UiPreset } from './types/theme';
import { useGraphHistory } from './hooks/useGraphHistory';
import { useFlowKeyboardShortcuts } from './hooks/useFlowKeyboardShortcuts';
import { useAppShellState } from './hooks/useAppShellState';
import { useFlowChromePanel } from './hooks/useFlowChromePanel';
import { useFlowCanvasInteractions } from './hooks/useFlowCanvasInteractions';
import { useFlowConnectionHandlers } from './hooks/useFlowConnectionHandlers';
import { useFlowDropHandlers } from './hooks/useFlowDropHandlers';
import { useFlowHydrationMessages } from './hooks/useFlowHydrationMessages';
import { useFocusGraphMode } from './hooks/useFocusGraphMode';
import { useDrawerAutoPan } from './hooks/useDrawerAutoPan';
import { usePipelineRunActions } from './hooks/usePipelineRunActions';
import { usePipelineAutosave } from './hooks/usePipelineAutosave';
import { usePersistedFlowGraphState } from './hooks/usePersistedFlowGraphState';
import { useQuickAddActions } from './hooks/useQuickAddActions';
import { useQuickAddCatalog } from './hooks/useQuickAddCatalog';
import { useReactiveEdgeStyles } from './hooks/useReactiveEdgeStyles';
import { useRunPlaybackEffects } from './hooks/useRunPlaybackEffects';
import { useRunUiEffects } from './hooks/useRunUiEffects';
import {
  buildScriptCommand,
  canonicalizeIntent,
  firstMissingRequiredField,
  inferScriptInterpreter
} from './utils/pipelineUtils';
import { computeHorizontalAutoLayout } from './utils/autoLayoutUtils';
import {
  buildGraphAdjacency,
  buildPipelineUiSnapshot,
  computeRunSubsetFromGraph,
  topologicalSortWithSuccessPreference,
  validateDisconnectedNodes
} from './utils/flowGraphUtils';
import { buildGraphFromPipeline, restoreGraphFromPipelineSnapshot } from './utils/pipelineLoadUtils';
import { formatUiError } from './utils/uiMessageUtils';
import { computeSidebarWidthFromKey } from './utils/sidebarResizeUtils';
import {
  canDeleteContextNode,
  canDisconnectContextNode,
  canToggleCollapseContextNode
} from './utils/nodeContextMenuUtils';

// Context for Registry
export const RegistryContext = createContext<any>({});

// Runtime context for nodes (Prompt vars + ENV vars)
export const FlowRuntimeContext = createContext<{
  getAvailableVars: () => string[];
  isRunPreviewNode: (id: string) => boolean;
}>({
  getAvailableVars: () => [],
  isRunPreviewNode: () => false
});

// Editor context for mutating nodes from within node components (single source of truth)
export const FlowEditorContext = createContext<{
  updateNodeData: (id: string, patch: Record<string, any>) => void;
}>({
  updateNodeData: () => {}
});

export const CustomNodesContext = createContext<{
  nodes: any[];
  getById: (id: string) => any | undefined;
}>({
  nodes: [],
  getById: () => undefined
});

// Register custom node types
const nodeTypes = {
  startNode: StartNode,
  actionNode: ActionNode,
  promptNode: PromptNode,
  repoNode: RepoNode,
  vscodeCommandNode: VSCodeCommandNode,
  customNode: CustomNode,
  formNode: FormNode,
  switchNode: SwitchNode,
  scriptNode: ScriptNode,
  agentNode: AgentNode
};

declare global {
  interface Window {
    vscode: any;
    initialData: any;
  }
}

// Acquire VS Code API (safe singleton)
const vscode = window.vscode || (window.vscode = (window as any).acquireVsCodeApi ? (window as any).acquireVsCodeApi() : null);

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'startNode',
    data: { label: 'My Pipeline', description: '' },
    position: { x: 250, y: 50 },
    sourcePosition: Position.Right,
    deletable: false
  },
];

let idCounter = 0;
const getId = () => `node_${idCounter++}`;

function emitPipelineBuildError(message: string): null {
  const userMessage = formatUiError(message, {
    context: 'Pipeline build',
    action: 'Fix the graph configuration then retry.'
  });
  if (vscode) {
    vscode.postMessage({ type: 'error', message: userMessage });
  } else {
    alert(userMessage);
  }
  return null;
}

function Flow({
  selectedRun,
  restoreRun,
  onRestoreHandled,
  sidebarCollapsed,
  onSetSidebarCollapsed,
  uiPreset
}: {
  selectedRun: any,
  restoreRun: any,
  onRestoreHandled: () => void,
  sidebarCollapsed: boolean,
  onSetSidebarCollapsed: (next: boolean) => void,
  uiPreset: UiPreset
}) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChangeInternal] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const MAX_LOG_LINES = 200;
  const [runPreviewIds, setRunPreviewIds] = useState<Set<string> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string } | null>(null);
  const [drawerNodeId, setDrawerNodeId] = useState<string | null>(null);
  const suppressRemoveUntilRef = useRef<number>(0);
  const lastOpenNodeIdRef = useRef<string | null>(null);
  const lastOpenNodeAtRef = useRef<number>(0);
  const { commandGroups } = useContext(RegistryContext);
  const [customNodes, setCustomNodes] = useState<any[]>(
    (window.initialData?.customNodes as any[]) || []
  );

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddQuery, setQuickAddQuery] = useState('');
  const [quickAddAnchor, setQuickAddAnchor] = useState<{ x: number; y: number } | null>(null);
  const [quickAddPos, setQuickAddPos] = useState<{ x: number; y: number } | null>(null);
  const [quickAddEdge, setQuickAddEdge] = useState<Edge | null>(null);
  const [dockOpen, setDockOpen] = useState(false);
  const [dockQuery, setDockQuery] = useState('');
  const [lastCanvasPos, setLastCanvasPos] = useState<{ x: number; y: number } | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [chromeOpacity, setChromeOpacity] = useState<number>(0.95);
  const [showMiniMap, setShowMiniMap] = useState<boolean>(true);
  const [showControls, setShowControls] = useState<boolean>(true);
  const [focusGraph, setFocusGraph] = useState<boolean>(false);
  const [chromeCollapsed, setChromeCollapsed] = useState<boolean>(false);
  const [chromePanelPos, setChromePanelPos] = useState<{ x: number; y: number }>({ x: 430, y: 56 });
  const [runMenuOpen, setRunMenuOpen] = useState<boolean>(false);
  const [runPillStatus, setRunPillStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const chromePanelDragRef = useRef<{ dx: number; dy: number } | null>(null);
  const copiedNodeRef = useRef<Node | null>(null);

  const [environment, setEnvironment] = useState<Record<string, string>>(
    (window.initialData?.environment as Record<string, string>) || {}
  );
  const pipelineUri = window.initialData?.pipelineUri as string | null | undefined;

  const nodesRef = useRef<any[]>(nodes);
  const envRef = useRef<Record<string, string>>(environment);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    envRef.current = environment;
  }, [environment]);

  const {
    canUndo,
    canRedo,
    graphToast,
    undoGraph,
    redoGraph
  } = useGraphHistory({
    nodes,
    edges,
    setNodes,
    setEdges
  });

  useEffect(() => {
    try {
      const st = vscode?.getState?.() || {};
      const chrome = st.chrome || {};
      if (typeof chrome.opacity === 'number') {
        setChromeOpacity(Math.max(0.3, Math.min(1, chrome.opacity)));
      }
      if (typeof chrome.showMiniMap === 'boolean') setShowMiniMap(chrome.showMiniMap);
      if (typeof chrome.showControls === 'boolean') setShowControls(chrome.showControls);
      if (typeof chrome.focusGraph === 'boolean') setFocusGraph(chrome.focusGraph);
      if (typeof chrome.collapsed === 'boolean') setChromeCollapsed(chrome.collapsed);
      if (chrome.position && typeof chrome.position.x === 'number' && typeof chrome.position.y === 'number') {
        setChromePanelPos({ x: chrome.position.x, y: chrome.position.y });
      }
    } catch {
      // ignore
    }
  }, []);

  const getAvailableVars = useCallback((): string[] => {
    const promptVars = (nodesRef.current || [])
      .filter((n: any) => n?.type === 'promptNode')
      .map((n: any) => String(n?.data?.name || '').trim())
      .filter((s: string) => !!s);

    const formVars = (nodesRef.current || [])
      .filter((n: any) => n?.type === 'formNode')
      .flatMap((n: any) => (Array.isArray(n?.data?.fields) ? n.data.fields : []))
      .map((f: any) => String(f?.key || '').trim())
      .filter(Boolean);

    const envVars = Object.keys(envRef.current || {}).map(s => String(s).trim()).filter(Boolean);

    const all = Array.from(new Set([...promptVars, ...formVars, ...envVars]));
    all.sort((a, b) => a.localeCompare(b));
    return all;
  }, []);

  const isRunPreviewNode = useCallback(
    (id: string) => (runPreviewIds ? runPreviewIds.has(id) : false),
    [runPreviewIds]
  );

  const flowRuntime = useMemo(
    () => ({ getAvailableVars, isRunPreviewNode }),
    [getAvailableVars, isRunPreviewNode]
  );

  const updateNodeData = useCallback((id: string, patch: Record<string, any>) => {
    setNodes((nds) =>
      nds.map((n: any) => (n.id === id ? { ...n, data: { ...(n.data || {}), ...patch } } : n))
    );
  }, [setNodes]);

  const customNodesById = useMemo(() => {
    const map = new Map<string, any>();
    for (const n of customNodes || []) {
      const nid = String((n as any)?.id || '').trim();
      if (!nid) continue;
      map.set(nid, n);
    }
    return map;
  }, [customNodes]);

  const customNodesContextValue = useMemo(() => {
    return {
      nodes: customNodes || [],
      getById: (nid: string) => customNodesById.get(String(nid || '').trim())
    };
  }, [customNodes, customNodesById]);

  const getDefaultCapability = useCallback((providerName: string) => {
    const group = (commandGroups || []).find((g: any) => g.provider === providerName);
    const caps = group?.commands || [];
    if (!caps.length) return '';
    return caps.find((c: any) => String(c.capability || '').endsWith('.run'))?.capability || caps[0].capability || '';
  }, [commandGroups]);

  const {
    filteredQuickAddItems,
    filteredDockItems,
    categoryTitleMap,
    quickAddGroupedItems,
    dockGroupedItems,
    paletteLeft,
    paletteTop
  } = useQuickAddCatalog({
    commandGroups: commandGroups || [],
    customNodes,
    uiPreset,
    quickAddQuery,
    dockQuery,
    quickAddAnchor,
    getDefaultCapability
  });
  const { addNodeFromItem, openQuickAddPalette } = useQuickAddActions({
    getId,
    getDefaultCapability,
    lastCanvasPos,
    reactFlowInstance,
    customNodesById,
    setNodes,
    setEdges,
    setQuickAddEdge,
    setQuickAddPos,
    setQuickAddAnchor,
    setQuickAddQuery,
    setQuickAddOpen
  });


  const onNodesChange = useCallback(
    (changes: any) => {
      const filtered = (changes || []).filter((c: any) => c.type !== 'remove');
      if (filtered.length !== (changes || []).length) {
        try {
          console.warn('[IntentRouter] remove blocked', { changes, filtered });
        } catch {}
      }
      onNodesChangeInternal(filtered);
    },
    [onNodesChangeInternal]
  );

  const handleEdgeInsert = useCallback((edgeProps: any, clientX: number, clientY: number) => {
    const pos = reactFlowInstance?.screenToFlowPosition
      ? reactFlowInstance.screenToFlowPosition({ x: clientX, y: clientY })
      : undefined;
    const edge = edges.find((e) => e.id === edgeProps.id) || (edgeProps as Edge);
    setQuickAddEdge(edge);
    setQuickAddPos(pos || null);
    setQuickAddAnchor({ x: clientX, y: clientY });
    setQuickAddQuery('');
    setQuickAddOpen(true);
  }, [reactFlowInstance, edges]);

  const edgesWithHandlers = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        type: e.type ?? 'insertable',
        data: { ...(e.data || {}), onInsert: handleEdgeInsert }
      })),
    [edges, handleEdgeInsert]
  );

  const duplicateNodeById = useCallback((nodeId: string, explicitPosition?: { x: number; y: number }) => {
    let createdId: string | null = null;
    setNodes((prev) => {
      const source = prev.find((entry: any) => entry.id === nodeId);
      if (!source || source.id === 'start') return prev;

      const cloneId = getId();
      createdId = cloneId;
      const base = source.position || { x: 120, y: 120 };
      const nextPos = explicitPosition || { x: base.x + 44, y: base.y + 44 };
      const nextNode: any = {
        ...source,
        id: cloneId,
        position: nextPos,
        selected: false,
        dragging: false,
        data: JSON.parse(JSON.stringify(source.data || {}))
      };
      return [...prev, nextNode];
    });
    if (createdId) {
      setSelectedNodeId(createdId);
    }
  }, [setNodes]);

  const copyNodeById = useCallback((nodeId: string) => {
    const source = nodes.find((entry: any) => entry.id === nodeId);
    if (!source || source.id === 'start') return;
    copiedNodeRef.current = JSON.parse(JSON.stringify(source));
  }, [nodes]);

  const pasteCopiedNode = useCallback(() => {
    const source = copiedNodeRef.current;
    if (!source) return;
    const pos = lastCanvasPos || { x: 220, y: 140 };
    const cloneId = getId();
    const nextNode: any = {
      ...source,
      id: cloneId,
      position: { x: pos.x + 12, y: pos.y + 12 },
      selected: false,
      dragging: false,
      data: JSON.parse(JSON.stringify(source.data || {}))
    };
    setNodes((prev) => [...prev, nextNode]);
    setSelectedNodeId(cloneId);
  }, [lastCanvasPos, setNodes]);

  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === 'start') return;
    const nodeId = selectedNodeId;
    setNodes((prev) => prev.filter((entry: any) => entry.id !== nodeId));
    setEdges((prev) => prev.filter((edge: any) => edge.source !== nodeId && edge.target !== nodeId));
    setDrawerNodeId((entry) => (entry === nodeId ? null : entry));
    setSelectedNodeId(null);
  }, [selectedNodeId, setNodes, setEdges]);

  useFlowKeyboardShortcuts({
    quickAddOpen,
    dockOpen,
    setQuickAddOpen,
    setDockOpen,
    selectedNodeId,
    copyNodeById,
    pasteCopiedNode,
    duplicateNodeById,
    deleteSelectedNode,
    undoGraph,
    redoGraph,
    reactFlowInstance
  });

  useEffect(() => {
    const onDocClick = () => setContextMenu(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    const onOpenQuickAdd = () => openQuickAddPalette();
    window.addEventListener('intentRouter.openQuickAdd', onOpenQuickAdd as EventListener);
    return () => window.removeEventListener('intentRouter.openQuickAdd', onOpenQuickAdd as EventListener);
  }, [openQuickAddPalette]);

  const computeRunSubset = useCallback(
    (startNodeId: string) => {
      return computeRunSubsetFromGraph(startNodeId, nodes, edges);
    },
    [edges, nodes]
  );

  const syncIdCounterFromNodes = useCallback((list: Array<any>) => {
    let max = -1;
    for (const n of list || []) {
      const id = String(n?.id ?? '');
      const m = /^node_(\d+)$/.exec(id);
      if (!m) continue;
      const num = Number(m[1]);
      if (Number.isFinite(num)) max = Math.max(max, num);
    }
    if (max >= 0 && max + 1 > idCounter) {
      idCounter = max + 1;
    }
  }, []);

  const setDeepValue = (obj: any, path: string, value: any) => {
    const parts = String(path || '').split('.').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    let cur = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      const key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') {
        cur[key] = {};
      }
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  };

  const buildCustomPayload = (defOrSnapshot: any, nodeData: any): { description: string; payload: any; intent: string } => {
    const intent = String(defOrSnapshot?.intent || nodeData?.intent || '').trim();
    const mapping = (defOrSnapshot?.mapping || nodeData?.mapping) as any;
    const schema = Array.isArray(defOrSnapshot?.schema) ? defOrSnapshot.schema : (Array.isArray(nodeData?.schema) ? nodeData.schema : []);
    const allArgs = (nodeData?.args && typeof nodeData.args === 'object') ? nodeData.args : {};
    const { description, ...rest } = allArgs as any;

    // Default behavior: identity mapping of schema fields (excluding description)
    if (!mapping || typeof mapping !== 'object') {
      return { intent, description: String(description || ''), payload: rest };
    }

    const payload: any = {};
    for (const [payloadKey, mapValue] of Object.entries(mapping)) {
      if (typeof mapValue === 'string' && Object.prototype.hasOwnProperty.call(rest, mapValue)) {
        setDeepValue(payload, payloadKey, (rest as any)[mapValue]);
      } else {
        setDeepValue(payload, payloadKey, mapValue);
      }
    }

    // If mapping is provided but empty, fall back to schema-driven identity.
    if (Object.keys(payload).length === 0 && Array.isArray(schema) && schema.length > 0) {
      for (const f of schema) {
        const name = String((f as any)?.name || '').trim();
        if (!name) continue;
        if (Object.prototype.hasOwnProperty.call(rest, name)) {
          payload[name] = (rest as any)[name];
        }
      }
    }

    return { intent, description: String(description || ''), payload };
  };

  const buildPipeline = useCallback(
    (opts?: { allowedNodeIds?: Set<string> }) => {
      const allowedNodeIds = opts?.allowedNodeIds;
      const effectiveNodes = allowedNodeIds ? nodes.filter((n: any) => allowedNodeIds.has(n.id)) : nodes;
      const effectiveEdges = allowedNodeIds
        ? edges.filter((e: any) => allowedNodeIds.has(e.source) && allowedNodeIds.has(e.target))
        : edges;

      const { nodeMap, adj, inDegree, failureMap, successEdgePref } = buildGraphAdjacency(effectiveNodes, effectiveEdges);

      const disconnectedError = validateDisconnectedNodes(effectiveNodes, adj, inDegree);
      if (disconnectedError) {
        return emitPipelineBuildError(disconnectedError);
      }

      const sortedIds = topologicalSortWithSuccessPreference(adj, inDegree, successEdgePref);
      if (sortedIds.length !== effectiveNodes.length) {
        return emitPipelineBuildError('Cycle detected in pipeline graph.');
      }

      // 5. Map Sorted Nodes to Steps
      const steps: any[] = [];
      let stepBuildError: string | null = null;
      sortedIds.forEach(id => {
        const node = nodeMap.get(id);
        if (!node) return;

        // Skip Start Node for executable steps
        if (node.type === 'startNode' || node.type === 'input') return;

        let intent = '';
        let description = '';
        let payload: any = {};
        const data: any = node.data;

        if (node.type === 'promptNode') {
          intent = 'system.setVar';
          payload = { name: data.name, value: data.value };
        } else if (node.type === 'formNode') {
          intent = 'system.form';
          payload = { fields: Array.isArray(data.fields) ? data.fields : [] };
        } else if (node.type === 'switchNode') {
          intent = 'system.switch';
          description = String(data.label || '');

          const outgoing = effectiveEdges.filter((e: any) => e.source === node.id);
          const routes = Array.isArray(data.routes) ? data.routes : [];
          const routePayload = routes.map((r: any, i: number) => {
            const handleId = `route_${i}`;
            const edge = outgoing.find((e: any) => String(e.sourceHandle || '') === handleId);
            const condition = String(r?.condition || 'equals').trim().toLowerCase();
            const value = String(r?.value ?? r?.equalsValue ?? '');
            return {
              label: String(r?.label || handleId),
              condition,
              value,
              equalsValue: condition === 'equals' ? value : '',
              targetStepId: edge?.target
            };
          });

          const invalidRoute = routePayload.find((route: any) => {
            const condition = String(route?.condition || 'equals').toLowerCase();
            if (condition === 'exists') {
              return false;
            }
            return String(route?.value || '').trim().length === 0;
          });
          if (invalidRoute) {
            stepBuildError = `Switch node "${String(data.label || node.id)}" has a route without required value (${String(invalidRoute.condition || 'equals')}).`;
            return;
          }

          const defaultEdge = outgoing.find((e: any) => String(e.sourceHandle || '') === 'default');
          const defaultStepId = defaultEdge?.target;
          if (!defaultStepId) {
            stepBuildError = 'Switch node must have a connected "default" output.';
            return;
          }

          payload = {
            variableKey: String(data.variableKey || '').trim(),
            routes: routePayload,
            defaultStepId
          };
        } else if (node.type === 'scriptNode') {
          intent = 'terminal.run';
          const scriptPath = String(data.scriptPath || '').trim();
          if (!scriptPath) {
            stepBuildError = 'Script node must define "scriptPath".';
            return;
          }
          const args = String(data.args || '');
          const interpreter = String(data.interpreter || '').trim();
          const inferred = inferScriptInterpreter(scriptPath);
          const effectiveInterpreter = interpreter || inferred;
          if (!effectiveInterpreter) {
            stepBuildError = `Script node "${node.id}" has unsupported extension. Set interpreter override.`;
            return;
          }
          const command = buildScriptCommand(scriptPath, args, effectiveInterpreter);
          const cwd = String(data.cwd || '').trim();
          payload = {
            command,
            ...(cwd ? { cwd } : {}),
            scriptPath,
            args,
            interpreter: interpreter || undefined,
            __kind: 'script'
          };
          description = String(data.description || '');
        } else if (node.type === 'repoNode') {
          intent = 'system.setCwd';
          payload = { path: data.path };
        } else if (node.type === 'agentNode') {
          intent = 'ai.generate';
          payload = {
            agent: data.agent,
            model: data.model,
            instruction: data.instruction,
            contextFiles: data.contextFiles,
            outputVar: data.outputVar
          };
          description = String(data.label || 'AI Task');
        } else if (node.type === 'vscodeCommandNode') {
          intent = 'vscode.runCommand';
          payload = { commandId: data.commandId, argsJson: data.argsJson };
        } else if (node.type === 'actionNode') {
          const normalized = canonicalizeIntent(String(data.provider || ''), String(data.capability || ''));
          const providerGroup = (commandGroups || []).find((group: any) => String(group?.provider || '') === normalized.provider);
          const capabilityConfig = (providerGroup?.commands || []).find((command: any) => {
            const cap = String(command?.capability || '').trim();
            return cap === normalized.intent || cap.endsWith(`.${String(data.capability || '').trim()}`);
          });
          const missingRequiredArg = firstMissingRequiredField(Array.isArray(capabilityConfig?.args) ? capabilityConfig.args : [], (data.args || {}) as any);
          if (missingRequiredArg) {
            stepBuildError = `Node "${String(data.label || node.id)}" is missing required field "${missingRequiredArg}".`;
            return;
          }
          intent = normalized.intent;
          const { description: desc, ...rest } = data.args || {};
          description = desc;
          payload = rest;
        } else if (node.type === 'customNode') {
          const cnid = String(data.customNodeId || '').trim();
          const def = cnid ? customNodesById.get(cnid) : undefined;
          const schemaFields = Array.isArray(def?.schema) ? def?.schema : (Array.isArray(data?.schema) ? data.schema : []);
          const missingRequiredArg = firstMissingRequiredField(schemaFields, (data.args || {}) as any);
          if (missingRequiredArg) {
            stepBuildError = `Node "${String(data.label || data.title || node.id)}" is missing required field "${missingRequiredArg}".`;
            return;
          }
          const built = buildCustomPayload(def || data, data);
          intent = built.intent;
          description = built.description;
          payload = built.payload;
        }

        if (intent) {
          const stepObj: any = {
            id: node.id,
            intent,
            description,
            payload
          };

          if (failureMap.has(node.id) && nodeMap.has(failureMap.get(node.id)!)) {
            stepObj.onFailure = failureMap.get(node.id);
          }

          steps.push(stepObj);
        }
      });

      if (stepBuildError) {
        return emitPipelineBuildError(stepBuildError);
      }

      const start = nodes.find((n: any) => n.id === 'start');
      const pipelineName = (start?.data?.label as string) || 'My Pipeline';
      const pipelineDescription = String(start?.data?.description ?? '').trim();

      const pipeline: any = {
        name: pipelineName,
        description: pipelineDescription || undefined,
        intent: 'pipeline.run',
        steps,
        meta: {
          ui: buildPipelineUiSnapshot(nodes, edges)
        }
      };

      return pipeline;
    },
    [edges, nodes, commandGroups, customNodesById]
  );

  const loadPipeline = useCallback((pipeline: any) => {
    console.log('Loading pipeline:', pipeline);

    const restored = restoreGraphFromPipelineSnapshot(pipeline);
    if (restored) {
      console.log('Restoring from snapshot');
      syncIdCounterFromNodes(restored.nodes);
      setNodes(restored.nodes);
      setEdges(restored.edges);
      setTimeout(() => reactFlowInstance?.fitView(), 100);
      return;
    }

    const failureColor = getComputedStyle(document.documentElement).getPropertyValue('--ir-edge-error').trim() || '#f44336';
    const graph = buildGraphFromPipeline(pipeline, {
      getNextNodeId: getId,
      failureColor
    });

    setNodes(graph.nodes);
    setEdges(graph.edges);
    syncIdCounterFromNodes(graph.nodes);
    setTimeout(() => reactFlowInstance?.fitView(), 100);
  }, [reactFlowInstance, setEdges, setNodes, syncIdCounterFromNodes]);

  useFlowHydrationMessages({
    vscode,
    reactFlowInstance,
    initialPipeline: window.initialData?.pipeline,
    maxLogLines: MAX_LOG_LINES,
    loadPipeline,
    syncIdCounterFromNodes,
    setNodes,
    setEdges,
    setEnvironment,
    setCustomNodes,
    setRunPillStatus
  });

  usePersistedFlowGraphState({
    vscode,
    nodes,
    edges,
    chrome: {
      opacity: chromeOpacity,
      showMiniMap,
      showControls,
      focusGraph,
      collapsed: chromeCollapsed,
      position: chromePanelPos
    }
  });

  useFlowChromePanel({
    chromeCollapsed,
    chromePanelDragRef,
    setChromePanelPos
  });

  useRunPlaybackEffects({
    restoreRun,
    selectedRun,
    loadPipeline,
    onRestoreHandled,
    setNodes
  });

  useReactiveEdgeStyles({
    nodes,
    setEdges
  });

  const { onConnect } = useFlowConnectionHandlers({
    commandGroups: commandGroups || [],
    customNodesById,
    nodes,
    setEdges,
    setConnectionError
  });

  const { onDragOver, onDrop } = useFlowDropHandlers({
    reactFlowInstance,
    customNodesById,
    getId,
    setNodes
  });

  const {
    savePipeline,
    runPipeline,
    runPipelineFromHere,
    resetRuntimeUiState
  } = usePipelineRunActions({
    vscode,
    buildPipeline,
    computeRunSubset,
    setRunPreviewIds,
    setRunPillStatus,
    setRunMenuOpen,
    setNodes
  });

  usePipelineAutosave({
    vscode,
    pipelineUri,
    buildPipeline,
    nodes,
    edges
  });

  const { toggleFocusGraph } = useFocusGraphMode({
    focusGraph,
    sidebarCollapsed,
    setFocusGraph,
    onSetSidebarCollapsed,
    setShowMiniMap
  });

  useRunUiEffects({
    runMenuOpen,
    setRunMenuOpen,
    connectionError,
    setConnectionError,
    runPillStatus,
    setRunPillStatus
  });

  const autoLayout = useCallback(() => {
    const positions = computeHorizontalAutoLayout(nodes, edges, {
      baseX: 250,
      baseY: 50,
      xSpacing: 320
    });
    setNodes((nds) =>
      nds.map((n) => {
        const next = positions.get(n.id);
        if (!next) return n;
        return { ...n, position: next };
      })
    );
    setTimeout(() => reactFlowInstance?.fitView(), 50);
  }, [nodes, edges, reactFlowInstance]);

  const drawerNode = useMemo(() => nodes.find((n: any) => n.id === drawerNodeId) ?? null, [nodes, drawerNodeId]);

  useDrawerAutoPan({
    drawerNodeId,
    reactFlowInstance,
    nodes,
    drawerWidthPx: 360,
    marginPx: 24
  });

  const { onPaneClick, onNodeContextMenu } = useFlowCanvasInteractions({
    reactFlowInstance,
    quickAddOpen,
    setQuickAddOpen,
    setLastCanvasPos,
    setQuickAddPos,
    setQuickAddAnchor,
    setQuickAddEdge,
    setQuickAddQuery,
    setContextMenu
  });

  const openNodeFromContextMenu = useCallback((nodeId: string) => {
    suppressRemoveUntilRef.current = Date.now() + 800;
    lastOpenNodeIdRef.current = nodeId;
    lastOpenNodeAtRef.current = Date.now();
    setDrawerNodeId(nodeId);
  }, []);

  const pasteNodeFromContextMenu = useCallback((anchor: { x: number; y: number }) => {
    if (!copiedNodeRef.current) {
      return;
    }
    const position = reactFlowInstance?.screenToFlowPosition
      ? reactFlowInstance.screenToFlowPosition({ x: anchor.x + 18, y: anchor.y + 18 })
      : undefined;
    const cloneId = getId();
    const source = copiedNodeRef.current as any;
    const nextNode: any = {
      ...source,
      id: cloneId,
      position: position || { x: (source?.position?.x || 100) + 26, y: (source?.position?.y || 100) + 26 },
      selected: false,
      dragging: false,
      data: JSON.parse(JSON.stringify(source?.data || {}))
    };
    setNodes((nodes) => [...nodes, nextNode]);
    setSelectedNodeId(cloneId);
  }, [reactFlowInstance, setNodes]);

  const toggleContextNodeCollapse = useCallback((nodeId: string) => {
    if (!canToggleCollapseContextNode(nodeId)) {
      return;
    }
    setNodes((nodes) => nodes.map((entry: any) => (
      entry.id === nodeId ? { ...entry, data: { ...(entry.data || {}), collapsed: !entry?.data?.collapsed } } : entry
    )));
  }, []);

  const disconnectContextNodeLinks = useCallback((nodeId: string) => {
    if (!canDisconnectContextNode(nodeId)) {
      return;
    }
    setEdges((edges) => edges.filter((edge: any) => edge.source !== nodeId && edge.target !== nodeId));
  }, []);

  const deleteNodeFromContextMenu = useCallback((nodeId: string) => {
    if (!canDeleteContextNode(nodeId)) {
      return;
    }
    setNodes((nodes) => nodes.filter((node: any) => node.id !== nodeId));
    setEdges((edges) => edges.filter((edge: any) => edge.source !== nodeId && edge.target !== nodeId));
    setDrawerNodeId((value) => (value === nodeId ? null : value));
  }, []);

 	  return (
 	    <div className="dndflow">
  	      <div className="reactflow-wrapper" ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
  	        <FlowRuntimeContext.Provider value={flowRuntime}>
              <FlowEditorContext.Provider value={{ updateNodeData }}>
              <CustomNodesContext.Provider value={customNodesContextValue}>
              <ReactFlow
                nodes={nodes}
                edges={edgesWithHandlers}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onInit={setReactFlowInstance}
                onDrop={onDrop}
                onDragOver={onDragOver}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onPaneClick={onPaneClick}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                snapToGrid={true}
                fitView
              onNodeContextMenu={onNodeContextMenu}
              >
                {showControls && <Controls style={{ opacity: chromeOpacity }} />}
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                {showMiniMap && <MiniMap style={{ opacity: chromeOpacity }} />}
              </ReactFlow>
              </CustomNodesContext.Provider>
              </FlowEditorContext.Provider>
  	        </FlowRuntimeContext.Provider>
  	      </div>

        <FlowToasts connectionError={connectionError} graphToast={graphToast} />

        <NodeContextMenu
          contextMenu={contextMenu}
          canPaste={!!copiedNodeRef.current}
          onOpenNode={openNodeFromContextMenu}
          onCopyNode={copyNodeById}
          onPasteNode={pasteNodeFromContextMenu}
          onDuplicateNode={duplicateNodeById}
          onToggleCollapse={toggleContextNodeCollapse}
          onDisconnectNodeLinks={disconnectContextNodeLinks}
          onClearHighlight={() => setRunPreviewIds(null)}
          onRunFromNode={runPipelineFromHere}
          onDeleteNode={deleteNodeFromContextMenu}
          onClose={() => setContextMenu(null)}
        />

        <QuickAddPalette
          quickAddOpen={quickAddOpen}
          quickAddAnchor={quickAddAnchor}
          paletteLeft={paletteLeft}
          paletteTop={paletteTop}
          quickAddQuery={quickAddQuery}
          setQuickAddQuery={setQuickAddQuery}
          filteredQuickAddItems={filteredQuickAddItems}
          quickAddGroupedItems={quickAddGroupedItems}
          categoryTitleMap={categoryTitleMap}
          addNodeFromItem={addNodeFromItem}
          quickAddPos={quickAddPos}
          quickAddEdge={quickAddEdge}
          setQuickAddOpen={setQuickAddOpen}
          setQuickAddEdge={setQuickAddEdge}
        />

        <NodeInspectorDrawer
          drawerNode={drawerNode}
          setDrawerNodeId={setDrawerNodeId}
        />

        <QuickAddDock
          dockOpen={dockOpen}
          setDockOpen={setDockOpen}
          dockQuery={dockQuery}
          setDockQuery={setDockQuery}
          filteredDockItems={filteredDockItems}
          dockGroupedItems={dockGroupedItems}
          categoryTitleMap={categoryTitleMap}
          addNodeFromItem={addNodeFromItem}
          lastCanvasPos={lastCanvasPos}
          chromeOpacity={chromeOpacity}
        />

        <RunControlBar
          chromeOpacity={chromeOpacity}
          runPillStatus={runPillStatus}
          runMenuOpen={runMenuOpen}
          setRunMenuOpen={setRunMenuOpen}
          selectedNodeId={selectedNodeId}
          runPipeline={runPipeline}
          runPipelineFromHere={runPipelineFromHere}
          setRunPreviewIds={setRunPreviewIds}
        />

        <button
          type="button"
          onClick={autoLayout}
          aria-label="Auto layout graph"
          style={{
           position: 'absolute',
           top: '10px',
           right: '260px',
           padding: '10px 14px',
           background: 'var(--vscode-button-secondaryBackground)',
           color: 'var(--vscode-button-secondaryForeground)',
           border: 'none',
           borderRadius: '4px',
           cursor: 'pointer',
           zIndex: 5,
           opacity: chromeOpacity
         }}
       >
         Auto layout
       </button>

        <ChromeControlsPanel
          chromePanelPos={chromePanelPos}
          chromeCollapsed={chromeCollapsed}
          setChromeCollapsed={setChromeCollapsed}
          setChromePanelPos={setChromePanelPos}
          chromePanelDragRef={chromePanelDragRef}
          chromeOpacity={chromeOpacity}
          focusGraph={focusGraph}
          toggleFocusGraph={toggleFocusGraph}
          showMiniMap={showMiniMap}
          setShowMiniMap={setShowMiniMap}
          showControls={showControls}
          setShowControls={setShowControls}
          canUndo={canUndo}
          undoGraph={undoGraph}
          canRedo={canRedo}
          redoGraph={redoGraph}
          selectedNodeId={selectedNodeId}
          runPipelineFromHere={runPipelineFromHere}
          resetRuntimeUiState={resetRuntimeUiState}
          setChromeOpacity={setChromeOpacity}
        />

       <button
         type="button"
         onClick={savePipeline}
         aria-label="Save pipeline"
         style={{
           position: 'absolute',
           top: '10px',
           right: '10px',
           padding: '10px 20px',
           background: 'var(--vscode-button-background)',
           color: 'var(--vscode-button-foreground)',
           border: 'none',
           borderRadius: '4px',
           cursor: 'pointer',
           zIndex: 5,
           opacity: chromeOpacity
         }}
       >
         Save Pipeline
       </button>
     </div>
   );
 }

export default function App() {
  const {
    commandGroups,
    history,
    selectedRun,
    setSelectedRun,
    restoreRun,
    uiPreset,
    uiPresetRelease,
    adminMode,
    sidebarCollapsed,
    setSidebarCollapsed,
    sidebarWidth,
    setSidebarWidth,
    sidebarTab,
    setSidebarTab,
    visibleSidebarTabs,
    onRestoreHistory,
    onRestoreHandled,
    sidebarResizeRef,
    defaultSidebarWidth,
    minSidebarWidth,
    maxSidebarWidth
  } = useAppShellState();

  return (
    <RegistryContext.Provider value={{ commandGroups }}>
      <AppLayoutShell
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
        sidebarWidth={sidebarWidth}
        minSidebarWidth={minSidebarWidth}
        maxSidebarWidth={maxSidebarWidth}
        defaultSidebarWidth={defaultSidebarWidth}
        onSidebarResizerMouseDown={(event) => {
          sidebarResizeRef.current = { startX: event.clientX, startWidth: sidebarWidth };
        }}
        onSidebarResizerDoubleClick={() => setSidebarWidth(defaultSidebarWidth)}
        onSidebarResizerKeyDown={(event) => {
          const next = computeSidebarWidthFromKey({
            currentWidth: sidebarWidth,
            key: event.key,
            minWidth: minSidebarWidth,
            maxWidth: maxSidebarWidth,
            defaultWidth: defaultSidebarWidth
          });
          if (next !== null) {
            event.preventDefault();
            setSidebarWidth(next);
          }
        }}
        sidebar={
          <Sidebar
            tab={sidebarTab}
            onTabChange={setSidebarTab}
            tabs={visibleSidebarTabs}
            uiPreset={uiPreset}
            uiPresetRelease={uiPresetRelease}
            history={history}
            adminMode={adminMode}
            onSelectHistory={setSelectedRun}
            onRestoreHistory={onRestoreHistory}
          />
        }
        canvas={(
          <ReactFlowProvider>
            <Flow
              selectedRun={selectedRun}
              restoreRun={restoreRun}
              uiPreset={uiPreset}
              sidebarCollapsed={sidebarCollapsed}
              onSetSidebarCollapsed={setSidebarCollapsed}
              onRestoreHandled={onRestoreHandled}
            />
          </ReactFlowProvider>
        )}
      />
    </RegistryContext.Provider>
  );
}
