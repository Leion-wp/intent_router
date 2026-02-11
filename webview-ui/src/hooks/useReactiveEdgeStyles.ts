import { useEffect } from 'react';
import { MarkerType } from '@xyflow/react';

type UseReactiveEdgeStylesOptions = {
  nodes: any[];
  setEdges: (updater: (edges: any[]) => any[]) => void;
};

function readCssColor(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function normalizeStatus(raw: unknown): 'idle' | 'running' | 'success' | 'error' {
  const value = String(raw || 'idle').toLowerCase();
  if (value === 'running') return 'running';
  if (value === 'success') return 'success';
  if (value === 'failure' || value === 'error') return 'error';
  return 'idle';
}

function pickEdgeStatus(
  sourceStatus: 'idle' | 'running' | 'success' | 'error',
  targetStatus: 'idle' | 'running' | 'success' | 'error'
): 'idle' | 'running' | 'success' | 'error' {
  if (targetStatus === 'running' || sourceStatus === 'running') return 'running';
  if (targetStatus === 'error') return 'error';
  if (targetStatus === 'success') return 'success';
  if (sourceStatus === 'error') return 'error';
  if (sourceStatus === 'success') return 'success';
  return 'idle';
}

export function useReactiveEdgeStyles(options: UseReactiveEdgeStylesOptions) {
  const { nodes, setEdges } = options;

  useEffect(() => {
    const edgeIdle = readCssColor('--ir-edge-idle', 'var(--vscode-editor-foreground)');
    const edgeRunning = readCssColor('--ir-edge-running', '#007acc');
    const edgeSuccess = readCssColor('--ir-edge-success', '#4caf50');
    const edgeError = readCssColor('--ir-edge-error', '#f44336');

    setEdges((edges) =>
      edges.map((edge) => {
        const sourceNode = nodes.find((node) => node.id === edge.source);
        const targetNode = nodes.find((node) => node.id === edge.target);
        if (!sourceNode) return edge;

        const sourceStatus = normalizeStatus(sourceNode.data?.status);
        const targetStatus = normalizeStatus(targetNode?.data?.status);
        const status = pickEdgeStatus(sourceStatus, targetStatus);
        let stroke = edgeIdle;
        if (status === 'running') stroke = edgeRunning;
        else if (status === 'success') stroke = edgeSuccess;
        else if (status === 'error') stroke = edgeError;

        const nextAnimated = status === 'running';
        const nextDash = status === 'running' ? '6 6' : undefined;
        const nextStrokeWidth = status === 'running' ? 2.5 : 2;
        const currentDash = (edge.style as any)?.strokeDasharray;
        const currentStrokeWidth = Number((edge.style as any)?.strokeWidth || 0);
        const baseClassName = String(edge.className || '').replace(/\bir-edge-running\b/g, '').trim();
        const nextClassName = status === 'running'
          ? [baseClassName, 'ir-edge-running'].filter(Boolean).join(' ')
          : baseClassName;

        if (
          edge.style?.stroke !== stroke
          || edge.animated !== nextAnimated
          || currentDash !== nextDash
          || currentStrokeWidth !== nextStrokeWidth
          || String(edge.className || '') !== nextClassName
        ) {
          return {
            ...edge,
            className: nextClassName || undefined,
            style: { ...edge.style, stroke, strokeWidth: nextStrokeWidth, strokeDasharray: nextDash },
            animated: nextAnimated,
            markerEnd: { type: MarkerType.ArrowClosed, color: stroke }
          };
        }

        return edge;
      })
    );
  }, [nodes, setEdges]);
}
