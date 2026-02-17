import React from 'react';

type FlowToastsProps = {
  connectionError: string | null;
  setConnectionError?: (value: string | null) => void;
  graphToast: string | null;
};

function FlowToasts(props: FlowToastsProps) {
  const { connectionError, setConnectionError, graphToast } = props;

  return (
    <>
      {connectionError && (
        <div
          className="nodrag"
          role="alert"
          aria-live="assertive"
          style={{
            position: 'absolute',
            top: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 1300,
            padding: '12px 20px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 77, 77, 0.3)',
            background: 'rgba(25, 10, 10, 0.85)',
            backdropFilter: 'blur(20px)',
            color: '#ff4d4d',
            fontSize: '13px',
            fontWeight: 600,
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5), 0 0 20px rgba(255, 77, 77, 0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            animation: 'toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
        >
          <span className="codicon codicon-error" style={{ fontSize: '18px' }}></span>
          <div style={{ flex: 1 }}>{connectionError}</div>
          {setConnectionError && (
            <button
              onClick={() => setConnectionError(null)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                color: '#fff',
                cursor: 'pointer',
                borderRadius: '50%',
                width: '24px',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '8px'
              }}
            >
              <span className="codicon codicon-close" style={{ fontSize: '12px' }}></span>
            </button>
          )}
        </div>
      )}

      {graphToast && (
        <div
          className="nodrag"
          role="status"
          aria-live="polite"
          style={{
            position: 'absolute',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 995,
            background: 'rgba(20, 20, 25, 0.8)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '999px',
            padding: '8px 20px',
            fontSize: '12px',
            fontWeight: 500,
            color: '#fff',
            boxShadow: '0 10px 30px rgba(0, 0, 0, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            animation: 'toastIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
          }}
        >
          <span className="codicon codicon-info" style={{ fontSize: '14px', color: 'var(--ir-accent-primary)' }}></span>
          {graphToast}

          <style>{`
            @keyframes toastIn {
              from { transform: translateX(-50%) translateY(20px); opacity: 0; }
              to { transform: translateX(-50%) translateY(0); opacity: 1; }
            }
          `}</style>
        </div>
      )}
    </>
  );
}

export default React.memo(FlowToasts);
