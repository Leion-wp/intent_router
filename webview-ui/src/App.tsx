import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
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
  MarkerType
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css';

import Sidebar from './Sidebar';
import ActionNode from './nodes/ActionNode';

// Context for Registry
export const RegistryContext = createContext<any>({});

// Register custom node types
const nodeTypes = {
  actionNode: ActionNode,
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

function Flow({ selectedRun }: { selectedRun: any }) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);

  // Load initial data if any
  useEffect(() => {
    if (window.initialData && window.initialData.pipeline) {
      const { pipeline } = window.initialData;
      console.log('Loading pipeline:', pipeline);

      const newNodes: Node[] = [];
      const newEdges: Edge[] = [];

      // Start Node
      newNodes.push({
         id: 'start',
         type: 'input',
         data: { label: pipeline.name || 'Start' },
         position: { x: 250, y: 50 },
         deletable: false
      });

      let lastId = 'start';
      let y = 150;

      if (Array.isArray(pipeline.steps)) {
          pipeline.steps.forEach((step: any) => {
             const nodeId = getId();
             const normalized = canonicalizeIntent('', step.intent || '');
             const provider = normalized.provider;
             // Store full capability name (e.g. 'terminal.run') to match registry
             const capability = normalized.capability;

             // Merge payload and description into args for the UI
             const args = { ...step.payload, description: step.description };

             newNodes.push({
                 id: nodeId,
                 type: 'actionNode',
                 position: { x: 250, y: y },
                 data: {
                   provider,
                   capability,
                   args
                 }
             });

             newEdges.push({
                 id: `e-${lastId}-${nodeId}`,
                 source: lastId,
                 target: nodeId,
                 markerEnd: { type: MarkerType.ArrowClosed }
             });

             lastId = nodeId;
             y += 150;
          });
      }

      setNodes(newNodes);
      setEdges(newEdges);
    }

    // Listen for messages from extension
    const handleMessage = (event: MessageEvent) => {
       const message = event.data;
       switch (message.type) {
         case 'executionStatus':
           setNodes((nds) => nds.map((node) => {
             // We need to map step index to node? Or pass node ID in metadata?
             // For V1, we assume linear execution matches the linear graph order after Start.
             // If we have index:
             if (message.index !== undefined) {
               // Filter out the start node (index -1 effectively)
               const actionNodes = nds.filter(n => n.id !== 'start');
               if (actionNodes[message.index] && actionNodes[message.index].id === node.id) {
                 return {
                   ...node,
                   data: { ...node.data, status: message.status }
                 };
               }
             }
             return node;
           }));
           break;
       }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Playback Logic
  useEffect(() => {
    const timeouts: any[] = [];

    if (selectedRun) {
      console.log('Replaying run:', selectedRun);

      // 1. Reset all nodes to idle
      setNodes((nds) => nds.map(n => ({ ...n, data: { ...n.data, status: 'idle' } })));

      // 2. Playback steps
      const actionNodes = nodes.filter(n => n.id !== 'start');

      selectedRun.steps.forEach((step: any, i: number) => {
         const t = setTimeout(() => {
           setNodes((nds) => {
              // Map index to action node ID
              const targetNode = actionNodes[step.index];
              if (!targetNode) return nds;

              return nds.map(n => {
                if (n.id === targetNode.id) {
                  return {
                    ...n,
                    data: { ...n.data, status: step.status }
                  };
                }
                return n;
              });
           });
         }, (i + 1) * 600); // 600ms delay per step
         timeouts.push(t);
      });
    }

    return () => {
      timeouts.forEach(clearTimeout);
    };
  }, [selectedRun]); // Re-run when selectedRun changes

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
        data: {
          provider: provider,
          capability: '', // Default will be set by Node
          args: {},
          status: 'idle'
        },
      };

      setNodes((nds) => nds.concat(newNode));
    },
    [reactFlowInstance],
  );

  const savePipeline = () => {
    // 1. Sort nodes topologically (simple: follow edges from start)
    // For V1, we assume a single chain for simplicity, but let's try to traverse.

    const steps: any[] = [];
    let currentNodeId = 'start';

    // Find edge starting from current
    // Loop max 100 times to prevent infinite loop bugs
    for(let i=0; i<100; i++) {
       const edge = edges.find(e => e.source === currentNodeId);
       if (!edge) break;

       const nextNode = nodes.find(n => n.id === edge.target);
       if (!nextNode) break;

       const data: any = nextNode.data;
       const normalized = canonicalizeIntent(String(data.provider || ''), String(data.capability || ''));
       const intent = normalized.intent;

       // Separate description from payload
       const { description, ...payload } = data.args || {};

       steps.push({
         intent,
         description,
         payload
       });

       currentNodeId = nextNode.id;
    }

    const pipeline = {
      name: (nodes.find(n => n.id === 'start')?.data.label as string) || 'My Pipeline',
      intent: 'pipeline.run',
      steps
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
       }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  return (
    <RegistryContext.Provider value={{ commandGroups }}>
      <div style={{ display: 'flex', width: '100vw', height: '100vh', flexDirection: 'row' }}>
         <Sidebar history={history} onSelectHistory={setSelectedRun} />
         <div style={{ flex: 1, position: 'relative' }}>
           <ReactFlowProvider>
             <Flow selectedRun={selectedRun} />
           </ReactFlowProvider>
         </div>
      </div>
    </RegistryContext.Provider>
  );
}
