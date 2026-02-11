import { useCallback } from 'react';

type RunPillStatus = 'idle' | 'running' | 'success' | 'error';

type UsePipelineRunActionsOptions = {
  vscode: any;
  buildPipeline: (opts?: { allowedNodeIds?: Set<string> }) => any;
  computeRunSubset: (startNodeId: string) => { allowed: Set<string>; preview: Set<string> };
  setRunPreviewIds: (value: Set<string> | any[]) => void;
  setRunPillStatus: (value: RunPillStatus) => void;
  setRunMenuOpen: (value: boolean) => void;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
};

export function usePipelineRunActions(options: UsePipelineRunActionsOptions) {
  const {
    vscode,
    buildPipeline,
    computeRunSubset,
    setRunPreviewIds,
    setRunPillStatus,
    setRunMenuOpen,
    setNodes
  } = options;

  const savePipeline = useCallback(() => {
    const pipeline = buildPipeline();
    if (!pipeline) return;

    if (vscode) {
      vscode.postMessage({
        type: 'savePipeline',
        pipeline
      });
    } else {
      console.log('Saved Pipeline (Mock):', pipeline);
    }
  }, [buildPipeline, vscode]);

  const runPipeline = useCallback((dryRun = false) => {
    const pipeline = buildPipeline();
    if (!pipeline) return;
    setRunPillStatus('running');
    setRunMenuOpen(false);

    if (vscode) {
      vscode.postMessage({
        type: 'runPipeline',
        pipeline,
        dryRun
      });
    } else {
      console.log('Run Pipeline (Mock):', pipeline);
    }
  }, [buildPipeline, setRunMenuOpen, setRunPillStatus, vscode]);

  const runPipelineFromHere = useCallback((nodeId: string, dryRun = false) => {
    const { allowed, preview } = computeRunSubset(nodeId);
    setRunPreviewIds(preview);
    const pipeline = buildPipeline({ allowedNodeIds: allowed });
    if (!pipeline) return;
    setRunPillStatus('running');
    setRunMenuOpen(false);

    if (vscode) {
      vscode.postMessage({
        type: 'runPipeline',
        pipeline,
        dryRun
      });
    } else {
      console.log('Run Pipeline From Here (Mock):', pipeline);
    }
  }, [buildPipeline, computeRunSubset, setRunMenuOpen, setRunPillStatus, setRunPreviewIds, vscode]);

  const resetRuntimeUiState = useCallback(() => {
    setRunPreviewIds([]);
    setRunPillStatus('idle');
    setNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        data: {
          ...node.data,
          status: 'idle'
        }
      }))
    );
  }, [setNodes, setRunPillStatus, setRunPreviewIds]);

  return {
    savePipeline,
    runPipeline,
    runPipelineFromHere,
    resetRuntimeUiState
  };
}
