import { useEffect } from 'react';

type UseDrawerAutoPanOptions = {
  drawerNodeId: string | null;
  reactFlowInstance: any;
  nodes: any[];
  drawerWidthPx?: number;
  marginPx?: number;
};

export function useDrawerAutoPan(options: UseDrawerAutoPanOptions) {
  const {
    drawerNodeId,
    reactFlowInstance,
    nodes,
    drawerWidthPx = 360,
    marginPx = 24
  } = options;

  useEffect(() => {
    if (!drawerNodeId || !reactFlowInstance) return;
    const api: any = reactFlowInstance;
    const getNode = api.getNode?.bind(api);
    const node = getNode ? getNode(drawerNodeId) : nodes.find((entry: any) => entry.id === drawerNodeId);
    if (!node) return;

    const zoom = typeof api.getZoom === 'function' ? api.getZoom() : 1;
    const position = (node.positionAbsolute || node.position || { x: 0, y: 0 }) as any;
    const width = Number(node.measured?.width ?? node.width ?? 0);
    const height = Number(node.measured?.height ?? node.height ?? 0);
    const centerX = position.x + (width ? width / 2 : 0);
    const centerY = position.y + (height ? height / 2 : 0);

    const offsetX = (drawerWidthPx / 2 + marginPx) / (zoom || 1);

    if (typeof api.setCenter === 'function') {
      api.setCenter(centerX - offsetX, centerY, { zoom, duration: 200 });
    } else if (typeof api.fitView === 'function') {
      api.fitView({ nodes: [{ id: drawerNodeId }], padding: 0.2, duration: 200 });
    }
  }, [drawerNodeId, drawerWidthPx, marginPx, nodes, reactFlowInstance]);
}
