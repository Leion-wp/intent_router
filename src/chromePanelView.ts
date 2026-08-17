import * as vscode from 'vscode';
import { generateSecureNonce } from './security';
import { ChromeBridge, ChromeMessage } from './chromeBridge';

// ============================================
// CHROME PANEL VIEW — WebView for Chrome Tabs
// ============================================
// Opens a singleton WebView panel that displays live Chrome tab data
// forwarded from the ChromeBridge WebSocket server.
//
// Usage:
//   chromePanelView.open()               — open or reveal the panel
//   chromePanelView.postMessage(msg)     — push a ChromeMessage to the WebView
//   chromeBridge.onTabsUpdate(msg => chromePanelView.postMessage(msg))  — wire live updates

export class ChromePanelView implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly bridge: ChromeBridge
    ) {}

    // ----------------------------------------
    // Open or reveal the panel
    // ----------------------------------------
    open(): void {
        if (this.panel) {
            // Panel already exists — just bring it to front
            this.panel.reveal(vscode.ViewColumn.Beside);
            // Re-request fresh tab data so the panel isn't stale
            this.bridge.getTabs();
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            'intentRouter.chromeTabs',
            'Chrome Tabs',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle'),
                    vscode.Uri.joinPath(this.extensionUri, 'media')
                ]
            }
        );

        this.panel = panel;

        // Set icon — reuse the extension icon if present, fallback to nothing
        try {
            panel.iconPath = {
                light: vscode.Uri.joinPath(this.extensionUri, 'media', 'chrome-tabs-light.svg'),
                dark:  vscode.Uri.joinPath(this.extensionUri, 'media', 'chrome-tabs-dark.svg')
            };
        } catch {
            // icon is optional — ignore if files don't exist
        }

        // Render the HTML shell
        panel.webview.html = this.getHtml(panel.webview);

        // Handle messages FROM the WebView (React component → bridge)
        panel.webview.onDidReceiveMessage(
            (message) => this.handleWebviewMessage(message),
            undefined,
            this.disposables
        );

        // Cleanup when the panel is closed by the user
        panel.onDidDispose(
            () => {
                // Detach debugger if a live viewer was open
                this.bridge.detachDebugger();
                this.panel = undefined;
                this.disposeLocal();
            },
            undefined,
            this.disposables
        );

        // Request fresh tabs immediately so the view has data on first load
        // Small delay to let the WebView React tree mount first
        setTimeout(() => {
            if (this.bridge.isConnected) {
                this.bridge.getTabs();
            } else {
                // Not connected yet — tell the WebView so it shows the right state
                this.postMessage({ type: 'chrome.disconnected' });
            }
        }, 300);
    }

    // ----------------------------------------
    // Forward a ChromeMessage to the WebView
    // ----------------------------------------
    postMessage(msg: ChromeMessage | { type: string; [key: string]: unknown }): void {
        if (this.panel) {
            this.panel.webview.postMessage(msg).then(undefined, () => {});
        }
    }

    // ----------------------------------------
    // Handle messages from the WebView React component
    // ----------------------------------------
    private handleWebviewMessage(message: any): void {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        switch (message.type) {
            // WebView requests fresh tab data
            case 'chromeBridge.getTabs':
                this.bridge.getTabs();
                break;

            // WebView sends a raw intent to Chrome (e.g. close tab, open tab)
            case 'chromeBridge.send': {
                const { type: _type, ...rest } = message;
                if (rest.intent) {
                    this.bridge.broadcast(rest);
                }
                break;
            }

            // WebView requests to open a URL in Chrome
            case 'chromeBridge.openTab':
                if (typeof message.url === 'string') {
                    this.bridge.openTab(message.url, !!message.active);
                }
                break;

            // WebView requests to close a Chrome tab
            case 'chromeBridge.closeTab':
                if (typeof message.tabId === 'number') {
                    this.bridge.closeTab(message.tabId);
                }
                break;

            // ── Debugger / live viewer messages ──

            // WebView mounts ChromeLiveViewer → attach CDP debugger to tab
            case 'chromeBridge.attachDebugger':
                if (typeof message.tabId === 'number') {
                    this.bridge.attachDebugger(message.tabId);
                }
                break;

            // WebView unmounts ChromeLiveViewer → detach CDP debugger
            case 'chromeBridge.detachDebugger':
                this.bridge.detachDebugger();
                break;

            // Mouse event from WebView canvas → relay to Chrome tab
            case 'chromeBridge.mouseEvent':
                if (typeof message.tabId === 'number' && message.event) {
                    this.bridge.dispatchMouseEvent(message.tabId, message.event as object);
                }
                break;

            // Keyboard event from WebView → relay to Chrome tab
            case 'chromeBridge.keyEvent':
                if (typeof message.tabId === 'number' && message.event) {
                    this.bridge.dispatchKeyEvent(message.tabId, message.event as object);
                }
                break;

            // Scroll/wheel event from WebView → relay to Chrome tab
            case 'chromeBridge.scroll':
                if (typeof message.tabId === 'number') {
                    this.bridge.scroll(
                        message.tabId,
                        Number(message.x) || 0,
                        Number(message.y) || 0,
                        Number(message.deltaX) || 0,
                        Number(message.deltaY) || 0
                    );
                }
                break;

            default:
                // Unknown message — ignore silently
                break;
        }
    }

    // ----------------------------------------
    // Generate the WebView HTML shell
    // ----------------------------------------
    private getHtml(webview: vscode.Webview): string {
        const nonce = generateSecureNonce();

        const scriptUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.js')
        );
        const styleUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'out', 'webview-bundle', 'index.css')
        );
        const codiconUri = webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, 'media', 'codicons', 'codicon.css')
        );

        // Pass mode flag so App.tsx early-returns <ChromeTabsPanel />
        const initialData = JSON.stringify({ mode: 'chromeTabs' })
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e');

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; style-src 'unsafe-inline' ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource}; img-src ${webview.cspSource} https: data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet" />
    <link href="${codiconUri}" rel="stylesheet" />
    <title>Chrome Tabs</title>
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.vscode = acquireVsCodeApi();
        window.initialData = ${initialData};
    </script>
    <script type="module" nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }

    // ----------------------------------------
    // Dispose helpers
    // ----------------------------------------
    private disposeLocal(): void {
        for (const d of this.disposables) {
            try { d.dispose(); } catch {}
        }
        this.disposables = [];
    }

    dispose(): void {
        this.disposeLocal();
        if (this.panel) {
            const p = this.panel;
            this.panel = undefined;
            p.dispose();
        }
    }
}
