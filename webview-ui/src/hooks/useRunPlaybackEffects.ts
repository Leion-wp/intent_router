import { useEffect } from 'react';

type UseRunPlaybackEffectsOptions = {
  restoreRun: any;
  resumeRun: { run: any; startStepId: string } | null;
  selectedRun: any;
  loadPipeline: (pipeline: any) => void;
  onRestoreHandled: () => void;
  onResumeHandled: () => void;
  runPipelineFromSnapshotStep: (pipeline: any, startStepId: string, dryRun?: boolean) => void;
  setNodes: (updater: (nodes: any[]) => any[]) => void;
};

export function useRunPlaybackEffects(options: UseRunPlaybackEffectsOptions) {
  const {
    restoreRun,
    resumeRun,
    selectedRun,
    loadPipeline,
    onRestoreHandled,
    onResumeHandled,
    runPipelineFromSnapshotStep,
    setNodes
  } = options;

  useEffect(() => {
    if (restoreRun && restoreRun.pipelineSnapshot) {
      console.log('Restoring run:', restoreRun.name);
      loadPipeline(restoreRun.pipelineSnapshot);
      onRestoreHandled();
    }
  }, [restoreRun, loadPipeline, onRestoreHandled]);

  useEffect(() => {
    if (!resumeRun?.run?.pipelineSnapshot) return;
    const snapshot = resumeRun.run.pipelineSnapshot;
    const startStepId = String(resumeRun.startStepId || '').trim();
    if (!startStepId) {
      onResumeHandled();
      return;
    }
    loadPipeline(snapshot);
    runPipelineFromSnapshotStep(snapshot, startStepId, false);
    onResumeHandled();
  }, [resumeRun, loadPipeline, onResumeHandled, runPipelineFromSnapshotStep]);

  useEffect(() => {
    const timeouts: any[] = [];
    if (selectedRun) {
      setNodes((nodes) => nodes.map((node: any) => ({ ...node, data: { ...node.data, status: 'idle' } })));

      selectedRun.steps.forEach((step: any, index: number) => {
        const timeout = setTimeout(() => {
          setNodes((nodes) => {
            const stepId = String(step.stepId || '').trim();
            let targetNodeId: string | undefined;
            if (stepId) {
              const byId = nodes.find((entry: any) => String(entry.id) === stepId);
              if (byId) {
                targetNodeId = byId.id;
              }
            }
            if (!targetNodeId && typeof step.index === 'number') {
              targetNodeId = nodes.filter((entry: any) => entry.id !== 'start')[step.index]?.id;
            }
            if (!targetNodeId) return nodes;

            return nodes.map((entry: any) => (
              entry.id === targetNodeId
                ? {
                    ...entry,
                    data: {
                      ...entry.data,
                      status: String(step.status) === 'failure' ? 'error' : step.status
                    }
                  }
                : entry
            ));
          });
        }, (index + 1) * 600);
        timeouts.push(timeout);
      });
    }
    return () => timeouts.forEach(clearTimeout);
  }, [selectedRun, setNodes]);
}
