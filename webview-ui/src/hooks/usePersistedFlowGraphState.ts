import { useEffect } from 'react';

type UsePersistedFlowGraphStateOptions = {
  vscode: any;
  nodes: any[];
  edges: any[];
  chrome: {
    opacity: number;
    showMiniMap: boolean;
    showControls: boolean;
    focusGraph: boolean;
    collapsed: boolean;
    position: { x: number; y: number };
  };
};

export function usePersistedFlowGraphState(options: UsePersistedFlowGraphStateOptions) {
  const { vscode, nodes, edges, chrome } = options;

  useEffect(() => {
    try {
      const previous = vscode?.getState?.() || {};
      const safeNodes = nodes.map((node: any) => {
        const { status, logs, intentId, ...rest } = (node.data || {}) as any;
        return { ...node, data: { ...rest, status: 'idle' } };
      });
      const safeEdges = edges.map((edge: any) => {
        const { style, animated, ...rest } = edge as any;
        return rest;
      });
      vscode?.setState?.({
        ...previous,
        graph: { nodes: safeNodes, edges: safeEdges },
        chrome: {
          opacity: chrome.opacity,
          showMiniMap: chrome.showMiniMap,
          showControls: chrome.showControls,
          focusGraph: chrome.focusGraph,
          collapsed: chrome.collapsed,
          position: chrome.position
        }
      });
    } catch {
      // ignore
    }
  }, [
    chrome.collapsed,
    chrome.focusGraph,
    chrome.opacity,
    chrome.position,
    chrome.showControls,
    chrome.showMiniMap,
    edges,
    nodes,
    vscode
  ]);
}
