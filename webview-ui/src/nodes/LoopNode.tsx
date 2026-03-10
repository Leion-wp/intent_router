import { memo, useContext, useEffect, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext } from '../App';

const LoopNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const [label, setLabel] = useState<string>(String((data as any)?.label || 'Loop'));
  const [editingLabel, setEditingLabel] = useState<boolean>(false);
  const [items, setItems] = useState<string>(String((data as any)?.items || ''));
  const [executionMode, setExecutionMode] = useState<string>(
    String((data as any)?.executionMode || (((data as any)?.pipelinePath ? 'child_pipeline' : 'graph_segment')))
  );
  const [repeatCount, setRepeatCount] = useState<number>(Number((data as any)?.repeatCount || 1));
  const [bodyStepIds, setBodyStepIds] = useState<string>(String((data as any)?.bodyStepIds || ''));
  const [pipelinePath, setPipelinePath] = useState<string>(String((data as any)?.pipelinePath || ''));
  const [itemVar, setItemVar] = useState<string>(String((data as any)?.itemVar || 'loop_item'));
  const [indexVar, setIndexVar] = useState<string>(String((data as any)?.indexVar || 'loop_index'));
  const [maxIterations, setMaxIterations] = useState<number>(Number((data as any)?.maxIterations || 20));
  const [dryRunChild, setDryRunChild] = useState<boolean>((data as any)?.dryRunChild === true);
  const [continueOnChildError, setContinueOnChildError] = useState<boolean>((data as any)?.continueOnChildError === true);
  const [errorStrategy, setErrorStrategy] = useState<string>(String((data as any)?.errorStrategy || 'fail_fast'));
  const [errorThreshold, setErrorThreshold] = useState<number>(Number((data as any)?.errorThreshold || 1));
  const [outputVar, setOutputVar] = useState<string>(String((data as any)?.outputVar || 'loop_result'));
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    if ((data as any)?.label !== undefined) setLabel(String((data as any)?.label || 'Loop'));
    if ((data as any)?.items !== undefined) setItems(String((data as any)?.items || ''));
    if ((data as any)?.executionMode !== undefined) {
      setExecutionMode(String((data as any)?.executionMode || (((data as any)?.pipelinePath ? 'child_pipeline' : 'graph_segment'))));
    }
    if ((data as any)?.repeatCount !== undefined) setRepeatCount(Number((data as any)?.repeatCount || 1));
    if ((data as any)?.bodyStepIds !== undefined) setBodyStepIds(String((data as any)?.bodyStepIds || ''));
    if ((data as any)?.pipelinePath !== undefined) setPipelinePath(String((data as any)?.pipelinePath || ''));
    if ((data as any)?.itemVar !== undefined) setItemVar(String((data as any)?.itemVar || 'loop_item'));
    if ((data as any)?.indexVar !== undefined) setIndexVar(String((data as any)?.indexVar || 'loop_index'));
    if ((data as any)?.maxIterations !== undefined) setMaxIterations(Number((data as any)?.maxIterations || 20));
    if ((data as any)?.dryRunChild !== undefined) setDryRunChild((data as any)?.dryRunChild === true);
    if ((data as any)?.continueOnChildError !== undefined) setContinueOnChildError((data as any)?.continueOnChildError === true);
    if ((data as any)?.errorStrategy !== undefined) setErrorStrategy(String((data as any)?.errorStrategy || 'fail_fast'));
    if ((data as any)?.errorThreshold !== undefined) setErrorThreshold(Number((data as any)?.errorThreshold || 1));
    if ((data as any)?.outputVar !== undefined) setOutputVar(String((data as any)?.outputVar || 'loop_result'));
    if ((data as any)?.status !== undefined) setStatus(String((data as any)?.status || 'idle'));
  }, [data]);

  const isRunning = status === 'running';
  const bodyPreviewCount = bodyStepIds
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean).length || Number((data as any)?.bodyStepIdsResolvedCount || 0);
  const themeColor = '#79c37a';
  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    transition: 'all 0.2s ease'
  };

  return (
    <div className={`glass-node ${isRunning ? 'running' : ''}`} style={{ minWidth: '330px' }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-6px', background: themeColor }} />
      <Handle type="source" position={Position.Right} id="body" style={{ ...handleStyle, top: '28%', right: '-6px', background: '#4fc3f7' }} />
      <Handle type="source" position={Position.Right} id="done" style={{ ...handleStyle, top: '56%', right: '-6px', background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, top: '84%', right: '-6px', background: '#f44336' }} />
      <div style={{ position: 'absolute', right: '12px', top: '28%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 700, opacity: 0.55, pointerEvents: 'none', textTransform: 'uppercase' }}>body</div>
      <div style={{ position: 'absolute', right: '12px', top: '56%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 700, opacity: 0.55, pointerEvents: 'none', textTransform: 'uppercase' }}>done</div>
      <div style={{ position: 'absolute', right: '12px', top: '84%', transform: 'translateY(-50%)', fontSize: '10px', fontWeight: 700, opacity: 0.55, pointerEvents: 'none', textTransform: 'uppercase' }}>failure</div>

      <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}22 0%, transparent 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #5ca85d 100%)` }}>
            <span className="codicon codicon-sync" style={{ color: '#fff', fontSize: '16px' }}></span>
          </div>
          {editingLabel ? (
            <input
              className="nodrag"
              value={label}
              autoFocus
              onChange={(e) => { const next = e.target.value; setLabel(next); updateNodeData(id, { label: next }); }}
              onBlur={() => setEditingLabel(false)}
              onKeyDown={(e) => { if (e.key === 'Enter') setEditingLabel(false); }}
              style={{ width: '100%' }}
            />
          ) : (
            <span onClick={() => setEditingLabel(true)} className="glass-node-label">{label || 'Loop'}</span>
          )}
        </div>
        <button
          className="nodrag"
          onClick={() => updateNodeData(id, { collapsed: !collapsed })}
          style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#aaa', cursor: 'pointer', borderRadius: '6px', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <span className={`codicon codicon-chevron-${collapsed ? 'down' : 'up'}`} style={{ fontSize: '12px' }}></span>
        </button>
      </div>

      {!collapsed && (
        <div className="glass-node-body">
          <div className="glass-node-input-group">
            <label className="glass-node-input-label">Execution mode</label>
            <select
              className="nodrag"
              value={executionMode}
              onChange={(e) => { const next = String(e.target.value || 'child_pipeline'); setExecutionMode(next); updateNodeData(id, { executionMode: next }); }}
            >
              <option value="child_pipeline" style={{ background: '#1a1a20' }}>child_pipeline</option>
              <option value="graph_segment" style={{ background: '#1a1a20' }}>graph_segment</option>
            </select>
          </div>
          <div className="glass-node-input-group">
            <label className="glass-node-input-label">Items (CSV/JSON/variable template)</label>
            <input
              className="nodrag"
              value={items}
              onChange={(e) => { const next = e.target.value; setItems(next); updateNodeData(id, { items: next }); }}
              placeholder='${var:idea_list} or ["a","b"] or a,b,c'
            />
          </div>
          {executionMode === 'graph_segment' && (
            <>
              <div className="glass-node-input-group">
                <label className="glass-node-input-label">Body step ids (CSV, optional override)</label>
                <input
                  className="nodrag"
                  value={bodyStepIds}
                  onChange={(e) => { const next = e.target.value; setBodyStepIds(next); updateNodeData(id, { bodyStepIds: next }); }}
                  placeholder="node_3,node_4"
                />
              </div>
              <div style={{ fontSize: '10px', opacity: 0.75, marginTop: '-6px' }}>
                Body steps preview: {bodyPreviewCount} step(s)
              </div>
            </>
          )}
          <div className="glass-node-input-group">
            <label className="glass-node-input-label">Child pipeline path</label>
            <input
              className="nodrag"
              value={pipelinePath}
              onChange={(e) => { const next = e.target.value; setPipelinePath(next); updateNodeData(id, { pipelinePath: next }); }}
              placeholder="pipeline/child.intent.json"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Item var</label>
              <input className="nodrag" value={itemVar} onChange={(e) => { const next = e.target.value; setItemVar(next); updateNodeData(id, { itemVar: next }); }} />
            </div>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Index var</label>
              <input className="nodrag" value={indexVar} onChange={(e) => { const next = e.target.value; setIndexVar(next); updateNodeData(id, { indexVar: next }); }} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Max cycles</label>
              <input
                className="nodrag"
                type="number"
                min={1}
                value={maxIterations}
                onChange={(e) => {
                  const next = Number(e.target.value || 20);
                  const safe = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 20;
                  setMaxIterations(safe);
                  updateNodeData(id, { maxIterations: safe });
                }}
              />
            </div>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Repeat count</label>
              <input
                className="nodrag"
                type="number"
                min={1}
                value={repeatCount}
                onChange={(e) => {
                  const next = Number(e.target.value || 1);
                  const safe = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
                  setRepeatCount(safe);
                  updateNodeData(id, { repeatCount: safe });
                }}
              />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Output variable</label>
              <input className="nodrag" value={outputVar} onChange={(e) => { const next = e.target.value; setOutputVar(next); updateNodeData(id, { outputVar: next }); }} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
            <input className="nodrag" type="checkbox" checked={dryRunChild} onChange={(e) => { const next = e.target.checked; setDryRunChild(next); updateNodeData(id, { dryRunChild: next }); }} />
            Run child as dry-run
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
            <input className="nodrag" type="checkbox" checked={continueOnChildError} onChange={(e) => { const next = e.target.checked; setContinueOnChildError(next); updateNodeData(id, { continueOnChildError: next }); }} />
            Continue on child error
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Error strategy</label>
              <select
                className="nodrag"
                value={errorStrategy}
                onChange={(e) => { const next = String(e.target.value || 'fail_fast'); setErrorStrategy(next); updateNodeData(id, { errorStrategy: next }); }}
              >
                <option value="fail_fast" style={{ background: '#1a1a20' }}>fail_fast</option>
                <option value="fail_at_end" style={{ background: '#1a1a20' }}>fail_at_end</option>
                <option value="threshold" style={{ background: '#1a1a20' }}>threshold</option>
              </select>
            </div>
            <div className="glass-node-input-group">
              <label className="glass-node-input-label">Error threshold</label>
              <input
                className="nodrag"
                type="number"
                min={1}
                disabled={errorStrategy !== 'threshold'}
                value={errorThreshold}
                onChange={(e) => {
                  const next = Number(e.target.value || 1);
                  const safe = Number.isFinite(next) ? Math.max(1, Math.floor(next)) : 1;
                  setErrorThreshold(safe);
                  updateNodeData(id, { errorThreshold: safe });
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(LoopNode);
