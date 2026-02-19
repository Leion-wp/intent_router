import { memo, useContext, useEffect, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext } from '../App';

const SubPipelineNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const [label, setLabel] = useState<string>(String((data as any)?.label || 'Sub-pipeline'));
  const [editingLabel, setEditingLabel] = useState<boolean>(false);
  const [pipelinePath, setPipelinePath] = useState<string>(String((data as any)?.pipelinePath || ''));
  const [dryRunChild, setDryRunChild] = useState<boolean>((data as any)?.dryRunChild === true);
  const [inputJson, setInputJson] = useState<string>(String((data as any)?.inputJson || ''));
  const [outputVar, setOutputVar] = useState<string>(String((data as any)?.outputVar || 'subpipeline_result'));
  const [status, setStatus] = useState<string>(String((data as any)?.status || 'idle'));
  const collapsed = !!(data as any)?.collapsed;

  useEffect(() => {
    if ((data as any)?.label !== undefined) setLabel(String((data as any)?.label || 'Sub-pipeline'));
    if ((data as any)?.pipelinePath !== undefined) setPipelinePath(String((data as any)?.pipelinePath || ''));
    if ((data as any)?.dryRunChild !== undefined) setDryRunChild((data as any)?.dryRunChild === true);
    if ((data as any)?.inputJson !== undefined) setInputJson(String((data as any)?.inputJson || ''));
    if ((data as any)?.outputVar !== undefined) setOutputVar(String((data as any)?.outputVar || 'subpipeline_result'));
    if ((data as any)?.status !== undefined) setStatus(String((data as any)?.status || 'idle'));
  }, [data]);

  const isRunning = status === 'running';
  const themeColor = '#7fb3ff';
  const handleStyle = {
    width: '12px',
    height: '12px',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 0 8px rgba(0,0,0,0.5)',
    zIndex: 10,
    transition: 'all 0.2s ease'
  };

  return (
    <div className={`glass-node ${isRunning ? 'running' : ''}`} style={{ minWidth: '320px' }}>
      <Handle type="target" position={Position.Left} id="in" style={{ ...handleStyle, left: '-6px', background: themeColor }} />
      <Handle type="source" position={Position.Right} id="success" style={{ ...handleStyle, top: '34%', right: '-6px', background: '#4caf50' }} />
      <Handle type="source" position={Position.Right} id="failure" style={{ ...handleStyle, top: '72%', right: '-6px', background: '#f44336' }} />

      <div className="glass-node-header" style={{ background: `linear-gradient(90deg, ${themeColor}22 0%, transparent 100%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div className="glass-node-icon" style={{ background: `linear-gradient(135deg, ${themeColor} 0%, #4f86d8 100%)` }}>
            <span className="codicon codicon-references" style={{ color: '#fff', fontSize: '16px' }}></span>
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
            <span onClick={() => setEditingLabel(true)} className="glass-node-label">{label || 'Sub-pipeline'}</span>
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
            <label className="glass-node-input-label">Pipeline path</label>
            <input
              className="nodrag"
              value={pipelinePath}
              onChange={(e) => { const next = e.target.value; setPipelinePath(next); updateNodeData(id, { pipelinePath: next }); }}
              placeholder="pipeline/child.intent.json"
            />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'var(--vscode-descriptionForeground)' }}>
            <input
              className="nodrag"
              type="checkbox"
              checked={dryRunChild}
              onChange={(e) => { const next = e.target.checked; setDryRunChild(next); updateNodeData(id, { dryRunChild: next }); }}
            />
            Run child as dry-run
          </label>
          <div className="glass-node-input-group">
            <label className="glass-node-input-label">Input JSON (optional)</label>
            <textarea
              className="nodrag"
              value={inputJson}
              onChange={(e) => { const next = e.target.value; setInputJson(next); updateNodeData(id, { inputJson: next }); }}
              rows={3}
              placeholder='{"idea_path":"docs/idea.md"}'
            />
          </div>
          <div className="glass-node-input-group">
            <label className="glass-node-input-label">Output variable</label>
            <input
              className="nodrag"
              value={outputVar}
              onChange={(e) => { const next = e.target.value; setOutputVar(next); updateNodeData(id, { outputVar: next }); }}
              placeholder="subpipeline_result"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(SubPipelineNode);
