import { useEffect, useRef } from 'react';

type UsePipelineAutosaveOptions = {
  vscode: any;
  pipelineUri: string | null | undefined;
  buildPipeline: (opts?: { allowedNodeIds?: Set<string> }) => any;
  nodes: any[];
  edges: any[];
  debounceMs?: number;
};

export function usePipelineAutosave(options: UsePipelineAutosaveOptions) {
  const {
    vscode,
    pipelineUri,
    buildPipeline,
    nodes,
    edges,
    debounceMs = 450
  } = options;
  const lastAutosavedRef = useRef<string>('');

  useEffect(() => {
    if (!pipelineUri || !vscode) {
      return;
    }

    const pipeline = buildPipeline();
    if (!pipeline) {
      return;
    }

    const serialized = JSON.stringify(pipeline);
    if (serialized === lastAutosavedRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      const latestPipeline = buildPipeline();
      if (!latestPipeline) return;
      const latestSerialized = JSON.stringify(latestPipeline);
      if (latestSerialized === lastAutosavedRef.current) return;
      lastAutosavedRef.current = latestSerialized;

      vscode.postMessage({
        type: 'savePipeline',
        pipeline: latestPipeline,
        silent: true
      });
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [buildPipeline, debounceMs, edges, nodes, pipelineUri, vscode]);
}
