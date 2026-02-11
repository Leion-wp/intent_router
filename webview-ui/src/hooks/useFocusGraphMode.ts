import { useCallback, useRef } from 'react';

type UseFocusGraphModeOptions = {
  focusGraph: boolean;
  sidebarCollapsed: boolean;
  setFocusGraph: (value: boolean) => void;
  onSetSidebarCollapsed: (next: boolean) => void;
  setShowMiniMap: (value: boolean) => void;
};

export function useFocusGraphMode(options: UseFocusGraphModeOptions) {
  const {
    focusGraph,
    sidebarCollapsed,
    setFocusGraph,
    onSetSidebarCollapsed,
    setShowMiniMap
  } = options;
  const previousSidebarCollapsedRef = useRef<boolean>(false);

  const toggleFocusGraph = useCallback(() => {
    const next = !focusGraph;
    setFocusGraph(next);
    if (next) {
      previousSidebarCollapsedRef.current = sidebarCollapsed;
      onSetSidebarCollapsed(true);
      setShowMiniMap(false);
    } else {
      onSetSidebarCollapsed(previousSidebarCollapsedRef.current);
      setShowMiniMap(true);
    }
  }, [focusGraph, onSetSidebarCollapsed, setFocusGraph, setShowMiniMap, sidebarCollapsed]);

  return {
    toggleFocusGraph
  };
}
