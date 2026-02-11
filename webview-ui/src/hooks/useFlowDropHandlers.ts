import { useCallback } from 'react';
import { Node } from '@xyflow/react';
import { buildDropNodeData } from '../utils/nodeCreationUtils';

type UseFlowDropHandlersOptions = {
  reactFlowInstance: any;
  customNodesById: Map<string, any>;
  getId: () => string;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
};

export function useFlowDropHandlers(options: UseFlowDropHandlersOptions) {
  const { reactFlowInstance, customNodesById, getId, setNodes } = options;

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
        y: event.clientY
      });

      const newNode: Node = {
        id: getId(),
        type,
        position,
        data: buildDropNodeData(
          {
            type,
            provider,
            customNodeId
          },
          {
            customNodesById
          }
        )
      };

      setNodes((nodes) => nodes.concat(newNode));
    },
    [customNodesById, getId, reactFlowInstance, setNodes]
  );

  return { onDragOver, onDrop };
}
