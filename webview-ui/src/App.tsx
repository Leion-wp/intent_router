import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Node,
  Connection,
  MarkerType,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css';

import Sidebar from './Sidebar';
import ActionNode from './nodes/ActionNode';
import PromptNode from './nodes/PromptNode';
import RepoNode from './nodes/RepoNode';
import VSCodeCommandNode from './nodes/VSCodeCommandNode';
import { isInboundMessage, WebviewInboundMessage } from './types/messages';

// Context for Registry
export const RegistryContext = createContext<any>({});

// Runtime context for nodes (Prompt vars + ENV vars)
export const FlowRuntimeContext = createContext<{ getAvailableVars: () => string[] }>({
  getAvailableVars: () => []
});

// Register custom node types
const nodeTypes = {
  actionNode: ActionNode,
  promptNode: PromptNode,
  repoNode: RepoNode,
  vscodeCommandNode: VSCodeCommandNode
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
    type: 'input',
    data: { label: 'Start' },
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

function Flow({ selectedRun, restoreRun, onRestoreHandled }: { selectedRun: any, restoreRun: any, onRestoreHandled: () => void }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const MAX_LOG_LINES = 200;

  const [environment, setEnvironment] = useState<Record<string, string>>(
    (window.initialData?.environment as Record<string, string>) || {}
  );

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

    const envVars = Object.keys(envRef.current || {}).map(s => String(s).trim()).filter(Boolean);

    const all = Array.from(new Set([...promptVars, ...envVars]));
    all.sort((a, b) => a.localeCompare(b));
    return all;
  }, []);

  const flowRuntime = useMemo(() => ({ getAvailableVars }), [getAvailableVars]);

  // Helper to load pipeline data into graph
  const loadPipeline = (pipeline: any) => {
      console.log('Loading pipeline:', pipeline);

      // 1. Snapshot Restoration (Priority)
      if (pipeline.meta?.ui?.nodes && pipeline.meta?.ui?.edges) {
          console.log('Restoring from snapshot');
          // Validate nodes/edges simply? Or just trust them?
          // We might want to ensure they are arrays
          if (Array.isArray(pipeline.meta.ui.nodes) && Array.isArray(pipeline.meta.ui.edges)) {
              setNodes(pipeline.meta.ui.nodes);
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
         type: 'input',
         data: { label: pipeline.name || 'Start' },
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
             if (index < pipeline.steps.length - 1) {
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
                     newEdges.push({
                         id: `e-${currentNodeId}-${targetNodeId}-fail`,
                         source: currentNodeId,
                         target: targetNodeId,
                         sourceHandle: 'failure',
                         markerEnd: { type: MarkerType.ArrowClosed },
                         style: { stroke: '#f44336' }, // Optional: visual cue
                         animated: true
                     });
                 }
             }
          });
      }

      setNodes(newNodes);
      setEdges(newEdges);
      setTimeout(() => reactFlowInstance?.fitView(), 100);
  };

  // Load initial data if any
  useEffect(() => {
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
  }, [reactFlowInstance]); // Dependency on reactFlowInstance for fitView

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
    setEdges((eds) =>
      eds.map((edge) => {
        const sourceNode = nodes.find((n) => n.id === edge.source);
        if (!sourceNode) return edge;

        const status = (sourceNode.data?.status as string) || 'idle';
        let stroke = 'var(--vscode-editor-foreground)'; // Idle
        if (status === 'running') stroke = '#007acc';
        else if (status === 'success') stroke = '#4caf50';
        else if (status === 'failure') stroke = '#f44336';

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
      setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed } }, eds));
    },
    [setEdges],
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
    [reactFlowInstance],
  );

	  const savePipeline = () => {
    // 1. Build Graph Adjacency List
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    const adj = new Map<string, string[]>();
    const inDegree = new Map<string, number>();
    const failureMap = new Map<string, string>(); // Source -> Target
    const successEdges = new Map<string, string>(); // Source -> Target

    nodes.forEach(n => {
        adj.set(n.id, []);
        inDegree.set(n.id, 0);
    });

    edges.forEach(e => {
        if (adj.has(e.source) && adj.has(e.target)) {
            adj.get(e.source)?.push(e.target);
            inDegree.set(e.target, (inDegree.get(e.target) || 0) + 1);
        }

        if (e.sourceHandle === 'failure') {
            failureMap.set(e.source, e.target);
        } else {
            successEdges.set(e.source, e.target);
        }
    });

    // 2. Check for Disconnected Nodes (Hard Error)
    if (nodes.length > 1) {
        const isolated = nodes.find(n => (inDegree.get(n.id) === 0) && (adj.get(n.id)?.length === 0));
        if (isolated) {
            const msg = `Node '${isolated.data.label || isolated.type}' is not connected.`;
            if (vscode) vscode.postMessage({ type: 'error', message: msg });
            else alert(msg);
            return;
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
        if (lastProcessedId && successEdges.has(lastProcessedId)) {
            const preferredNext = successEdges.get(lastProcessedId)!;
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
    if (sortedIds.length !== nodes.length) {
         const msg = 'Cycle detected in pipeline graph.';
         if (vscode) vscode.postMessage({ type: 'error', message: msg });
         else alert(msg);
         return;
    }

    // 5. Map Sorted Nodes to Steps
    const steps: any[] = [];
    sortedIds.forEach(id => {
        const node = nodeMap.get(id);
        if (!node) return;

        // Skip Start Node (input type) for executable steps
        if (node.type === 'input') return;

        let intent = '';
        let description = '';
        let payload: any = {};
        const data: any = node.data;

        if (node.type === 'promptNode') {
            intent = 'system.setVar';
            payload = { name: data.name, value: data.value };
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
        }

        if (intent) {
            const stepObj: any = {
                id: node.id,
                intent,
                description,
                payload
            };

            if (failureMap.has(node.id)) {
                stepObj.onFailure = failureMap.get(node.id);
            }

            steps.push(stepObj);
        }
    });

		    const pipeline = {
		      name: (nodes.find(n => n.id === 'start')?.data.label as string) || 'My Pipeline',
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

    if (vscode) {
      vscode.postMessage({
        type: 'savePipeline',
        pipeline
      });
    } else {
      console.log('Saved Pipeline (Mock):', pipeline);
    }
  };

	  return (
	    <div className="dndflow">
	      <div className="reactflow-wrapper" ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
	        <FlowRuntimeContext.Provider value={flowRuntime}>
	          <ReactFlow
	            nodes={nodes}
	            edges={edges}
	            onNodesChange={onNodesChange}
	            onEdgesChange={onEdgesChange}
	            onConnect={onConnect}
	            onInit={setReactFlowInstance}
	            onDrop={onDrop}
	            onDragOver={onDragOver}
	            nodeTypes={nodeTypes}
	            snapToGrid={true}
	            fitView
	          >
	            <Controls />
	            <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
	            <MiniMap />
	          </ReactFlow>
	        </FlowRuntimeContext.Provider>
	      </div>

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

  useEffect(() => {
    if (window.initialData) {
      if (window.initialData.commandGroups) {
        setCommandGroups(window.initialData.commandGroups);
      }
      if (window.initialData.history) {
        setHistory(window.initialData.history);
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
       }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // When clicking an active run again or clicking clear, we might want to toggle?
  // For now, let's allow re-selection to replay.
  // Sidebar handles the click.

  return (
    <RegistryContext.Provider value={{ commandGroups }}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', flexDirection: 'row' }}>
         <Sidebar
            history={history}
            onSelectHistory={setSelectedRun}
            onRestoreHistory={(run) => {
                setRestoreRun(run);
                setSelectedRun(null); // Stop playback/clear selection
            }}
         />
         <div style={{ flex: 1, position: 'relative' }}>
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
