import { MutableRefObject, useEffect } from 'react';

type UseFlowChromePanelOptions = {
  chromeCollapsed: boolean;
  chromePanelDragRef: MutableRefObject<{ dx: number; dy: number } | null>;
  setChromePanelPos: (value: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void;
};

function getPanelBounds(chromeCollapsed: boolean) {
  const panelWidth = chromeCollapsed ? 230 : 760;
  const panelHeight = chromeCollapsed ? 38 : 84;
  const maxX = Math.max(8, window.innerWidth - panelWidth - 8);
  const maxY = Math.max(8, window.innerHeight - panelHeight - 8);
  return { maxX, maxY };
}

export function useFlowChromePanel(options: UseFlowChromePanelOptions) {
  const { chromeCollapsed, chromePanelDragRef, setChromePanelPos } = options;

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const drag = chromePanelDragRef.current;
      if (!drag) return;
      const { maxX, maxY } = getPanelBounds(chromeCollapsed);
      const nextX = Math.max(8, Math.min(maxX, event.clientX - drag.dx));
      const nextY = Math.max(8, Math.min(maxY, event.clientY - drag.dy));
      setChromePanelPos({ x: nextX, y: nextY });
    };
    const onMouseUp = () => {
      chromePanelDragRef.current = null;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [chromeCollapsed, chromePanelDragRef, setChromePanelPos]);

  useEffect(() => {
    const onResize = () => {
      const { maxX, maxY } = getPanelBounds(chromeCollapsed);
      setChromePanelPos((prev) => ({
        x: Math.max(8, Math.min(maxX, prev.x)),
        y: Math.max(8, Math.min(maxY, prev.y))
      }));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [chromeCollapsed, setChromePanelPos]);
}
