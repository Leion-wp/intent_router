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

        case 'approvalReviewReady':
          if (!typed.stepId) {
            break;
          }
          setNodes((nodes: any[]) => nodes.map((node: any) => {
            if (node.id !== typed.stepId) {
              return node;
            }
            return {
              ...node,
              data: {
                ...(node.data || {}),
                reviewRunId: typed.runId,
                reviewFiles: Array.isArray(typed.files) ? typed.files : [],
                reviewTotals: {
                  added: Number(typed.totalAdded || 0),
                  removed: Number(typed.totalRemoved || 0)
                },
                reviewPolicyMode: typed.policyMode || 'warn',
                reviewPolicyBlocked: !!typed.policyBlocked,
                reviewPolicyViolations: Array.isArray(typed.policyViolations) ? typed.policyViolations : []
              }
            };
          }));
          break;

        case 'teamRunSummary':
          if (!typed.stepId) {
            break;
          }
          setNodes((nodes: any[]) => nodes.map((node: any) => {
            if (node.id !== typed.stepId) {
              return node;
            }
            return {
              ...node,
              data: {
                ...(node.data || {}),
                teamSummary: {
                  runId: typed.runId,
                  strategy: typed.strategy,
                  winnerMember: typed.winnerMember,
                  winnerReason: typed.winnerReason,
                  voteScoreByMember: Array.isArray(typed.voteScoreByMember) ? typed.voteScoreByMember : [],
                  members: Array.isArray(typed.members) ? typed.members : [],
                  totalFiles: Number(typed.totalFiles || 0)
                }
              }
            };
          }));
          break;

        case 'sessionMemoryStatus':
          if (!typed.nodeId) {
            break;
          }
          setNodes((nodes: any[]) => nodes.map((node: any) => {
            if (node.id !== typed.nodeId) {
              return node;
            }
            return {
              ...node,
              data: {
                ...(node.data || {}),
                sessionMemoryStatus: {
                  sessionId: typed.sessionId || '',
                  entries: Number(typed.entries || 0),
                  lastTimestamp: Number(typed.lastTimestamp || 0)
                }
              }
            };
          }));
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
