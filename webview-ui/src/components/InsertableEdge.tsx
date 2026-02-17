import React from 'react';
import { BaseEdge, EdgeLabelRenderer, EdgeProps, getBezierPath } from '@xyflow/react';

const InsertableEdge = (props: EdgeProps) => {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    data
  } = props;

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      
      {/* Cyber Flow Dot (Animated) */}
      <circle
        r="4"
        fill="var(--ir-accent-primary)"
        className="edge-dot"
        style={{
          offsetPath: `path('${edgePath}')`,
          filter: 'drop-shadow(0 0 8px var(--ir-accent-primary))'
        }}
      />

      <EdgeLabelRenderer>
        <div
          className="edge-insert-btn"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            zIndex: 5
          }}
          onClick={(event) => event.stopPropagation()}
        >
          {(data as any)?.label && (
            <div
              style={{
                position: 'absolute',
                bottom: '26px',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(20, 20, 25, 0.9)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '12px',
                whiteSpace: 'nowrap',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
            >
              {(data as any).label}
            </div>
          )}
          <button
            className="nodrag"
            onClick={(event) => {
              event.stopPropagation();
              const onInsert = (data as any)?.onInsert;
              if (typeof onInsert === 'function') {
                onInsert(props, event.clientX, event.clientY);
              }
            }}
            title="Insert node"
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              background: 'var(--ir-accent-primary)',
              color: '#fff',
              cursor: 'pointer',
              fontSize: '16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              boxShadow: '0 4px 10px rgba(0, 162, 255, 0.4)',
              transition: 'transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}
          >
            <span className="codicon codicon-add" style={{ fontSize: '14px' }}></span>
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

export const edgeTypes = {
  insertable: InsertableEdge
};
