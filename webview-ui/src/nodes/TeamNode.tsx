import { CSSProperties, memo, useContext, useEffect, useState } from 'react';
import { Handle, NodeProps, Position } from '@xyflow/react';
import { FlowEditorContext } from '../App';

type TeamMember = {
  name: string;
  role: 'writer' | 'reviewer';
  agent: string;
  model: string;
  instruction: string;
};

const DEFAULT_MEMBER: TeamMember = {
  name: 'member_1',
  role: 'writer',
  agent: 'gemini',
  model: 'gemini-2.5-flash',
  instruction: ''
};

const TeamNode = ({ data, id }: NodeProps) => {
  const { updateNodeData } = useContext(FlowEditorContext);
  const [label, setLabel] = useState<string>((data.label as string) || 'AI Team');
  const [strategy, setStrategy] = useState<string>((data.strategy as string) || 'sequential');
  const [members, setMembers] = useState<TeamMember[]>(
    Array.isArray(data.members) && data.members.length > 0 ? (data.members as TeamMember[]) : [DEFAULT_MEMBER]
  );
  const [contextFiles, setContextFiles] = useState<string[]>(
    Array.isArray(data.contextFiles) ? (data.contextFiles as string[]) : []
  );
  const [agentSpecFiles, setAgentSpecFiles] = useState<string[]>(
    Array.isArray(data.agentSpecFiles) ? (data.agentSpecFiles as string[]) : ['AGENTS.md', '**/SKILL.md']
  );
  const [outputVar, setOutputVar] = useState<string>((data.outputVar as string) || 'team_result');
  const [outputVarPath, setOutputVarPath] = useState<string>((data.outputVarPath as string) || 'team_path');
  const [outputVarChanges, setOutputVarChanges] = useState<string>((data.outputVarChanges as string) || 'team_changes');
  const [teamSummary, setTeamSummary] = useState<any>(data.teamSummary || null);

  useEffect(() => {
    if (data.label !== undefined) setLabel(String(data.label || 'AI Team'));
    if (data.strategy) setStrategy(String(data.strategy));
    if (Array.isArray(data.members) && data.members.length > 0) setMembers(data.members as TeamMember[]);
    if (Array.isArray(data.contextFiles)) setContextFiles(data.contextFiles as string[]);
    if (Array.isArray(data.agentSpecFiles)) setAgentSpecFiles(data.agentSpecFiles as string[]);
    if (data.outputVar) setOutputVar(String(data.outputVar));
    if (data.outputVarPath) setOutputVarPath(String(data.outputVarPath));
    if (data.outputVarChanges) setOutputVarChanges(String(data.outputVarChanges));
    setTeamSummary(data.teamSummary || null);
  }, [data]);

  const update = (patch: Record<string, any>) => updateNodeData(id, patch);
  const setMemberField = (index: number, key: keyof TeamMember, value: string) => {
    const next = members.map((member, memberIndex) => memberIndex === index ? { ...member, [key]: value } : member);
    setMembers(next);
    update({ members: next });
  };

  const addMember = () => {
    const nextIndex = members.length + 1;
    const next = [...members, { ...DEFAULT_MEMBER, name: `member_${nextIndex}` }];
    setMembers(next);
    update({ members: next });
  };

  const removeMember = (index: number) => {
    const next = members.filter((_, memberIndex) => memberIndex !== index);
    const safe = next.length > 0 ? next : [{ ...DEFAULT_MEMBER }];
    setMembers(safe);
    update({ members: safe });
  };

  return (
    <div style={{
      borderRadius: '14px',
      border: '2px solid rgba(103, 80, 164, 0.6)',
      background: 'rgba(23,20,34,0.92)',
      minWidth: '360px',
      color: '#ece8ff',
      fontFamily: 'var(--vscode-font-family)'
    }}>
      <Handle type="target" position={Position.Left} id="in" style={{ width: 12, height: 12, left: -10, background: '#7e57c2', border: '2px solid #1e1e23' }} />
      <Handle type="source" position={Position.Right} id="success" style={{ width: 12, height: 12, right: -10, top: '30%', background: '#4caf50', border: '2px solid #1e1e23' }} />
      <Handle type="source" position={Position.Right} id="failure" style={{ width: 12, height: 12, right: -10, top: '70%', background: '#f44336', border: '2px solid #1e1e23' }} />

      <div style={{ padding: '12px 14px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span className="codicon codicon-organization" style={{ color: '#b39ddb' }}></span>
        <input
          className="nodrag"
          value={label}
          onChange={(event) => { setLabel(event.target.value); update({ label: event.target.value }); }}
          style={{ flex: 1, background: 'rgba(0,0,0,0.25)', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '4px 8px', fontSize: 12 }}
        />
      </div>

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div>
          <label style={{ fontSize: 10, color: '#aaa', display: 'block', marginBottom: 4 }}>Strategy</label>
          <select
            className="nodrag"
            value={strategy}
            onChange={(event) => { setStrategy(event.target.value); update({ strategy: event.target.value }); }}
            style={{ width: '100%', background: '#151322', color: '#fff', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '6px 8px', fontSize: 11 }}
          >
            <option value="sequential">sequential</option>
            <option value="reviewer_gate">reviewer_gate (next)</option>
            <option value="vote">vote (next)</option>
          </select>
        </div>

        <div style={{ fontSize: 10, color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Members</span>
          <button className="nodrag" onClick={addMember} style={{ background: 'transparent', color: '#b39ddb', border: 'none', cursor: 'pointer' }}>
            <span className="codicon codicon-add"></span>
          </button>
        </div>
        {members.map((member, index) => (
          <div key={`${member.name}-${index}`} style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              <input className="nodrag" value={member.name} onChange={(event) => setMemberField(index, 'name', event.target.value)} placeholder="name" style={inputStyle} />
              <select className="nodrag" value={member.role || 'writer'} onChange={(event) => setMemberField(index, 'role', event.target.value as 'writer' | 'reviewer')} style={inputStyle}>
                <option value="writer">writer</option>
                <option value="reviewer">reviewer</option>
              </select>
              <select className="nodrag" value={member.agent || 'gemini'} onChange={(event) => setMemberField(index, 'agent', event.target.value)} style={inputStyle}>
                <option value="gemini">gemini</option>
                <option value="codex">codex</option>
              </select>
            </div>
            <input className="nodrag" value={member.model || ''} onChange={(event) => setMemberField(index, 'model', event.target.value)} placeholder="model" style={inputStyle} />
            <textarea className="nodrag" value={member.instruction || ''} onChange={(event) => setMemberField(index, 'instruction', event.target.value)} placeholder="instruction" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
            <button className="nodrag" onClick={() => removeMember(index)} style={{ ...miniButtonStyle, alignSelf: 'flex-end' }}>
              Remove member
            </button>
          </div>
        ))}

        <ContextList
          title="Context Files"
          values={contextFiles}
          onChange={(next) => { setContextFiles(next); update({ contextFiles: next }); }}
          placeholder="src/**/*.ts"
        />
        <ContextList
          title="Agent Spec Files"
          values={agentSpecFiles}
          onChange={(next) => { setAgentSpecFiles(next); update({ agentSpecFiles: next }); }}
          placeholder="AGENTS.md"
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <input className="nodrag" value={outputVar} onChange={(event) => { setOutputVar(event.target.value); update({ outputVar: event.target.value }); }} placeholder="team_result" style={inputStyle} />
          <input className="nodrag" value={outputVarPath} onChange={(event) => { setOutputVarPath(event.target.value); update({ outputVarPath: event.target.value }); }} placeholder="team_path" style={inputStyle} />
          <input className="nodrag" value={outputVarChanges} onChange={(event) => { setOutputVarChanges(event.target.value); update({ outputVarChanges: event.target.value }); }} placeholder="team_changes" style={inputStyle} />
        </div>

        {teamSummary && (
          <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: 8, background: 'rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#cfc7e8', marginBottom: 6 }}>
              <span>Team Summary</span>
              <span>{String(teamSummary.strategy || 'sequential')}</span>
            </div>
            <div style={{ fontSize: 10, color: '#b6adcf', marginBottom: 6 }}>
              Winner: {String(teamSummary.winnerMember || 'n/a')} · Total files: {Number(teamSummary.totalFiles || 0)}
            </div>
            {teamSummary.winnerReason && (
              <div style={{ fontSize: 10, color: '#cbbde9', marginBottom: 6 }}>
                Reason: {String(teamSummary.winnerReason)}
              </div>
            )}
            {Array.isArray(teamSummary.voteScoreByMember) && teamSummary.voteScoreByMember.length > 0 && (
              <div style={{ marginBottom: 6, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: 6 }}>
                <div style={{ fontSize: 10, color: '#cfc7e8', marginBottom: 4 }}>Vote Scores</div>
                {teamSummary.voteScoreByMember.map((entry: any, index: number) => (
                  <div key={`${entry?.member || 'member'}-${index}`} style={{ fontSize: 10, color: '#ddd', display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 6 }}>
                    <span>{String(entry?.member || `member_${index + 1}`)}</span>
                    <span>{String(entry?.role || 'writer')}</span>
                    <span>w={Number(entry?.weight || 1)}</span>
                    <span>s={Number(entry?.score || 0)}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {(Array.isArray(teamSummary.members) ? teamSummary.members : []).map((entry: any, index: number) => (
                <div key={`${entry?.name || 'member'}-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 6, fontSize: 10, color: '#ddd' }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {String(entry?.name || `member_${index + 1}`)} ({String(entry?.role || 'writer')})
                  </span>
                  <span>{String(entry?.path || 'n/a')}</span>
                  <span>{Number(entry?.files || 0)} file(s)</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function ContextList(props: {
  title: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const { title, values, onChange, placeholder } = props;
  return (
    <div>
      <div style={{ fontSize: 10, color: '#aaa', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span>{title}</span>
        <button className="nodrag" onClick={() => onChange([...(values || []), ''])} style={{ background: 'transparent', color: '#b39ddb', border: 'none', cursor: 'pointer' }}>
          <span className="codicon codicon-add"></span>
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {(values || []).map((entry, index) => (
          <div key={`${title}-${index}`} style={{ display: 'flex', gap: 4 }}>
            <input
              className="nodrag"
              value={entry}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              className="nodrag"
              onClick={() => onChange(values.filter((_, valueIndex) => valueIndex !== index))}
              style={miniButtonStyle}
            >
              <span className="codicon codicon-trash"></span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  background: '#151322',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 11
};

const miniButtonStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: '#ddd',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6,
  padding: '4px 6px',
  fontSize: 10,
  cursor: 'pointer'
};

export default memo(TeamNode);
