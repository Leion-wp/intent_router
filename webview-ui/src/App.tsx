import React, { createContext, useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  MiniMap,
  ReactFlowProvider,
  Edge,
  EdgeProps,
  Node,
  Connection,
  MarkerType,
  Position,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath
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
import { isInboundMessage, WebviewInboundMessage } from './types/messages';
import { applyThemeTokensToRoot, defaultThemeTokens, tokensFromPreset } from './types/theme';

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
  scriptNode: ScriptNode
};

const InsertableEdge = (props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="edge-insert-btn"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 5
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(data as any)?.label && (
            <div
              style={{
                position: 'absolute',
                bottom: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'var(--vscode-editorWidget-background)',
                border: '1px solid var(--vscode-editorWidget-border)',
                color: 'var(--vscode-foreground)',
                fontSize: '10px',
                padding: '2px 6px',
                borderRadius: '10px',
                whiteSpace: 'nowrap',
                opacity: 0.9
              }}
            >
              {(data as any).label}
            </div>
          )}
          <button
            className="nodrag"
            onClick={(e) => {
              e.stopPropagation();
              const onInsert = (data as any)?.onInsert;
              if (typeof onInsert === 'function') {
                onInsert(props, e.clientX, e.clientY);
              }
            }}
            title="Insert node"
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '10px',
              border: '1px solid var(--vscode-editorWidget-border)',
              background: 'var(--vscode-button-secondaryBackground)',
              color: 'var(--vscode-button-secondaryForeground)',
              cursor: 'pointer',
              fontSize: '12px',
              lineHeight: '18px',
              padding: 0
            }}
          >
            +
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

