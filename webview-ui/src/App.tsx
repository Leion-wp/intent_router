import React, { useCallback, useEffect } from 'react';
import { ReactFlow, Controls, Background, useNodesState, useEdgesState, addEdge, MiniMap } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import './index.css';

const initialNodes = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Start' } },
];
const initialEdges: any[] = [];

declare global {
  interface Window {
    vscode: any;
    initialData: any;
  }
}

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (window.initialData && window.initialData.pipeline) {
      const { pipeline } = window.initialData;

      const newNodes: any[] = [];
      const newEdges: any[] = [];
      let y = 50;

      newNodes.push({
         id: 'start',
         type: 'input',
         data: { label: pipeline.name || 'Start' },
         position: { x: 250, y: 0 }
      });

      let lastId = 'start';

      if (Array.isArray(pipeline.steps)) {
          pipeline.steps.forEach((step: any, index: number) => {
             const id = `step-${index}`;
             const label = step.description || step.intent || step.command || `Step ${index + 1}`;

             newNodes.push({
                 id,
                 data: { label },
                 position: { x: 250, y: y += 100 }
             });

             newEdges.push({
                 id: `e-${lastId}-${id}`,
                 source: lastId,
                 target: id
             });

             lastId = id;
          });
      }

      setNodes(newNodes);
      setEdges(newEdges);
    }
  }, []);

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
