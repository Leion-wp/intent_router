import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChromeTab } from './ChromeTabsPanel';

// ============================================
// CHROME LIVE VIEWER — Remote Desktop Component
// ============================================
// Attaches Chrome's CDP debugger to the selected tab via the bridge,
// receives JPEG screenshot frames at ~8fps, and relays mouse/keyboard
// events back so the user can fully control Chrome from VS Code.

interface Props {
    tabId: number;
    tab: ChromeTab;
    onClose: () => void;
}

// Assumed rendering size of the Chrome tab (used for coordinate scaling).
// Can be improved later with a Page.getLayoutMetrics CDP call on attach.
const TAB_RENDER_W = 1280;
const TAB_RENDER_H = 800;

const vscode = (window as any).vscode as {
    postMessage: (msg: unknown) => void;
} | undefined;

export default function ChromeLiveViewer({ tabId, tab, onClose }: Props) {
    const [screenshot, setScreenshot] = useState<string>('');
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fps, setFps] = useState(0);
    const imgRef = useRef<HTMLImageElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // FPS counter
    const frameCountRef = useRef(0);
    const lastFpsTimeRef = useRef(Date.now());

    // ── Attach / detach debugger on mount / unmount ──
    useEffect(() => {
        setConnected(false);
        setError(null);
        vscode?.postMessage({ type: 'chromeBridge.attachDebugger', tabId });

        return () => {
            vscode?.postMessage({ type: 'chromeBridge.detachDebugger' });
        };
    }, [tabId]);

    // ── Receive messages from VS Code extension ──
    useEffect(() => {
        const handle = (event: MessageEvent) => {
            const msg = event.data;
            if (!msg || typeof msg.type !== 'string') return;

            switch (msg.type) {
                case 'chrome.screenshot':
                    if (msg.tabId === tabId && msg.jpeg) {
                        setScreenshot(`data:image/jpeg;base64,${msg.jpeg}`);
                        setConnected(true);
                        setError(null);
                        // FPS counter
                        frameCountRef.current++;
                        const now = Date.now();
                        if (now - lastFpsTimeRef.current >= 1000) {
                            setFps(frameCountRef.current);
                            frameCountRef.current = 0;
                            lastFpsTimeRef.current = now;
                        }
                    }
                    break;

                case 'chrome.debuggerAttached':
                    if (msg.tabId === tabId) {
                        setConnected(true);
                        setError(null);
                    }
                    break;

                case 'chrome.debuggerDetached':
                    if (msg.tabId === tabId) {
                        setConnected(false);
                    }
                    break;

                case 'chrome.debuggerError':
                    if (msg.tabId === tabId) {
                        setError(String(msg.error || 'Unknown debugger error'));
                        setConnected(false);
                    }
                    break;
            }
        };

        window.addEventListener('message', handle);
        return () => window.removeEventListener('message', handle);
    }, [tabId]);

    // ── Mouse event relay ──
    const relayMouse = useCallback((e: React.MouseEvent, type: string) => {
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        // Scale WebView coordinates → Chrome tab render coordinates
        const scaleX = TAB_RENDER_W / rect.width;
        const scaleY = TAB_RENDER_H / rect.height;
        const x = Math.round((e.clientX - rect.left) * scaleX);
        const y = Math.round((e.clientY - rect.top) * scaleY);

        const button = e.button === 0 ? 'left' : e.button === 2 ? 'right' : 'middle';
        const modifiers =
            (e.shiftKey ? 8 : 0) |
            (e.ctrlKey  ? 2 : 0) |
            (e.altKey   ? 1 : 0) |
            (e.metaKey  ? 4 : 0);

        vscode?.postMessage({
            type: 'chromeBridge.mouseEvent',
            tabId,
            event: {
                type,
                x, y,
                button,
                buttons: e.buttons,
                clickCount: type === 'mousePressed' ? 1 : 0,
                modifiers,
            },
        });
    }, [tabId]);

    // ── Scroll relay ──
    const relayScroll = useCallback((e: React.WheelEvent) => {
        if (!imgRef.current) return;
        const rect = imgRef.current.getBoundingClientRect();
        const x = Math.round(e.clientX - rect.left);
        const y = Math.round(e.clientY - rect.top);
        vscode?.postMessage({
            type: 'chromeBridge.scroll',
            tabId,
            x, y,
            deltaX: e.deltaX,
            deltaY: e.deltaY,
        });
    }, [tabId]);

    // ── Keyboard relay ──
    const relayKey = useCallback((e: React.KeyboardEvent, type: string) => {
        e.preventDefault();
        const modifiers =
            (e.shiftKey ? 8 : 0) |
            (e.ctrlKey  ? 2 : 0) |
            (e.altKey   ? 1 : 0) |
            (e.metaKey  ? 4 : 0);

        // Send 'char' event for printable keys in addition to keyDown
        vscode?.postMessage({
            type: 'chromeBridge.keyEvent',
            tabId,
            event: {
                type,
                key: e.key,
                code: e.code,
                modifiers,
                nativeVirtualKeyCode: e.keyCode,
                windowsVirtualKeyCode: e.keyCode,
                text: (type === 'keyDown' && e.key.length === 1) ? e.key : undefined,
                unmodifiedText: (type === 'keyDown' && e.key.length === 1) ? e.key : undefined,
            },
        });
    }, [tabId]);

    const favicon = tab.favIconUrl
        ? <img src={tab.favIconUrl} alt="" style={{ width: 14, height: 14, borderRadius: 2, flexShrink: 0, objectFit: 'contain' }} />
        : <span className="codicon codicon-globe" style={{ fontSize: 14, flexShrink: 0 }} />;

    return (
        <div
            ref={containerRef}
            tabIndex={0}
            onKeyDown={e => relayKey(e, 'keyDown')}
            onKeyUp={e => relayKey(e, 'keyUp')}
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                background: 'var(--vscode-editor-background)',
                outline: 'none',
                userSelect: 'none',
            }}
        >
            {/* Header bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'var(--vscode-sideBar-background)',
                borderBottom: '1px solid var(--vscode-panel-border)',
                flexShrink: 0,
                minWidth: 0,
            }}>
                <button
                    onClick={onClose}
                    title="Back to tab list"
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--vscode-foreground)',
                        padding: '2px 4px',
                        borderRadius: 3,
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                    }}
                >
                    <span className="codicon codicon-arrow-left" />
                </button>

                {favicon}

                <span style={{
                    fontSize: 12,
                    color: 'var(--vscode-foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                    minWidth: 0,
                }}>
                    {tab.title || tab.url}
                </span>

                {/* Connection status dot */}
                <span title={connected ? `Live · ${fps}fps` : 'Connecting…'} style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: connected ? 'var(--vscode-testing-iconPassed, #4caf50)' : 'var(--vscode-testing-iconQueued, #f0ad4e)',
                    flexShrink: 0,
                    transition: 'background 0.3s',
                }} />

                {connected && fps > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--vscode-descriptionForeground)', flexShrink: 0 }}>
                        {fps}fps
                    </span>
                )}
            </div>

            {/* Viewport area */}
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#1a1a1a' }}>
                {/* Error state */}
                {error && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        color: 'var(--vscode-errorForeground)',
                        padding: 24,
                        textAlign: 'center',
                    }}>
                        <span className="codicon codicon-error" style={{ fontSize: 32 }} />
                        <div style={{ fontSize: 13, fontWeight: 600 }}>Debugger Error</div>
                        <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', maxWidth: 300 }}>
                            {error}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--vscode-descriptionForeground)', marginTop: 4 }}>
                            If Chrome DevTools is open on this tab, close it first.
                        </div>
                        <button
                            onClick={() => {
                                setError(null);
                                vscode?.postMessage({ type: 'chromeBridge.attachDebugger', tabId });
                            }}
                            style={{
                                marginTop: 8,
                                padding: '4px 12px',
                                background: 'var(--vscode-button-background)',
                                color: 'var(--vscode-button-foreground)',
                                border: 'none',
                                borderRadius: 3,
                                cursor: 'pointer',
                                fontSize: 12,
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Connecting state */}
                {!error && !screenshot && (
                    <div style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 10,
                        color: 'var(--vscode-descriptionForeground)',
                    }}>
                        <span className="codicon codicon-loading codicon-modifier-spin" style={{ fontSize: 24 }} />
                        <div style={{ fontSize: 12 }}>Connecting to tab…</div>
                        <div style={{ fontSize: 11, opacity: 0.7, maxWidth: 280, textAlign: 'center' }}>
                            Chrome will show a "DevTools is debugging this tab" banner — this is expected.
                        </div>
                    </div>
                )}

                {/* Live screenshot image */}
                {screenshot && (
                    <img
                        ref={imgRef}
                        src={screenshot}
                        alt="Live tab view"
                        draggable={false}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            cursor: 'crosshair',
                            display: 'block',
                        }}
                        onMouseMove={e => relayMouse(e, 'mouseMoved')}
                        onMouseDown={e => { containerRef.current?.focus(); relayMouse(e, 'mousePressed'); }}
                        onMouseUp={e => relayMouse(e, 'mouseReleased')}
                        onWheel={relayScroll}
                        onContextMenu={e => e.preventDefault()}
                    />
                )}
            </div>

            {/* Footer bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '3px 10px',
                background: 'var(--vscode-statusBar-background)',
                color: 'var(--vscode-statusBar-foreground)',
                fontSize: 11,
                flexShrink: 0,
            }}>
                <span className="codicon codicon-remote" style={{ fontSize: 11 }} />
                <span style={{ opacity: 0.8 }}>
                    {connected ? 'Streaming live' : 'Connecting…'}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>
                    {tab.url}
                </span>
            </div>
        </div>
    );
}
