import { Edge, MarkerType, Node, Position } from '@xyflow/react';
import { canonicalizeIntent } from './pipelineUtils';

export function restoreGraphFromPipelineSnapshot(pipeline: any): { nodes: Node[]; edges: Edge[] } | null {
  if (!pipeline?.meta?.ui?.nodes || !pipeline?.meta?.ui?.edges) {
    return null;
  }
  if (!Array.isArray(pipeline.meta.ui.nodes) || !Array.isArray(pipeline.meta.ui.edges)) {
    return null;
  }

  const nodes = pipeline.meta.ui.nodes.map((node: any) => {
    if (node?.id === 'start') {
      const next = { ...node, type: 'startNode' };
      next.data = { ...(next.data || {}) };
      if (pipeline?.name) next.data.label = pipeline.name;
      if (pipeline?.description !== undefined) next.data.description = pipeline.description;
      return next;
    }
    if (node?.type === 'input') {
      return { ...node, type: 'startNode' };
    }
    return node;
  });

  return { nodes, edges: pipeline.meta.ui.edges };
}

export function buildGraphFromPipeline(
  pipeline: any,
  options: { getNextNodeId: () => string; failureColor?: string }
): { nodes: Node[]; edges: Edge[] } {
  const { getNextNodeId, failureColor = '#f44336' } = options;
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  nodes.push({
    id: 'start',
    type: 'startNode',
    data: { label: pipeline?.name || 'My Pipeline', description: pipeline?.description || '' },
    position: { x: 250, y: 50 },
    sourcePosition: Position.Right,
    deletable: false
  });

  const baseX = 450;
  const baseY = 50;
  const xSpacing = 320;
  const stepIdToNodeId = new Map<string, string>();
  const nodeIds: string[] = ['start'];

  if (Array.isArray(pipeline?.steps)) {
    pipeline.steps.forEach((step: any, index: number) => {
      const nodeId = step.id || getNextNodeId();
      const intent = step.intent || '';

      if (step.id) {
        stepIdToNodeId.set(step.id, nodeId);
      }

      let type = 'actionNode';
      let data: any = { status: 'idle' };

      if (intent === 'system.setVar') {
        type = 'promptNode';
        data.name = step.payload?.name;
        data.value = step.payload?.value;
        data.kind = 'prompt';
      } else if (intent === 'system.switch') {
        type = 'switchNode';
        data.label = String(step.description || 'Switch');
        data.variableKey = step.payload?.variableKey || '';
        data.routes = Array.isArray(step.payload?.routes) ? step.payload.routes.map((route: any) => ({
          label: String(route?.label || ''),
          condition: String(route?.condition || 'equals'),
          value: String(route?.value ?? route?.equalsValue ?? '')
        })) : [];
        data.kind = 'switch';
      } else if (intent === 'system.form') {
        type = 'formNode';
        data.fields = Array.isArray(step.payload?.fields) ? step.payload.fields : [];
        data.kind = 'form';
      } else if (intent === 'terminal.run' && String(step.payload?.__kind || '') === 'script') {
        type = 'scriptNode';
        data.scriptPath = String(step.payload?.scriptPath || '');
        data.args = Array.isArray(step.payload?.args)
          ? (step.payload.args as any[]).map((arg: any) => String(arg)).join(' ')
          : String(step.payload?.args || '');
        data.cwd = String(step.payload?.cwd || '');
        data.interpreter = String(step.payload?.interpreter || '');
        data.description = String(step.description || '');
        data.kind = 'script';
      } else if (intent === 'system.setCwd') {
        type = 'repoNode';
        data.path = step.payload?.path;
        data.kind = 'repo';
      } else if (intent === 'vscode.runCommand') {
        type = 'vscodeCommandNode';
        data.commandId = step.payload?.commandId;
        data.argsJson = typeof step.payload?.argsJson === 'string' ? step.payload.argsJson : '';
        data.kind = 'vscodeCommand';
      } else if (intent === 'ai.generate') {
        type = 'agentNode';
        data.agent = String(step.payload?.agent || 'gemini');
        data.model = String(step.payload?.model || 'gemini-2.5-flash');
        data.role = String(step.payload?.role || 'architect');
        data.reasoningEffort = String(step.payload?.reasoningEffort || 'medium');
        data.instruction = String(step.payload?.instruction || '');
        data.instructionTemplate = String(step.payload?.instructionTemplate || '');
        data.contextFiles = Array.isArray(step.payload?.contextFiles) ? step.payload.contextFiles : ['src/**/*.ts'];
        data.agentSpecFiles = Array.isArray(step.payload?.agentSpecFiles) ? step.payload.agentSpecFiles : ['AGENTS.md', '**/SKILL.md'];
        data.outputContract = String(step.payload?.outputContract || 'path_result');
        data.outputVar = String(step.payload?.outputVar || 'ai_result');
        data.outputVarPath = String(step.payload?.outputVarPath || 'ai_path');
        data.outputVarChanges = String(step.payload?.outputVarChanges || 'ai_changes');
        data.sessionId = String(step.payload?.sessionId || '');
        data.sessionMode = String(step.payload?.sessionMode || 'read_write');
        data.sessionResetBeforeRun = step.payload?.sessionResetBeforeRun === true;
        data.sessionRecallLimit = Number(step.payload?.sessionRecallLimit || 12);
        data.label = String(step.description || 'AI Task');
        data.kind = 'agent';
      } else if (intent === 'ai.team') {
        type = 'teamNode';
        data.label = String(step.description || 'AI Team');
        data.strategy = String(step.payload?.strategy || 'sequential');
        data.members = Array.isArray(step.payload?.members) ? step.payload.members : [];
        data.contextFiles = Array.isArray(step.payload?.contextFiles) ? step.payload.contextFiles : [];
        data.agentSpecFiles = Array.isArray(step.payload?.agentSpecFiles) ? step.payload.agentSpecFiles : ['AGENTS.md', '**/SKILL.md'];
        data.outputContract = String(step.payload?.outputContract || 'path_result');
        data.outputVar = String(step.payload?.outputVar || 'team_result');
        data.outputVarPath = String(step.payload?.outputVarPath || 'team_path');
        data.outputVarChanges = String(step.payload?.outputVarChanges || 'team_changes');
        data.reviewerVoteWeight = Number(step.payload?.reviewerVoteWeight || 2);
        data.sessionId = String(step.payload?.sessionId || '');
        data.sessionMode = String(step.payload?.sessionMode || 'read_write');
        data.sessionResetBeforeRun = step.payload?.sessionResetBeforeRun === true;
        data.sessionRecallLimit = Number(step.payload?.sessionRecallLimit || 12);
        data.kind = 'team';
      } else {
        type = 'actionNode';
        const normalized = canonicalizeIntent('', intent);
        data.provider = normalized.provider;
        data.capability = normalized.capability;
        data.args = { ...step.payload, description: step.description };
        data.kind = 'action';
      }

      nodes.push({
        id: nodeId,
        type,
        position: { x: baseX + index * xSpacing, y: baseY },
        data
      });
      nodeIds.push(nodeId);
    });

    if (pipeline.steps.length > 0) {
      const firstStepNodeId = nodeIds[1];
      edges.push({
        id: `e-start-${firstStepNodeId}`,
        source: 'start',
        target: firstStepNodeId,
        sourceHandle: 'success',
        targetHandle: 'in',
        markerEnd: { type: MarkerType.ArrowClosed }
      });
    }

    pipeline.steps.forEach((step: any, index: number) => {
      const currentNodeId = nodeIds[index + 1];

      if (step.intent === 'system.switch') {
        const routes = Array.isArray(step.payload?.routes) ? step.payload.routes : [];
        routes.forEach((route: any, routeIndex: number) => {
          const target = String(route?.targetStepId || '').trim();
          if (!target) return;
          const targetNodeId = stepIdToNodeId.get(target) || target;
          edges.push({
            id: `e-${currentNodeId}-route_${routeIndex}-${targetNodeId}`,
            source: currentNodeId,
            target: targetNodeId,
            sourceHandle: `route_${routeIndex}`,
            targetHandle: 'in',
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { label: String(route?.label || `route_${routeIndex}`) }
          } as any);
        });

        const defaultTarget = String(step.payload?.defaultStepId || '').trim();
        if (defaultTarget) {
          const targetNodeId = stepIdToNodeId.get(defaultTarget) || defaultTarget;
          edges.push({
            id: `e-${currentNodeId}-default-${targetNodeId}`,
            source: currentNodeId,
            target: targetNodeId,
            sourceHandle: 'default',
            targetHandle: 'in',
            markerEnd: { type: MarkerType.ArrowClosed },
            data: { label: 'default' }
          } as any);
        }
      } else if (index < pipeline.steps.length - 1) {
        const nextNodeId = nodeIds[index + 2];
        edges.push({
          id: `e-${currentNodeId}-${nextNodeId}`,
          source: currentNodeId,
          target: nextNodeId,
          sourceHandle: 'success',
          targetHandle: 'in',
          markerEnd: { type: MarkerType.ArrowClosed }
        });
      }

      if (step.onFailure) {
        const targetNodeId = stepIdToNodeId.get(step.onFailure);
        if (targetNodeId) {
          edges.push({
            id: `e-${currentNodeId}-${targetNodeId}-fail`,
            source: currentNodeId,
            target: targetNodeId,
            sourceHandle: 'failure',
            targetHandle: 'in',
            markerEnd: { type: MarkerType.ArrowClosed },
            style: { stroke: failureColor },
            animated: true
          });
        }
      }
    });
  }

  return { nodes, edges };
}
