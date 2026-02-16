import { useCallback, useMemo } from 'react';
import { addEdge, Connection, MarkerType } from '@xyflow/react';
import { createSocketTypeResolver } from '../utils/socketTypeUtils';
import { formatUiError } from '../utils/uiMessageUtils';

type UseFlowConnectionHandlersOptions = {
  commandGroups: any[];
  customNodesById: Map<string, any>;
  nodes: any[];
  setEdges: (updater: (edges: any[]) => any[]) => void;
  setConnectionError: (message: string | null) => void;
};

export function useFlowConnectionHandlers(options: UseFlowConnectionHandlersOptions) {
  const { commandGroups, customNodesById, nodes, setEdges, setConnectionError } = options;

  const socketTypeResolver = useMemo(
    () => createSocketTypeResolver({ commandGroups: commandGroups || [], customNodesById }),
    [commandGroups, customNodesById]
  );

  const onConnect = useCallback(
    (params: Connection) => {
      if (params.source === params.target) return;
      setEdges((edges) => {
        const normalizedSourceHandle = String(params.sourceHandle || 'success');
        const normalizedTargetHandle = String(params.targetHandle || 'in');
        const sourceNode = nodes.find((node: any) => node.id === params.source);
        const targetNode = nodes.find((node: any) => node.id === params.target);
        const sourceType = socketTypeResolver.getSourceSocketType(sourceNode, normalizedSourceHandle);
        const targetType = socketTypeResolver.getTargetSocketType(targetNode, normalizedTargetHandle);

        if (!socketTypeResolver.areSocketTypesCompatible(sourceType, targetType)) {
          setConnectionError(formatUiError(`Incompatible sockets: ${sourceType} → ${targetType}`, {
            context: 'Connection blocked',
            action: 'Connect matching input/output types.'
          }));
          return edges;
        }

        let label: string | undefined = undefined;
        try {
          if (sourceNode?.type === 'switchNode' && normalizedSourceHandle) {
            const handle = String(normalizedSourceHandle);
            if (handle === 'default') {
              label = 'default';
            } else if (handle.startsWith('route_')) {
              const index = Number(handle.slice('route_'.length));
              const routes = Array.isArray((sourceNode.data as any)?.routes) ? (sourceNode.data as any).routes : [];
              const routeLabel = routes?.[index]?.label;
              label = String(routeLabel || handle);
            }
          } else if (normalizedSourceHandle !== 'success') {
            label = normalizedSourceHandle;
          }
        } catch {
          // best effort
        }

        const withoutPreviousOnTargetHandle = edges.filter((edge: any) => !(
          edge?.target === params.target
          && String(edge?.targetHandle || 'in') === normalizedTargetHandle
        ));

        const edge: any = {
          ...params,
          sourceHandle: normalizedSourceHandle,
          targetHandle: normalizedTargetHandle,
          markerEnd: { type: MarkerType.ArrowClosed },
          data: label ? { label } : undefined
        };
        return addEdge(edge, withoutPreviousOnTargetHandle);
      });
    },
    [nodes, setConnectionError, setEdges, socketTypeResolver]
  );

  return { onConnect };
}