const edgeTypes = {
  insertable: InsertableEdge
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

function canonicalizeIntent(provider: string, capability: string): { provider: string; intent: string; capability: string } {
  const fallbackProvider = (provider || '').trim() || 'terminal';
  let cap = (capability || '').trim();

  if (!cap) {
    const intent = `${fallbackProvider}.run`;
    return { provider: fallbackProvider, intent, capability: intent };
  }

  // If the capability already looks like a full id (e.g. "system.pause"), infer provider from it.
  const inferredProvider = cap.includes('.') ? cap.split('.')[0] : fallbackProvider;
  const finalProvider = (inferredProvider || '').trim() || fallbackProvider;

  // If capability is a suffix (legacy), prefix it with provider.
  if (!cap.includes('.')) {
    cap = `${finalProvider}.${cap}`;
  }

  // Defensive: collapse repeated provider prefixes produced by older UI versions (e.g. "system.system.pause").
  const dupPrefix = `${finalProvider}.${finalProvider}.`;
  while (cap.startsWith(dupPrefix)) {
    cap = `${finalProvider}.` + cap.slice(dupPrefix.length);
  }

  return { provider: finalProvider, intent: cap, capability: cap };
}

function inferScriptInterpreter(scriptPath: string): string {
  const lower = String(scriptPath || '').trim().toLowerCase();
  if (lower.endsWith('.ps1')) return 'pwsh -File';
  if (lower.endsWith('.py')) return 'python';
  if (lower.endsWith('.js')) return 'node';
  if (lower.endsWith('.sh')) return 'bash';
  return '';
}

function quoteShell(value: string): string {
  const input = String(value || '');
  if (!input) return '""';
  if (!/[\s"]/g.test(input)) return input;
  return `"${input.replace(/"/g, '\\"')}"`;
}

function buildScriptCommand(scriptPath: string, args: string, interpreter?: string): string {
  const script = String(scriptPath || '').trim();
  const argsString = String(args || '').trim();
  const runtimeOverride = String(interpreter || '').trim();
  const runtime = runtimeOverride || inferScriptInterpreter(script);
  const lower = script.toLowerCase();

  if (!runtimeOverride && lower.endsWith('.ps1')) {
    const baseArg = `${quoteShell(script)}${argsString ? ` ${argsString}` : ''}`;
    return `if (Get-Command pwsh -ErrorAction SilentlyContinue) { pwsh -File ${baseArg} } else { powershell -File ${baseArg} }`;
  }

  const prefix = runtime ? `${runtime} ` : '';
  const base = `${prefix}${quoteShell(script)}`;
  return argsString ? `${base} ${argsString}` : base;
}

function Flow({ selectedRun, restoreRun, onRestoreHandled }: { selectedRun: any, restoreRun: any, onRestoreHandled: () => void }) {
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

  const [environment, setEnvironment] = useState<Record<string, string>>(
    (window.initialData?.environment as Record<string, string>) || {}
  );
  const pipelineUri = window.initialData?.pipelineUri as string | null | undefined;
  const lastAutosavedRef = useRef<string>('');

  const nodesRef = useRef<any[]>(nodes);
  const envRef = useRef<Record<string, string>>(environment);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  useEffect(() => {
    envRef.current = environment;
  }, [environment]);

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

  type QuickAddItem = {
    id: string;
    label: string;
    nodeType: 'promptNode' | 'repoNode' | 'actionNode' | 'vscodeCommandNode' | 'customNode' | 'formNode' | 'switchNode' | 'scriptNode';
    provider?: string;
    capability?: string;
    customNodeId?: string;
  };

  const getDefaultCapability = useCallback((providerName: string) => {
    const group = (commandGroups || []).find((g: any) => g.provider === providerName);
    const caps = group?.commands || [];
    if (!caps.length) return '';
    return caps.find((c: any) => String(c.capability || '').endsWith('.run'))?.capability || caps[0].capability || '';
  }, [commandGroups]);

  const presetItems: QuickAddItem[] = useMemo(() => ([
    { id: 'preset-prompt', label: 'Prompt', nodeType: 'promptNode' },
    { id: 'preset-form', label: 'Form', nodeType: 'formNode' },
    { id: 'preset-switch', label: 'Switch', nodeType: 'switchNode' },
    { id: 'preset-script', label: 'Script', nodeType: 'scriptNode' },
    { id: 'preset-repo', label: 'Repo', nodeType: 'repoNode' },
    { id: 'preset-terminal', label: 'Terminal', nodeType: 'actionNode', provider: 'terminal', capability: getDefaultCapability('terminal') },
    { id: 'preset-system', label: 'System', nodeType: 'actionNode', provider: 'system', capability: getDefaultCapability('system') },
    { id: 'preset-git', label: 'Git', nodeType: 'actionNode', provider: 'git', capability: getDefaultCapability('git') },
    { id: 'preset-docker', label: 'Docker', nodeType: 'actionNode', provider: 'docker', capability: getDefaultCapability('docker') },
    { id: 'preset-vscode', label: 'VS Code', nodeType: 'vscodeCommandNode' }
  ]), [getDefaultCapability]);

  const commandItems: QuickAddItem[] = useMemo(() => {
    const items: QuickAddItem[] = [];
    (commandGroups || []).forEach((g: any) => {
      (g.commands || []).forEach((c: any) => {
        const cap = String(c.capability || '');
        if (!cap) return;
        items.push({
          id: `cmd-${g.provider}-${cap}`,
          label: `${g.provider} · ${cap}`,
          nodeType: 'actionNode',
          provider: g.provider,
          capability: cap
        });
      });
    });
    return items;
  }, [commandGroups]);

  const filterQuickAdd = useCallback((items: QuickAddItem[], query: string) => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return items;
    return items.filter(i => i.label.toLowerCase().includes(q));
  }, []);

  const addNodeFromItem = useCallback((item: QuickAddItem, pos?: { x: number; y: number }, edge?: Edge | null) => {
    const newId = getId();
    const data: any = { status: 'idle' };
    let type: any = item.nodeType;

    if (item.nodeType === 'actionNode') {
      data.provider = item.provider || 'terminal';
      data.capability = item.capability || getDefaultCapability(item.provider || 'terminal');
      data.args = {};
    } else if (item.nodeType === 'customNode') {
      const cnid = String(item.customNodeId || '').trim();
      const def = cnid ? customNodesById.get(cnid) : undefined;
      data.customNodeId = cnid;
      data.title = def?.title || '';
      data.intent = def?.intent || '';
      data.schema = def?.schema || [];
      data.mapping = def?.mapping;
      data.args = {};
      data.kind = 'custom';
    } else if (item.nodeType === 'formNode') {
      data.fields = [];
      data.kind = 'form';
    } else if (item.nodeType === 'switchNode') {
      data.label = 'Switch';
      data.variableKey = '';
      data.routes = [];
      data.kind = 'switch';
    } else if (item.nodeType === 'scriptNode') {
      data.scriptPath = '';
      data.args = '';
      data.cwd = '';
      data.interpreter = '';
      data.kind = 'script';
    } else if (item.nodeType === 'promptNode') {
      data.name = '';
      data.value = '';
      data.kind = 'prompt';
    } else if (item.nodeType === 'repoNode') {
      data.path = '';
      data.kind = 'repo';
    } else if (item.nodeType === 'vscodeCommandNode') {
      data.commandId = '';
      data.argsJson = '';
    }

    let position = pos;
    if (!position) {
      if (lastCanvasPos) position = lastCanvasPos;
      else if (reactFlowInstance?.screenToFlowPosition) {
        position = reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      } else {
        position = { x: 300, y: 200 };
      }
    }

    if (edge && reactFlowInstance?.getNode) {
      const sourceNode = reactFlowInstance.getNode(edge.source);
      const targetNode = reactFlowInstance.getNode(edge.target);
      if (sourceNode && targetNode) {
        const sx = (sourceNode.positionAbsolute?.x ?? sourceNode.position.x) + (sourceNode.width || 0) / 2;
        const sy = (sourceNode.positionAbsolute?.y ?? sourceNode.position.y) + (sourceNode.height || 0) / 2;
        const tx = (targetNode.positionAbsolute?.x ?? targetNode.position.x) + (targetNode.width || 0) / 2;
        const ty = (targetNode.positionAbsolute?.y ?? targetNode.position.y) + (targetNode.height || 0) / 2;
        position = { x: (sx + tx) / 2, y: (sy + ty) / 2 };
      }
    }

    const newNode: any = {
      id: newId,
      type,
      data,
      position
    };

    setNodes((nds) => nds.concat(newNode));

    if (edge) {
      setEdges((eds) => {
        const remaining = eds.filter((e) => e.id !== edge.id);
        const e1: any = {
          id: `e-${edge.source}-${newId}-${Date.now()}`,
          source: edge.source,
          target: newId,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle,
          markerEnd: edge.markerEnd,
          style: edge.style,
          animated: edge.animated,
          type: 'insertable'
        };
        const e2: any = {
          id: `e-${newId}-${edge.target}-${Date.now() + 1}`,
          source: newId,
          target: edge.target,
          markerEnd: edge.markerEnd,
          style: edge.style,
          animated: edge.animated,
          type: 'insertable'
        };
        return remaining.concat([e1, e2]);
      });
    }
  }, [getDefaultCapability, lastCanvasPos, reactFlowInstance, customNodesById]);

  const customNodeItems: QuickAddItem[] = useMemo(() => {
    return (customNodes || []).map((n: any) => {
      const id = String(n?.id || '').trim();
      const title = String(n?.title || id || 'Custom').trim();
      return {
        id: `custom-${id}`,
        label: `Custom · ${title}`,
        nodeType: 'customNode',
        customNodeId: id
      };
    }).filter((i: any) => !!i.customNodeId);
  }, [customNodes]);

  const allQuickAddItems = useMemo(() => [...presetItems, ...customNodeItems, ...commandItems], [presetItems, customNodeItems, commandItems]);
  const filteredQuickAddItems = useMemo(
    () => filterQuickAdd(allQuickAddItems, quickAddQuery),
    [allQuickAddItems, quickAddQuery, filterQuickAdd]
  );
  const filteredDockItems = useMemo(
    () => filterQuickAdd(allQuickAddItems, dockQuery),
    [allQuickAddItems, dockQuery, filterQuickAdd]
  );

  const paletteLeft = quickAddAnchor ? Math.min(quickAddAnchor.x, window.innerWidth - 280) : 0;
  const paletteTop = quickAddAnchor ? Math.min(quickAddAnchor.y, window.innerHeight - 320) : 0;

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName?.toLowerCase();
        const isEditable =
          tag === 'input' ||
          tag === 'textarea' ||
          (target as any).isContentEditable === true;
        if (isEditable) return;
      }
      if (e.key === 'Escape') {
        if (quickAddOpen) setQuickAddOpen(false);
        if (dockOpen) setDockOpen(false);
      }
      if (e.key.toLowerCase() === 'f') {
        reactFlowInstance?.fitView?.({ duration: 200, padding: 0.2 });
      }
      if (e.key.toLowerCase() === 'z' && selectedNodeId && reactFlowInstance?.getNode) {
        const node = reactFlowInstance.getNode(selectedNodeId);
        if (node) {
          const zoom = reactFlowInstance.getZoom?.() || 1;
          const pos = node.positionAbsolute || node.position;
          const cx = pos.x + (node.width || 0) / 2;
          const cy = pos.y + (node.height || 0) / 2;
          reactFlowInstance.setCenter?.(cx, cy, { zoom, duration: 200 });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [quickAddOpen, dockOpen, reactFlowInstance, selectedNodeId]);

  useEffect(() => {
    const onDocClick = () => setContextMenu(null);
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const computeRunSubset = useCallback(
    (startNodeId: string) => {
      const successEdges = edges.filter((e: any) => e.sourceHandle !== 'failure');
      const failureEdges = edges.filter((e: any) => e.sourceHandle === 'failure');

      const successAdj = new Map<string, string[]>();
      const allAdj = new Map<string, string[]>();
      const reverseSuccessAdj = new Map<string, string[]>();

      for (const n of nodes) {
        successAdj.set(n.id, []);
        allAdj.set(n.id, []);
        reverseSuccessAdj.set(n.id, []);
      }

      for (const e of successEdges) {
        if (successAdj.has(e.source) && successAdj.has(e.target)) {
          successAdj.get(e.source)!.push(e.target);
          allAdj.get(e.source)!.push(e.target);
          reverseSuccessAdj.get(e.target)!.push(e.source);
        }
      }

      for (const e of failureEdges) {
        if (allAdj.has(e.source) && allAdj.has(e.target)) {
          allAdj.get(e.source)!.push(e.target);
        }
      }

      // 1) Success closure (preview set)
      const preview = new Set<string>();
      const q1: string[] = [startNodeId];
      while (q1.length) {
        const u = q1.shift()!;
        if (preview.has(u)) continue;
        preview.add(u);
        for (const v of successAdj.get(u) || []) {
          q1.push(v);
        }
      }

      // 2) Failure closure (allowed but not previewed)
      const failureAllowed = new Set<string>();
      const q2: string[] = Array.from(preview);
      while (q2.length) {
        const u = q2.shift()!;
        for (const e of failureEdges.filter((x: any) => x.source === u)) {
          const v = e.target;
          if (!failureAllowed.has(v)) {
            failureAllowed.add(v);
            q2.push(v);
          }
        }
      }

      // 3) Context closure: upstream success ancestors, but only keep Prompt/Repo nodes as prerequisites
      const upstream = new Set<string>();
      const q3: string[] = [startNodeId];
      while (q3.length) {
        const u = q3.shift()!;
        for (const v of reverseSuccessAdj.get(u) || []) {
          if (!upstream.has(v)) {
            upstream.add(v);
            q3.push(v);
          }
        }
      }

      const nodeById = new Map(nodes.map((n: any) => [n.id, n]));
      const context = new Set<string>();
      for (const id of upstream) {
        const n = nodeById.get(id);
        if (!n) continue;
        if (n.type === 'promptNode' || n.type === 'repoNode') {
          context.add(id);
        }
      }

      const allowed = new Set<string>([...preview, ...failureAllowed, ...context]);
      return { allowed, preview };
    },
    [edges, nodes, customNodesById]
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

      // 1. Build Graph Adjacency List
      const nodeMap = new Map(effectiveNodes.map(n => [n.id, n]));
      const adj = new Map<string, string[]>();
      const inDegree = new Map<string, number>();
      const failureMap = new Map<string, string>(); // Source -> Target
      const successEdgePref = new Map<string, string>(); // Source -> Target

      effectiveNodes.forEach(n => {
        adj.set(n.id, []);
        inDegree.set(n.id, 0);
      });

      effectiveEdges.forEach(e => {
        if (adj.has(e.source) && adj.has(e.target)) {
          adj.get(e.source)?.push(e.target);
          inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        }

        if (e.sourceHandle === 'failure') {
          failureMap.set(e.source, e.target);
        } else {
          successEdgePref.set(e.source, e.target);
        }
      });

      // 2. Check for Disconnected Nodes (Hard Error)
      if (effectiveNodes.length > 1) {
        const hasStart = effectiveNodes.some((n: any) => n?.id === 'start');
        const hasExecutable = effectiveNodes.some((n: any) => n?.type !== 'startNode' && n?.type !== 'input');
        if (hasStart && hasExecutable && (adj.get('start')?.length || 0) === 0) {
          const msg = 'Start node must be connected.';
          if (vscode) vscode.postMessage({ type: 'error', message: msg });
          else alert(msg);
          return null;
        }

        const isolated = effectiveNodes.find(
          n => n.type !== 'startNode' && n.type !== 'input' && (inDegree.get(n.id) === 0) && (adj.get(n.id)?.length === 0)
        );
        if (isolated) {
          const msg = `Node '${(isolated as any).data?.label || isolated.type}' is not connected.`;
          if (vscode) vscode.postMessage({ type: 'error', message: msg });
          else alert(msg);
          return null;
        }
      }

      // 3. Topological Sort (Kahn's Algorithm with Success Priority)
      const queue: string[] = [];
      inDegree.forEach((degree, id) => {
        if (degree === 0) queue.push(id);
      });

      const sortedIds: string[] = [];
      let lastProcessedId: string | null = null;

      while (queue.length > 0) {
        let u: string;
        let index = 0;

        // Try to pick the "success" successor of the last processed node
        if (lastProcessedId && successEdgePref.has(lastProcessedId)) {
          const preferredNext = successEdgePref.get(lastProcessedId)!;
          const preferredIndex = queue.indexOf(preferredNext);
          if (preferredIndex !== -1) {
            index = preferredIndex;
          }
        }

        u = queue.splice(index, 1)[0];
        sortedIds.push(u);
        lastProcessedId = u;

        const neighbors = adj.get(u) || [];
        neighbors.forEach(v => {
          inDegree.set(v, (inDegree.get(v)! - 1));
          if (inDegree.get(v) === 0) {
            queue.push(v);
          }
        });
      }

      // 4. Cycle Detection
      if (sortedIds.length !== effectiveNodes.length) {
        const msg = 'Cycle detected in pipeline graph.';
        if (vscode) vscode.postMessage({ type: 'error', message: msg });
        else alert(msg);
        return null;
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
        } else if (node.type === 'vscodeCommandNode') {
          intent = 'vscode.runCommand';
          payload = { commandId: data.commandId, argsJson: data.argsJson };
        } else if (node.type === 'actionNode') {
          const normalized = canonicalizeIntent(String(data.provider || ''), String(data.capability || ''));
          intent = normalized.intent;
          const { description: desc, ...rest } = data.args || {};
          description = desc;
          payload = rest;
        } else if (node.type === 'customNode') {
          const cnid = String(data.customNodeId || '').trim();
          const def = cnid ? customNodesById.get(cnid) : undefined;
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
        if (vscode) vscode.postMessage({ type: 'error', message: stepBuildError });
        else alert(stepBuildError);
        return null;
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
          ui: {
            // Avoid persisting runtime-only UI state (status/logs/edge coloring) into the pipeline file.
            nodes: nodes.map((n: any) => {
              const { status, logs, intentId, ...rest } = (n.data || {}) as any;
              return {
                ...n,
                data: { ...rest, status: 'idle' }
              };
            }),
            edges: edges.map((e: any) => {
              const { style, animated, ...rest } = e;
              if (rest.markerEnd && typeof rest.markerEnd === 'object') {
                const markerEnd = { ...(rest.markerEnd as any) };
                delete markerEnd.color;
                return { ...rest, markerEnd };
              }
              return rest;
            })
          }
        }
      };

      return pipeline;
    },
    [edges, nodes]
  );

  // Helper to load pipeline data into graph
  const loadPipeline = (pipeline: any) => {
      console.log('Loading pipeline:', pipeline);

      // 1. Snapshot Restoration (Priority)
      if (pipeline.meta?.ui?.nodes && pipeline.meta?.ui?.edges) {
          console.log('Restoring from snapshot');
          // Validate nodes/edges simply? Or just trust them?
          // We might want to ensure they are arrays
          if (Array.isArray(pipeline.meta.ui.nodes) && Array.isArray(pipeline.meta.ui.edges)) {
              const restoredNodes = pipeline.meta.ui.nodes.map((n: any) => {
                  if (n?.id === 'start') {
                      const next = { ...n, type: 'startNode' };
                      next.data = { ...(next.data || {}) };
                      if (pipeline?.name) next.data.label = pipeline.name;
                      if (pipeline?.description !== undefined) next.data.description = pipeline.description;
                      return next;
                  }
                  if (n?.type === 'input') {
                      return { ...n, type: 'startNode' };
                  }
                  return n;
              });
              syncIdCounterFromNodes(restoredNodes);
              setNodes(restoredNodes);
              setEdges(pipeline.meta.ui.edges);
              setTimeout(() => reactFlowInstance?.fitView(), 100);
              return;
          }
      }

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Start Node
      newNodes.push({
         id: 'start',
         type: 'startNode',
         data: { label: pipeline.name || 'My Pipeline', description: pipeline.description || '' },
         position: { x: 250, y: 50 },
         sourcePosition: Position.Right,
         deletable: false
      });

      const baseX = 450;
      const baseY = 50;
      const xSpacing = 320;
      const stepIdToNodeId = new Map<string, string>();
      const nodeIds: string[] = ['start'];

      if (Array.isArray(pipeline.steps)) {
          // 1. Create Nodes
          pipeline.steps.forEach((step: any, index: number) => {
              const nodeId = step.id || getId();
              const intent = step.intent || '';

             // Store ID mapping
             if (step.id) {
                 stepIdToNodeId.set(step.id, nodeId);
             }
             // Implicit mapping by order for non-ID usage

             let type = 'actionNode';
             let data: any = { status: 'idle' };

             // Infer type from intent
              if (intent === 'system.setVar') {
                  type = 'promptNode';
                  data.name = step.payload?.name;
                  data.value = step.payload?.value;
                  data.kind = 'prompt';
              } else if (intent === 'system.switch') {
                  type = 'switchNode';
                  data.label = String(step.description || 'Switch');
                  data.variableKey = step.payload?.variableKey || '';
                  data.routes = Array.isArray(step.payload?.routes) ? step.payload.routes.map((r: any) => ({
                      label: String(r?.label || ''),
                      condition: String(r?.condition || 'equals'),
                      value: String(r?.value ?? r?.equalsValue ?? '')
                  })) : [];
                  data.kind = 'switch';
              } else if (intent === 'system.form') {
                  type = 'formNode';
                  data.fields = Array.isArray(step.payload?.fields) ? step.payload.fields : [];
                  data.kind = 'form';
              } else if (intent === 'terminal.run' && String(step.payload?.__kind || '') === 'script') {
                  type = 'scriptNode';
                  data.scriptPath = String(step.payload?.scriptPath || '');
                  data.args = Array.isArray(step.payload?.args)
                    ? (step.payload.args as any[]).map((arg: any) => String(arg)).join(' ')
                    : String(step.payload?.args || '');
                  data.cwd = String(step.payload?.cwd || '');
                  data.interpreter = String(step.payload?.interpreter || '');
                  data.description = String(step.description || '');
                  data.kind = 'script';
              } else if (intent === 'system.setCwd') {
                  type = 'repoNode';
                  data.path = step.payload?.path;
                  data.kind = 'repo';
              } else if (intent === 'vscode.runCommand') {
                  type = 'vscodeCommandNode';
                  data.commandId = step.payload?.commandId;
                  data.argsJson = typeof step.payload?.argsJson === 'string' ? step.payload.argsJson : '';
                  data.kind = 'vscodeCommand';
              } else {
                  type = 'actionNode';
                  const normalized = canonicalizeIntent('', intent);
                  data.provider = normalized.provider;
                  data.capability = normalized.capability;
                 data.args = { ...step.payload, description: step.description };
                 data.kind = 'action';
             }

              newNodes.push({
                  id: nodeId,
                  type,
                  position: { x: baseX + index * xSpacing, y: baseY },
                  data
              });
              nodeIds.push(nodeId);
          });

          // 2. Create Edges
          // Connect Start -> First Step
          if (pipeline.steps.length > 0) {
              const firstStepNodeId = nodeIds[1];
              newEdges.push({
                  id: `e-start-${firstStepNodeId}`,
                  source: 'start',
                  target: firstStepNodeId,
                  markerEnd: { type: MarkerType.ArrowClosed }
              });
          }

          // Connect sequential steps (Success Path) and Failures
          pipeline.steps.forEach((step: any, index: number) => {
             const currentNodeId = nodeIds[index + 1]; // +1 because index 0 is Start

             // Success Edge (to next step)
             // We assume linear succession unless specified otherwise?
             // "Si Success: next step séquentiel". So we MUST connect to next step in array.
             if (step.intent === 'system.switch') {
                 const routes = Array.isArray(step.payload?.routes) ? step.payload.routes : [];
                 routes.forEach((r: any, i: number) => {
                     const target = String(r?.targetStepId || '').trim();
                     if (!target) return;
                     const targetNodeId = stepIdToNodeId.get(target) || target;
                     newEdges.push({
                         id: `e-${currentNodeId}-route_${i}-${targetNodeId}`,
                         source: currentNodeId,
                         target: targetNodeId,
                         sourceHandle: `route_${i}`,
                         markerEnd: { type: MarkerType.ArrowClosed },
                         data: { label: String(r?.label || `route_${i}`) }
                     } as any);
                 });

                 const defTarget = String(step.payload?.defaultStepId || '').trim();
                 if (defTarget) {
                     const targetNodeId = stepIdToNodeId.get(defTarget) || defTarget;
                     newEdges.push({
                         id: `e-${currentNodeId}-default-${targetNodeId}`,
                         source: currentNodeId,
                         target: targetNodeId,
                         sourceHandle: 'default',
                         markerEnd: { type: MarkerType.ArrowClosed },
                         data: { label: 'default' }
                     } as any);
                 }
             } else if (index < pipeline.steps.length - 1) {
                 const nextNodeId = nodeIds[index + 2];
                 newEdges.push({
                     id: `e-${currentNodeId}-${nextNodeId}`,
                     source: currentNodeId,
                     target: nextNodeId,
                     markerEnd: { type: MarkerType.ArrowClosed }
                 });
             }

             // Failure Edge
             if (step.onFailure) {
                 const targetNodeId = stepIdToNodeId.get(step.onFailure);
                 if (targetNodeId) {
                    const failureColor = getComputedStyle(document.documentElement).getPropertyValue('--ir-edge-error').trim() || '#f44336';
                     newEdges.push({
                         id: `e-${currentNodeId}-${targetNodeId}-fail`,
                         source: currentNodeId,
                         target: targetNodeId,
                         sourceHandle: 'failure',
                         markerEnd: { type: MarkerType.ArrowClosed },
                         style: { stroke: failureColor },
                         animated: true
                     });
                 }
             }
          });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      syncIdCounterFromNodes(newNodes);
      setTimeout(() => reactFlowInstance?.fitView(), 100);
  };

  // Load initial data if any (prefer persisted webview state to avoid losing unsaved nodes)
  useEffect(() => {
    try {
      const st = vscode?.getState?.() || {};
      if (st.graph?.nodes && st.graph?.edges) {
        setNodes(st.graph.nodes);
        setEdges(st.graph.edges);
        syncIdCounterFromNodes(st.graph.nodes);
        setTimeout(() => reactFlowInstance?.fitView(), 100);
        return;
      }
    } catch {
      // ignore
    }

    if (window.initialData && window.initialData.pipeline) {
      loadPipeline(window.initialData.pipeline);
    }

    // Listen for messages from extension
	    const handleMessage = (event: MessageEvent) => {
	       const message = event.data as unknown;
	       if (!isInboundMessage(message)) {
	         return;
	       }
	       const typed = message as WebviewInboundMessage;
	       switch (typed.type) {
         case 'environmentUpdate':
           setEnvironment((typed.environment as Record<string, string>) || {});
           break;

           case 'customNodesUpdate':
             setCustomNodes((typed as any).nodes || []);
             break;

           case 'loadPipeline':
             try {
               loadPipeline((typed as any).pipeline);
             } catch (e) {
               console.warn('[IntentRouter] loadPipeline failed', e);
             }
             break;

         case 'executionStatus':
           setNodes((nds) => {
		             if (typed.stepId) {
		               return nds.map((node) => (
		                 node.id === typed.stepId
		                   ? {
		                       ...node,
		                       data: {
		                         ...node.data,
		                         status: typed.status,
		                         intentId: typed.intentId,
		                         logs: typed.status === 'running' ? [] : (node.data as any).logs
		                       }
		                     }
		                   : node
		               ));
		             }

		             // Fallback: map by linear index (older engine events)
		             if (typed.index !== undefined) {
		               const actionNodes = nds.filter(n => n.id !== 'start');
		               const targetNode = actionNodes[typed.index];
		               if (!targetNode) return nds;
		               return nds.map((node) => (
		                 node.id === targetNode.id
		                   ? {
		                       ...node,
		                       data: {
		                         ...node.data,
		                         status: typed.status,
		                         intentId: typed.intentId,
		                         logs: typed.status === 'running' ? [] : (node.data as any).logs
		                       }
		                     }
		                   : node
		               ));
		             }

	             return nds;
	           });
	           break;

	         case 'stepLog':
	           setNodes((nds) => nds.map((node) => {
	             const matchesNode = typed.stepId ? node.id === typed.stepId : node.data.intentId === typed.intentId;
	             if (!matchesNode) return node;

	             const currentLogs = (node.data.logs as Array<any>) || [];

	             // `stepLog.text` can arrive in chunks containing multiple lines.
	             // We split so the UI counter and trimming are based on actual lines.
	             const rawText = typeof typed.text === 'string' ? typed.text : String(typed.text ?? '');
	             const incomingLines = rawText.split(/\r?\n/).filter((l: string) => l.length > 0);
	             const nextLogs = [
	               ...currentLogs,
	               ...incomingLines.map((line: string) => ({ text: line, stream: typed.stream }))
	             ];
	             const trimmed = nextLogs.length > MAX_LOG_LINES ? nextLogs.slice(-MAX_LOG_LINES) : nextLogs;
	             return {
	               ...node,
	               data: {
	                 ...node.data,
	                 logs: trimmed
	               }
	             };
	           }));
	           break;
	       }
	    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [reactFlowInstance, drawerNodeId]); // Dependency on reactFlowInstance for fitView

  // Persist current graph in webview state to survive reloads.
  useEffect(() => {
    try {
      const prev = vscode?.getState?.() || {};
      const safeNodes = nodes.map((n: any) => {
        const { status, logs, intentId, ...rest } = (n.data || {}) as any;
        return { ...n, data: { ...rest, status: 'idle' } };
      });
      const safeEdges = edges.map((e: any) => {
        const { style, animated, ...rest } = e as any;
        return rest;
      });
      vscode?.setState?.({ ...prev, graph: { nodes: safeNodes, edges: safeEdges } });
    } catch {
      // ignore
    }
  }, [nodes, edges]);

	  // Handle Explicit Restore (Rollback)
	  useEffect(() => {
	      if (restoreRun && restoreRun.pipelineSnapshot) {
	          console.log('Restoring run:', restoreRun.name);
	          loadPipeline(restoreRun.pipelineSnapshot);
          onRestoreHandled(); // Reset state to allow restoring the same run again
      }
  }, [restoreRun]);

	  // Separate Effect for Playback (triggered when nodes are ready/stable?)
	  useEffect(() => {
	      const timeouts: any[] = [];
	      if (selectedRun) {
	          // 1. Reset all nodes to idle (in case we re-used existing)
	          setNodes((nds) => nds.map(n => ({ ...n, data: { ...n.data, status: 'idle' } })));

	          // 2. Playback steps (prefer stepId, fallback to linear index)
	          selectedRun.steps.forEach((step: any, i: number) => {
	            const t = setTimeout(() => {
	              setNodes((nds) => {
	                const targetNodeId = step.stepId
	                  ? String(step.stepId)
	                  : (typeof step.index === 'number' ? nds.filter(n => n.id !== 'start')[step.index]?.id : undefined);
	                if (!targetNodeId) return nds;

	                return nds.map(n => (
	                  n.id === targetNodeId ? { ...n, data: { ...n.data, status: step.status } } : n
	                ));
	              });
	            }, (i + 1) * 600);
	            timeouts.push(t);
	          });
	      }
	      return () => timeouts.forEach(clearTimeout);
	  }, [selectedRun]);

  // Reactive Connectors (Update Edge Colors based on Source Status)
  useEffect(() => {
    const readColor = (name: string, fallback: string) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    };
    const edgeIdle = readColor('--ir-edge-idle', 'var(--vscode-editor-foreground)');
    const edgeRunning = readColor('--ir-edge-running', '#007acc');
    const edgeSuccess = readColor('--ir-edge-success', '#4caf50');
    const edgeFailure = readColor('--ir-edge-error', '#f44336');

    setEdges((eds) =>
      eds.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) return edge;

        const status = (sourceNode.data?.status as string) || 'idle';
        let stroke = edgeIdle;
        if (status === 'running') stroke = edgeRunning;
        else if (status === 'success') stroke = edgeSuccess;
        else if (status === 'failure') stroke = edgeFailure;

        // Update if changed
        if (edge.style?.stroke !== stroke) {
          return {
            ...edge,
            style: { ...edge.style, stroke, strokeWidth: 2 },
            animated: status === 'running',
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke }
          };
        }
        return edge;
      })
    );
  }, [nodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      // Prevent self-loops
      if (params.source === params.target) return;
      setEdges((eds) => {
        let label: string | undefined = undefined;
        try {
          const sourceNode = nodes.find((n: any) => n.id === params.source);
          if (sourceNode?.type === 'switchNode' && params.sourceHandle) {
            const handle = String(params.sourceHandle);
            if (handle === 'default') {
              label = 'default';
            } else if (handle.startsWith('route_')) {
              const idx = Number(handle.slice('route_'.length));
              const routes = Array.isArray((sourceNode.data as any)?.routes) ? (sourceNode.data as any).routes : [];
              const routeLabel = routes?.[idx]?.label;
              label = String(routeLabel || handle);
            }
          }
        } catch {
          // best-effort
        }

        const edge: any = {
          ...params,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: label ? { label } : undefined
        };
        return addEdge(edge, eds);
      });
    },
    [setEdges, nodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow/type');
      const provider = event.dataTransfer.getData('application/reactflow/provider');
      const customNodeId = event.dataTransfer.getData('application/reactflow/customNodeId');

      if (typeof type === 'undefined' || !type) {
        return;
      }

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data:
          type === 'actionNode'
            ? { provider: provider, capability: '', args: {}, status: 'idle', kind: 'action' }
            : type === 'customNode'
              ? (() => {
                  const cnid = String(customNodeId || '').trim();
                  const def = cnid ? customNodesById.get(cnid) : undefined;
                  return {
                    customNodeId: cnid,
                    title: def?.title || '',
                    intent: def?.intent || '',
                    schema: def?.schema || [],
                    mapping: def?.mapping,
                    args: {},
                    status: 'idle',
                    kind: 'custom'
                  };
                })()
            : type === 'formNode'
              ? { fields: [], status: 'idle', kind: 'form' }
            : type === 'switchNode'
              ? { label: 'Switch', variableKey: '', routes: [], status: 'idle', kind: 'switch' }
            : type === 'scriptNode'
              ? { scriptPath: '', args: '', cwd: '', interpreter: '', status: 'idle', kind: 'script' }
            : type === 'promptNode'
              ? { name: '', value: '', kind: 'prompt' }
            : type === 'repoNode'
                ? { path: '${workspaceRoot}', kind: 'repo' }
                : type === 'vscodeCommandNode'
                  ? { commandId: '', argsJson: '', kind: 'vscodeCommand' }
                  : { status: 'idle' },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance, customNodesById],
  );

  const savePipeline = () => {
    const pipeline = buildPipeline();
    if (!pipeline) return;

    if (vscode) {
      vscode.postMessage({
        type: 'savePipeline',
        pipeline
      });
    } else {
      console.log('Saved Pipeline (Mock):', pipeline);
    }
  };

  // Auto-save (silent) to the existing pipeline file so the JSON remains the source of truth.
  // Only active when this builder was opened on an existing URI (prevents creating files on first edit).
  useEffect(() => {
    if (!pipelineUri || !vscode) {
      return;
    }

    const pipeline = buildPipeline();
    if (!pipeline) {
      return;
    }

    const serialized = JSON.stringify(pipeline);
    if (serialized === lastAutosavedRef.current) {
      return;
    }

    const t = setTimeout(() => {
      // Recompute at send-time to avoid writing half-typed transient states.
      const p = buildPipeline();
      if (!p) return;
      const s = JSON.stringify(p);
      if (s === lastAutosavedRef.current) return;
      lastAutosavedRef.current = s;

      vscode.postMessage({
        type: 'savePipeline',
        pipeline: p,
        silent: true
      });
    }, 450);

    return () => clearTimeout(t);
  }, [nodes, edges, pipelineUri]);

  const runPipeline = () => {
    const pipeline = buildPipeline();
    if (!pipeline) return;

    if (vscode) {
      vscode.postMessage({
        type: 'runPipeline',
        pipeline
      });
    } else {
      console.log('Run Pipeline (Mock):', pipeline);
    }
  };

  const runPipelineFromHere = (nodeId: string) => {
    const { allowed, preview } = computeRunSubset(nodeId);
    setRunPreviewIds(preview);
    const pipeline = buildPipeline({ allowedNodeIds: allowed });
    if (!pipeline) return;

    if (vscode) {
      vscode.postMessage({
        type: 'runPipeline',
        pipeline
      });
    } else {
      console.log('Run Pipeline From Here (Mock):', pipeline);
    }
  };

  const autoLayout = useCallback(() => {
    const ids = nodes.map((n) => n.id);
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    ids.forEach((id) => {
      adj.set(id, []);
      inDegree.set(id, 0);
    });
    edges.forEach((e) => {
      if (!adj.has(e.source) || !adj.has(e.target)) return;
      adj.get(e.source)!.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
    });
    const queue: string[] = [];
    inDegree.forEach((deg, id) => {
      if (deg === 0) queue.push(id);
    });
    const order: string[] = [];
    while (queue.length) {
      const u = queue.shift()!;
      order.push(u);
      (adj.get(u) || []).forEach((v) => {
        inDegree.set(v, (inDegree.get(v)! - 1));
        if (inDegree.get(v) === 0) queue.push(v);
      });
    }
    const sorted = order.length === ids.length ? order : ids;
    const baseX = 250;
    const baseY = 50;
    const xSpacing = 320;
    setNodes((nds) =>
      nds.map((n) => {
        const index = sorted.indexOf(n.id);
        if (index === -1) return n;
        const y = n.id === 'start' ? baseY : (n.position?.y ?? baseY);
        return { ...n, position: { x: baseX + index * xSpacing, y } };
      })
    );
    setTimeout(() => reactFlowInstance?.fitView(), 50);
  }, [nodes, edges, reactFlowInstance]);

  const drawerNode = useMemo(() => nodes.find((n: any) => n.id === drawerNodeId) ?? null, [nodes, drawerNodeId]);

  // When opening the drawer, the drawer overlays the right side of the canvas.
  // Auto-pan so the selected node stays visible and doesn't look like it "disappeared".
  useEffect(() => {
    if (!drawerNodeId || !reactFlowInstance) return;
    const api: any = reactFlowInstance;
    const getNode = api.getNode?.bind(api);
    const node = getNode ? getNode(drawerNodeId) : nodes.find((n: any) => n.id === drawerNodeId);
    if (!node) return;

    const zoom = typeof api.getZoom === 'function' ? api.getZoom() : 1;
    const pos = (node.positionAbsolute || node.position || { x: 0, y: 0 }) as any;
    const w = Number(node.measured?.width ?? node.width ?? 0);
    const h = Number(node.measured?.height ?? node.height ?? 0);
    const cx = pos.x + (w ? w / 2 : 0);
    const cy = pos.y + (h ? h / 2 : 0);

    // Drawer is 360px wide; shift center left by ~half the drawer so the node sits in view.
    const drawerWidthPx = 360;
    const marginPx = 24;
    const offsetX = (drawerWidthPx / 2 + marginPx) / (zoom || 1);

    if (typeof api.setCenter === 'function') {
      api.setCenter(cx - offsetX, cy, { zoom, duration: 200 });
    } else if (typeof api.fitView === 'function') {
      api.fitView({ nodes: [{ id: drawerNodeId }], padding: 0.2, duration: 200 });
    }
  }, [drawerNodeId, reactFlowInstance, nodes]);

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
                onPaneClick={(event: any) => {
                  if (quickAddOpen) setQuickAddOpen(false);
                  if (reactFlowInstance?.screenToFlowPosition) {
                    const pos = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                    setLastCanvasPos(pos);
                  }
                  if (event?.detail === 2 && reactFlowInstance?.screenToFlowPosition) {
                    const pos = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
                    setQuickAddPos(pos);
                    setQuickAddAnchor({ x: event.clientX, y: event.clientY });
                    setQuickAddEdge(null);
                    setQuickAddQuery('');
                    setQuickAddOpen(true);
                  }
                }}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                snapToGrid={true}
                fitView
              onNodeContextMenu={(event, node) => {
                event.preventDefault();
                setContextMenu({ x: event.clientX, y: event.clientY, nodeId: node.id });
              }}
              >
                <Controls />
                <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
                <MiniMap />
              </ReactFlow>
              </CustomNodesContext.Provider>
              </FlowEditorContext.Provider>
  	        </FlowRuntimeContext.Provider>
  	      </div>

        {contextMenu && (
          <div
            className="nodrag"
            style={{
              position: 'fixed',
              left: contextMenu.x,
              top: contextMenu.y,
              zIndex: 1000,
              background: 'var(--vscode-editorWidget-background)',
              border: '1px solid var(--vscode-editorWidget-border)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              padding: '6px',
              borderRadius: '6px',
              minWidth: '160px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="nodrag"
              onClick={() => {
                suppressRemoveUntilRef.current = Date.now() + 800;
                lastOpenNodeIdRef.current = contextMenu.nodeId;
                lastOpenNodeAtRef.current = Date.now();
                setDrawerNodeId(contextMenu.nodeId);
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                border: 'none',
                padding: '8px',
                cursor: 'pointer'
              }}
            >
              Open node
            </button>
            <button
              className="nodrag"
              onClick={() => {
                const id = contextMenu.nodeId;
                if (id === 'start') {
                  setContextMenu(null);
                  return;
                }
                setNodes((nds) => nds.filter((n: any) => n.id !== id));
                setEdges((eds) => eds.filter((e: any) => e.source !== id && e.target !== id));
                setDrawerNodeId((v) => (v === id ? null : v));
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                color: 'var(--vscode-errorForeground)',
                border: 'none',
                padding: '8px',
                cursor: 'pointer'
              }}
            >
              Delete node
            </button>
            <button
              className="nodrag"
              onClick={() => {
                runPipelineFromHere(contextMenu.nodeId);
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                border: 'none',
                padding: '8px',
                cursor: 'pointer'
              }}
            >
              Run from here
            </button>
            <button
              className="nodrag"
              onClick={() => {
                setRunPreviewIds(null);
                setContextMenu(null);
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                background: 'transparent',
                color: 'var(--vscode-foreground)',
                border: 'none',
                padding: '8px',
                cursor: 'pointer',
                opacity: 0.8
              }}
            >
              Clear highlight
            </button>
          </div>
        )}

        {quickAddOpen && quickAddAnchor && (
          <div
            className="nodrag quick-add-palette"
            style={{
              position: 'fixed',
              left: paletteLeft,
              top: paletteTop,
              zIndex: 1200,
              width: '260px',
              background: 'var(--vscode-editorWidget-background)',
              border: '1px solid var(--vscode-editorWidget-border)',
              boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              borderRadius: '8px',
              padding: '8px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              className="nodrag"
              autoFocus
              placeholder="Search nodes…"
              value={quickAddQuery}
              onChange={(e) => setQuickAddQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredQuickAddItems.length > 0) {
                  addNodeFromItem(filteredQuickAddItems[0], quickAddPos || undefined, quickAddEdge);
                  setQuickAddOpen(false);
                  setQuickAddEdge(null);
                }
                if (e.key === 'Escape') {
                  setQuickAddOpen(false);
                }
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                borderRadius: '6px',
                border: '1px solid var(--vscode-input-border)',
                background: 'var(--vscode-input-background)',
                color: 'var(--vscode-input-foreground)'
              }}
            />
            <div style={{ maxHeight: '220px', overflow: 'auto' }}>
              {filteredQuickAddItems.length === 0 && (
                <div style={{ fontSize: '12px', opacity: 0.7, padding: '6px' }}>No results</div>
              )}
              {filteredQuickAddItems.map((item) => (
                <div
                  key={item.id}
                  className="quick-add-item"
                  style={{
                    padding: '6px 8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                  onClick={() => {
                    addNodeFromItem(item, quickAddPos || undefined, quickAddEdge);
                    setQuickAddOpen(false);
                    setQuickAddEdge(null);
                  }}
                >
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {drawerNode && (
          <div
            className="nodrag"
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              height: '100%',
              width: '360px',
              background: 'var(--vscode-sideBar-background)',
              borderLeft: '1px solid var(--vscode-sideBar-border)',
              zIndex: 900,
              display: 'flex',
              flexDirection: 'column',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                padding: '10px',
                borderBottom: '1px solid var(--vscode-sideBar-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
              }}
            >
              <div style={{ fontWeight: 700, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {drawerNode.id === 'start'
                  ? 'Start'
                  : drawerNode.type === 'actionNode'
                    ? `${drawerNode.data?.provider || 'action'} · ${drawerNode.data?.capability || ''}`
                    : drawerNode.type}
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  className="nodrag"
                  onClick={async () => {
                    const inspector = {
                      id: drawerNode.id,
                      type: drawerNode.type,
                      position: (drawerNode as any).position,
                      data: drawerNode.data,
                    };
                    const inspectorJson = JSON.stringify(inspector, null, 2);
                    try {
                      await navigator.clipboard.writeText(inspectorJson);
                    } catch (e) {
                      console.warn('Failed to copy to clipboard', e);
                    }
                  }}
                  title="Copy node JSON"
                  style={{
                    background: 'var(--vscode-button-secondaryBackground)',
                    color: 'var(--vscode-button-secondaryForeground)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Copy JSON
                </button>
                <button
                  className="nodrag"
                  onClick={() => setDrawerNodeId(null)}
                  title="Close"
                  style={{
                    background: 'transparent',
                    color: 'var(--vscode-foreground)',
                    border: '1px solid var(--vscode-sideBar-border)',
                    borderRadius: '4px',
                    padding: '6px 8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                  }}
                >
                  Close
                </button>
              </div>
            </div>

            <div style={{ padding: '10px', overflow: 'auto' }}>
              {(() => {
                const inspector = {
                  id: drawerNode.id,
                  type: drawerNode.type,
                  position: (drawerNode as any).position,
                  data: drawerNode.data,
                };
                const inspectorJson = JSON.stringify(inspector, null, 2);
                const logs = Array.isArray((drawerNode.data as any)?.logs)
                  ? (drawerNode.data as any).logs.map((l: any) => String(l?.text ?? l)).join('\n')
                  : '';

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    <div style={{ fontSize: '11px', opacity: 0.8 }}>
                      <div><b>ID:</b> {drawerNode.id}</div>
                      <div><b>Type:</b> {String(drawerNode.type)}</div>
                      {drawerNode.data?.status && <div><b>Status:</b> {String(drawerNode.data.status)}</div>}
                      {(drawerNode.data as any)?.intentId && <div><b>Intent:</b> {String((drawerNode.data as any).intentId)}</div>}
                    </div>

                    {logs && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div style={{ fontSize: '11px', opacity: 0.85 }}>Logs</div>
                        <pre
                          style={{
                            margin: 0,
                            padding: '8px',
                            borderRadius: '4px',
                            border: '1px solid var(--vscode-input-border)',
                            background: 'var(--vscode-editor-background)',
                            color: 'var(--vscode-editor-foreground)',
                            fontSize: '11px',
                            maxHeight: '160px',
                            overflow: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                          }}
                        >
                          {logs}
                        </pre>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ fontSize: '11px', opacity: 0.85 }}>Node JSON</div>
                      <pre
                        style={{
                          margin: 0,
                          padding: '8px',
                          borderRadius: '4px',
                          border: '1px solid var(--vscode-input-border)',
                          background: 'var(--vscode-editor-background)',
                          color: 'var(--vscode-editor-foreground)',
                          fontSize: '11px',
                          overflow: 'auto',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                        }}
                      >
                        {inspectorJson}
                      </pre>
                    </div>
                  </div>
                );
              })()}

              {/*
              {drawerNode.id === 'start' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.9 }}>Pipeline name</label>
                    <input
                      className="nodrag"
                      value={String(drawerNode.data?.label ?? '')}
                      onChange={(e) => updateNodeData('start', { label: e.target.value })}
                      style={{
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.9 }}>Description</label>
                    <textarea
                      className="nodrag"
                      value={String(drawerNode.data?.description ?? '')}
                      onChange={(e) => updateNodeData('start', { description: e.target.value })}
                      rows={4}
                      style={{
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                        resize: 'vertical',
                      }}
                    />
                  </div>
                </div>
              )}

              {drawerNode.type === 'promptNode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.9 }}>Variable name</label>
                    <input
                      className="nodrag"
                      value={String(drawerNode.data?.name ?? '')}
                      onChange={(e) => updateNodeData(drawerNode.id, { name: e.target.value })}
                      style={{
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.9 }}>Default value</label>
                    <input
                      className="nodrag"
                      value={String(drawerNode.data?.value ?? '')}
                      onChange={(e) => updateNodeData(drawerNode.id, { value: e.target.value })}
                      style={{
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                      }}
                    />
                  </div>
                </div>
              )}

              {drawerNode.type === 'repoNode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.9 }}>Path</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <input
                        className="nodrag"
                        value={String(drawerNode.data?.path ?? '')}
                        onChange={(e) => updateNodeData(drawerNode.id, { path: e.target.value })}
                        style={{
                          flex: 1,
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-input-border)',
                          padding: '6px',
                        }}
                      />
                      <button
                        className="nodrag"
                        onClick={() => {
                          if (!vscode) return;
                          vscode.postMessage({ type: 'selectPath', id: drawerNode.id, argName: 'path' });
                        }}
                        style={{
                          background: 'var(--vscode-button-secondaryBackground)',
                          color: 'var(--vscode-button-secondaryForeground)',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '6px 10px',
                          cursor: 'pointer',
                        }}
                      >
                        Browse
                      </button>
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>
                      Tip: use <code>${'{workspaceRoot}'}</code> to target the current workspace.
                    </div>
                  </div>
                </div>
              )}

              {drawerNode.type === 'vscodeCommandNode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '11px', opacity: 0.9 }}>commandId</label>
                    <input
                      className="nodrag"
                      value={String(drawerNode.data?.commandId ?? '')}
                      onChange={(e) => updateNodeData(drawerNode.id, { commandId: e.target.value })}
                      style={{
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: '1px solid var(--vscode-input-border)',
                        padding: '6px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <label style={{ fontSize: '11px', opacity: 0.9 }}>args (JSON)</label>
                      {drawerArgsJsonError && (
                        <span style={{ fontSize: '10px', color: 'var(--vscode-inputValidation-errorForeground)' }}>
                          {drawerArgsJsonError}
                        </span>
                      )}
                    </div>
                    <textarea
                      className="nodrag"
                      value={String(drawerNode.data?.argsJson ?? '')}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateNodeData(drawerNode.id, { argsJson: v });
                        if (!v.trim()) {
                          setDrawerArgsJsonError('');
                          return;
                        }
                        try {
                          JSON.parse(v);
                          setDrawerArgsJsonError('');
                        } catch {
                          setDrawerArgsJsonError('Invalid JSON');
                        }
                      }}
                      rows={6}
                      style={{
                        width: '100%',
                        resize: 'vertical',
                        background: 'var(--vscode-input-background)',
                        color: 'var(--vscode-input-foreground)',
                        border: `1px solid ${drawerArgsJsonError ? 'var(--vscode-inputValidation-errorBorder)' : 'var(--vscode-input-border)'}`,
                        padding: '6px',
                        fontFamily: 'var(--vscode-editor-font-family, Consolas, monospace)',
                        fontSize: '12px',
                      }}
                    />
                    <div style={{ fontSize: '11px', opacity: 0.7 }}>
                      This node can be interactive/non-deterministic depending on the command.
                    </div>
                  </div>
                </div>
              )}

              {drawerNode.type === 'actionNode' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', opacity: 0.9 }}>Provider</label>
                      <select
                        className="nodrag"
                        value={String(drawerNode.data?.provider ?? 'terminal')}
                        onChange={(e) => {
                          const provider = e.target.value;
                          const group = (commandGroups || []).find((g: any) => g.provider === provider);
                          const caps = group?.commands || [];
                          const defaultCap = caps.find((c: any) => String(c.capability).endsWith('.run'))?.capability || caps[0]?.capability || '';
                          updateNodeData(drawerNode.id, { provider, capability: defaultCap, args: {} });
                        }}
                        style={{
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-input-border)',
                          padding: '6px',
                        }}
                      >
                        {(commandGroups || []).map((g: any) => (
                          <option key={g.provider} value={g.provider}>{g.provider}</option>
                        ))}
                      </select>
                    </div>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <label style={{ fontSize: '11px', opacity: 0.9 }}>Capability</label>
                      <select
                        className="nodrag"
                        value={String(drawerNode.data?.capability ?? '')}
                        onChange={(e) => updateNodeData(drawerNode.id, { capability: e.target.value })}
                        style={{
                          background: 'var(--vscode-input-background)',
                          color: 'var(--vscode-input-foreground)',
                          border: '1px solid var(--vscode-input-border)',
                          padding: '6px',
                        }}
                      >
                        {(() => {
                          const provider = String(drawerNode.data?.provider ?? 'terminal');
                          const group = (commandGroups || []).find((g: any) => g.provider === provider);
                          const caps = group?.commands || [];
                          return caps.map((c: any) => (
                            <option key={c.capability} value={c.capability}>{c.capability}</option>
                          ));
                        })()}
                      </select>
                    </div>
                  </div>

                  {(() => {
                    const provider = String(drawerNode.data?.provider ?? 'terminal');
                    const capId = String(drawerNode.data?.capability ?? '');
                    const group = (commandGroups || []).find((g: any) => g.provider === provider);
                    const caps = group?.commands || [];
                    const capConfig = caps.find((c: any) => c.capability === capId);
                    const argsConfig = capConfig?.args || [];
                    const currentArgs = (drawerNode.data?.args || {}) as any;

                    const baseInputStyle: any = {
                      background: 'var(--vscode-input-background)',
                      color: 'var(--vscode-input-foreground)',
                      border: '1px solid var(--vscode-input-border)',
                      padding: '6px',
                    };

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontSize: '11px', opacity: 0.9 }}>Description</label>
                          <input
                            className="nodrag"
                            value={String(currentArgs.description ?? '')}
                            onChange={(e) => updateActionArgs(drawerNode.id, { description: e.target.value })}
                            style={baseInputStyle}
                          />
                        </div>

                        {argsConfig.map((a: any) => {
                          const name = String(a.name);
                          const required = !!a.required;
                          const label = a.description ? `${name} — ${a.description}` : name;
                          const value = currentArgs[name];

                          const renderField = () => {
                            if (a.type === 'boolean') {
                              return (
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <input
                                    className="nodrag"
                                    type="checkbox"
                                    checked={!!value}
                                    onChange={(e) => updateActionArgs(drawerNode.id, { [name]: e.target.checked })}
                                  />
                                  <span style={{ fontSize: '11px', opacity: 0.9 }}>{label}{required ? ' *' : ''}</span>
                                </label>
                              );
                            }

                            if (a.type === 'enum' && Array.isArray(a.options)) {
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontSize: '11px', opacity: 0.9 }}>{label}{required ? ' *' : ''}</label>
                                  <select
                                    className="nodrag"
                                    value={value ?? ''}
                                    onChange={(e) => updateActionArgs(drawerNode.id, { [name]: e.target.value })}
                                    style={baseInputStyle}
                                  >
                                    <option value="">(Select)</option>
                                    {a.options.map((o: any) => (
                                      <option key={String(o)} value={String(o)}>{String(o)}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }

                            if (a.type === 'enum' && typeof a.options === 'string') {
                              const dyn = drawerDynamicOptions[name] || [];
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontSize: '11px', opacity: 0.9 }}>{label}{required ? ' *' : ''}</label>
                                  <select
                                    className="nodrag"
                                    value={value ?? ''}
                                    onChange={(e) => updateActionArgs(drawerNode.id, { [name]: e.target.value })}
                                    style={baseInputStyle}
                                  >
                                    <option value="">(Select)</option>
                                    {dyn.map((o: any) => (
                                      <option key={String(o)} value={String(o)}>{String(o)}</option>
                                    ))}
                                  </select>
                                </div>
                              );
                            }

                            if (a.type === 'path') {
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  <label style={{ fontSize: '11px', opacity: 0.9 }}>{label}{required ? ' *' : ''}</label>
                                  <div style={{ display: 'flex', gap: '6px' }}>
                                    <input
                                      className="nodrag"
                                      value={value ?? ''}
                                      onChange={(e) => updateActionArgs(drawerNode.id, { [name]: e.target.value })}
                                      style={{ ...baseInputStyle, flex: 1 }}
                                    />
                                    <button
                                      className="nodrag"
                                      onClick={() => {
                                        if (!vscode) return;
                                        vscode.postMessage({ type: 'selectPath', id: drawerNode.id, argName: name });
                                      }}
                                      style={{
                                        background: 'var(--vscode-button-secondaryBackground)',
                                        color: 'var(--vscode-button-secondaryForeground)',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '6px 10px',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Browse
                                    </button>
                                  </div>
                                </div>
                              );
                            }

                            return (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                <label style={{ fontSize: '11px', opacity: 0.9 }}>{label}{required ? ' *' : ''}</label>
                                <input
                                  className="nodrag"
                                  value={value ?? ''}
                                  onChange={(e) => updateActionArgs(drawerNode.id, { [name]: e.target.value })}
                                  style={baseInputStyle}
                                />
                              </div>
                            );
                          };

                          return <div key={name}>{renderField()}</div>;
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
              */}
            </div>
          </div>
        )}

        <div
          className="nodrag"
          style={{
            position: 'absolute',
            bottom: '18px',
            right: '18px',
            zIndex: 950,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: '8px'
          }}
        >
          {dockOpen && (
            <div
              className="nodrag quick-add-dock"
              style={{
                width: '240px',
                background: 'var(--vscode-editorWidget-background)',
                border: '1px solid var(--vscode-editorWidget-border)',
                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <input
                className="nodrag"
                placeholder="Search nodes…"
                value={dockQuery}
                onChange={(e) => setDockQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filteredDockItems.length > 0) {
                    addNodeFromItem(filteredDockItems[0], lastCanvasPos || undefined, null);
                  }
                }}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--vscode-input-border)',
                  background: 'var(--vscode-input-background)',
                  color: 'var(--vscode-input-foreground)'
                }}
              />
              <div style={{ maxHeight: '200px', overflow: 'auto' }}>
                {filteredDockItems.length === 0 && (
                  <div style={{ fontSize: '12px', opacity: 0.7, padding: '6px' }}>No results</div>
                )}
                {filteredDockItems.map((item) => (
                  <div
                    key={item.id}
                    className="quick-add-item"
                    style={{
                      padding: '6px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                    onClick={() => addNodeFromItem(item, lastCanvasPos || undefined, null)}
                  >
                    {item.label}
                  </div>
                ))}
              </div>
            </div>
          )}
          <button
            className="nodrag"
            onClick={() => setDockOpen((v) => !v)}
            title="Quick Add"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '18px',
              border: '1px solid var(--ir-add-border)',
              background: 'var(--ir-add-bg)',
              color: 'var(--ir-add-fg)',
              cursor: 'pointer',
              fontSize: '18px',
              lineHeight: '30px',
              padding: 0
            }}
          >
            +
          </button>
        </div>

       <button
         onClick={runPipeline}
         style={{
           position: 'absolute',
           top: '10px',
           right: '140px',
           padding: '10px 20px',
           background: 'var(--ir-run-idle)',
           color: 'var(--ir-run-foreground)',
           border: 'none',
           borderRadius: '4px',
           cursor: 'pointer',
           zIndex: 5
         }}
       >
         Run
       </button>

       <button
         onClick={autoLayout}
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
           zIndex: 5
         }}
       >
         Auto layout
       </button>

       <button
         onClick={savePipeline}
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
           zIndex: 5
         }}
       >
         Save Pipeline
       </button>
     </div>
   );
 }

export default function App() {
  const [commandGroups, setCommandGroups] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedRun, setSelectedRun] = useState<any>(null);
  const [restoreRun, setRestoreRun] = useState<any>(null);
  const [themeTokens, setThemeTokens] = useState(() => tokensFromPreset(window.initialData?.uiPreset || { theme: { tokens: defaultThemeTokens } }));
  const [adminMode, setAdminMode] = useState<boolean>(!!window.initialData?.adminMode);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [sidebarTab, setSidebarTab] = useState<'providers' | 'history' | 'environment' | 'studio'>('providers');

  useEffect(() => {
    // Restore ephemeral UI state from VS Code webview state
    try {
      const st = vscode?.getState?.() || {};
      if (typeof st.sidebarCollapsed === 'boolean') setSidebarCollapsed(st.sidebarCollapsed);
      if (st.sidebarTab === 'providers' || st.sidebarTab === 'history' || st.sidebarTab === 'environment' || st.sidebarTab === 'studio') {
        setSidebarTab(st.sidebarTab);
      }
    } catch {
      // ignore
    }

    if (window.initialData) {
      if (window.initialData.commandGroups) {
        setCommandGroups(window.initialData.commandGroups);
      }
      if (window.initialData.history) {
        setHistory(window.initialData.history);
      }
      if (window.initialData.uiPreset) {
        setThemeTokens(tokensFromPreset(window.initialData.uiPreset));
      }
      if (typeof window.initialData.adminMode === 'boolean') {
        setAdminMode(!!window.initialData.adminMode);
      }
    }

    const handleMessage = (event: MessageEvent) => {
       if (event.data?.type === 'historyUpdate') {
           console.log('History updated:', event.data.history);
           setHistory(event.data.history);
           // If history is cleared, clear selected run
           if (event.data.history.length === 0) {
               setSelectedRun(null);
           }
       } else if (event.data?.type === 'uiPresetUpdate') {
           setThemeTokens(tokensFromPreset(event.data.uiPreset));
       } else if (event.data?.type === 'adminModeUpdate') {
           setAdminMode(!!event.data.adminMode);
       }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setSidebarCollapsed((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    try {
      const prev = vscode?.getState?.() || {};
      vscode?.setState?.({ ...prev, sidebarCollapsed, sidebarTab });
    } catch {
      // ignore
    }
  }, [sidebarCollapsed, sidebarTab]);

  useEffect(() => {
    applyThemeTokensToRoot(themeTokens);
  }, [themeTokens]);

  // When clicking an active run again or clicking clear, we might want to toggle?
  // For now, let's allow re-selection to replay.
  // Sidebar handles the click.

  return (
    <RegistryContext.Provider value={{ commandGroups }}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', flexDirection: 'row', position: 'relative' }}>
         {!sidebarCollapsed && (
           <Sidebar
              tab={sidebarTab}
              onTabChange={setSidebarTab}
              history={history}
              adminMode={adminMode}
              onSelectHistory={setSelectedRun}
              onRestoreHistory={(run) => {
                  setRestoreRun(run);
                  setSelectedRun(null); // Stop playback/clear selection
              }}
           />
         )}
         <div style={{ flex: 1, position: 'relative' }}>
            <button
              className="nodrag"
              onClick={() => setSidebarCollapsed((v) => !v)}
              title={sidebarCollapsed ? 'Show sidebar (Ctrl+B)' : 'Hide sidebar (Ctrl+B)'}
              style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                zIndex: 950,
                background: 'var(--vscode-button-secondaryBackground)',
                color: 'var(--vscode-button-secondaryForeground)',
                border: 'none',
                borderRadius: '4px',
                padding: '8px 10px',
                cursor: 'pointer',
              }}
            >
              {sidebarCollapsed ? '≡' : '⟨'}
            </button>
 	           <ReactFlowProvider>
	             <Flow
	                selectedRun={selectedRun}
	                restoreRun={restoreRun}
	                onRestoreHandled={() => {
	                    setRestoreRun(null);
	                }}
	             />
	           </ReactFlowProvider>
         </div>
      </div>
    </RegistryContext.Provider>
  );
}
