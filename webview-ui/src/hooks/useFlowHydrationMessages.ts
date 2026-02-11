import { useEffect } from 'react';
import { isInboundMessage, WebviewInboundMessage } from '../types/messages';
import {
  applyExecutionStatusToNodes,
  applyStepLogToNodes,
  computeNextRunPillStatus,
  normalizeExecutionStatus
} from '../utils/flowMessageUtils';

type UseFlowHydrationMessagesOptions = {
  vscode: any;
  reactFlowInstance: any;
  initialPipeline: any;
  maxLogLines: number;
  loadPipeline: (pipeline: any) => void;
  syncIdCounterFromNodes: (nodes: any[]) => void;
  setNodes: (updater: any) => void;
  setEdges: (updater: any) => void;
  setEnvironment: (value: Record<string, string>) => void;
  setCustomNodes: (nodes: any[]) => void;
  setRunPillStatus: (updater: (previous: 'idle' | 'running' | 'success' | 'error') => 'idle' | 'running' | 'success' | 'error') => void;
};

export function useFlowHydrationMessages(options: UseFlowHydrationMessagesOptions) {
  const {
    vscode,
    reactFlowInstance,
    initialPipeline,
    maxLogLines,
    loadPipeline,
    syncIdCounterFromNodes,
    setNodes,
    setEdges,
    setEnvironment,
    setCustomNodes,
    setRunPillStatus
  } = options;

  useEffect(() => {
    let restoredFromState = false;
    try {
      const state = vscode?.getState?.() || {};
      if (state.graph?.nodes && state.graph?.edges) {
        setNodes(state.graph.nodes);
        setEdges(state.graph.edges);
        syncIdCounterFromNodes(state.graph.nodes);
        setTimeout(() => reactFlowInstance?.fitView(), 100);
        restoredFromState = true;
      }
    } catch {
      // ignore
    }

    if (!restoredFromState && initialPipeline) {
      loadPipeline(initialPipeline);
    }

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

        case 'customNodesUpdate':
          setCustomNodes((typed as any).nodes || []);
          break;

        case 'loadPipeline':
          try {
            loadPipeline((typed as any).pipeline);
          } catch (error) {
            console.warn('[IntentRouter] loadPipeline failed', error);
          }
          break;

        case 'executionStatus': {
          const normalizedStatus = normalizeExecutionStatus(typed.status);
          setRunPillStatus((previous) => computeNextRunPillStatus(previous, normalizedStatus));
          setNodes((nodes: any[]) => applyExecutionStatusToNodes(nodes, {
            status: normalizedStatus,
            intentId: typed.intentId,
            stepId: typed.stepId,
            index: typed.index
          }));
          break;
        }

        case 'stepLog':
          setNodes((nodes: any[]) => applyStepLogToNodes(nodes, {
            stepId: typed.stepId,
            intentId: typed.intentId,
            text: typed.text,
            stream: typed.stream
          }, maxLogLines));
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [
    initialPipeline,
    loadPipeline,
    maxLogLines,
    reactFlowInstance,
    setCustomNodes,
    setEdges,
    setEnvironment,
    setNodes,
    setRunPillStatus,
    syncIdCounterFromNodes,
    vscode
  ]);
}
