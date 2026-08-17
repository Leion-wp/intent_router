import * as http from 'http';
import * as net from 'net';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

const BRIDGE_PORT = 7782;
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

// ============================================
// CHROME BRIDGE — WebSocket server for Chrome extension
// ============================================
// Listens on ws://127.0.0.1:7782
// Chrome extension (background.js) connects as a client.
// Messages follow the chrome.* / vscode.* intent protocol.

export class ChromeBridge implements vscode.Disposable {
    private server: http.Server | undefined;
    private clients: Set<net.Socket> = new Set();
    private outputChannel: vscode.OutputChannel;
    private _onTabsUpdate?: (msg: ChromeMessage) => void;

    constructor(_context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('Chrome Bridge');
    }

    async start(): Promise<void> {
        this.server = http.createServer((_req, res) => {
            // Only WebSocket upgrades are accepted
            res.writeHead(426, { 'Content-Type': 'text/plain' });
            res.end('Upgrade Required');
        });

        this.server.on('upgrade', (req, socket, head) => {
            this.handleUpgrade(req, socket as net.Socket, head);
        });

        await new Promise<void>((resolve, reject) => {
            this.server!.once('error', reject);
            this.server!.listen(BRIDGE_PORT, '127.0.0.1', () => {
                this.server!.off('error', reject);
                resolve();
            });
        });

        this.log(`WebSocket server listening on ws://127.0.0.1:${BRIDGE_PORT}`);
    }

    private handleUpgrade(req: http.IncomingMessage, socket: net.Socket, _head: Buffer): void {
        const key = req.headers['sec-websocket-key'];
        if (!key) {
            socket.destroy();
            return;
        }

        const accept = crypto
            .createHash('sha1')
            .update(key + WS_MAGIC)
            .digest('base64');

        socket.write(
            'HTTP/1.1 101 Switching Protocols\r\n' +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
        );

        this.clients.add(socket);
        this.log(`Chrome extension connected (${this.clients.size} client(s))`);

        // Send greeting
        this.sendTo(socket, { type: 'vscode.hello', version: '1.0' });

        let buffer = Buffer.alloc(0);

        socket.on('data', (chunk: Buffer) => {
            buffer = Buffer.concat([buffer, chunk]);
            let parsed: string | null;
            while ((parsed = parseWsFrame(buffer)) !== null) {
                const frameLen = getFrameLength(buffer);
                buffer = buffer.slice(frameLen);
                try {
                    const msg: ChromeMessage = JSON.parse(parsed);
                    this.handleMessage(socket, msg);
                } catch (e) {
                    this.log(`Parse error: ${e}`);
                }
            }
        });

        socket.on('close', () => {
            this.clients.delete(socket);
            this.log(`Chrome extension disconnected (${this.clients.size} client(s))`);
        });

        socket.on('error', (err: Error) => {
            this.log(`Socket error: ${err.message}`);
            socket.destroy();
        });
    }

    private handleMessage(socket: net.Socket, msg: ChromeMessage): void {
        this.log(`← ${JSON.stringify(msg).slice(0, 300)}`);

        switch (msg.type) {
            case 'chrome.hello':
                this.log(`Handshake: ${msg.workspaces?.length ?? 0} workspace(s) reported`);
                // Trigger a tab fetch so VS Code has fresh data immediately
                this.sendTo(socket, { intent: 'chrome.getTabs' });
                break;

            case 'chrome.tabs':
                this._onTabsUpdate?.(msg);
                // Forward to any open WebView panels via VS Code command
                vscode.commands.executeCommand('intentRouter.chromeBridge.tabsUpdate', msg).then(
                    undefined, () => {} // Ignore if command not registered
                );
                break;

            case 'chrome.tabActivated':
            case 'chrome.tabCreated':
            case 'chrome.tabRemoved':
                this._onTabsUpdate?.(msg);
                vscode.commands.executeCommand('intentRouter.chromeBridge.tabsUpdate', msg).then(
                    undefined, () => {}
                );
                break;

            case 'chrome.workspaceCreated':
                this.log(`Workspace created in Chrome: ${JSON.stringify(msg.workspace)}`);
                break;

            // ── Debugger / screenshot events ──
            case 'chrome.screenshot':
                // Forward screenshot frame to WebView — do NOT log (high frequency + large payload)
                this._onTabsUpdate?.(msg);
                break;

            case 'chrome.debuggerAttached':
            case 'chrome.debuggerDetached':
            case 'chrome.debuggerError':
                this.log(`Debugger event: ${msg.type} tabId=${msg.tabId}${msg.type === 'chrome.debuggerError' ? ' error=' + msg.error : ''}`);
                this._onTabsUpdate?.(msg);
                break;
        }
    }

    // ============================================
    // PUBLIC API — called from pipeline intents
    // ============================================

    /** Open a single tab in Chrome */
    openTab(url: string, active = false): void {
        this.broadcast({ intent: 'chrome.openTab', url, active });
    }

    /** Open multiple tabs in Chrome */
    openTabs(urls: string[]): void {
        this.broadcast({ intent: 'chrome.openTabs', urls });
    }

    /** Create a new workspace in Chrome */
    createWorkspace(name: string, options: { color?: string; icon?: string; description?: string } = {}): void {
        this.broadcast({ intent: 'chrome.createWorkspace', name, ...options });
    }

    /** Activate focus mode on a workspace */
    focusMode(workspaceId: string): void {
        this.broadcast({ intent: 'chrome.focusMode', workspaceId });
    }

    /** Close a tab by ID */
    closeTab(tabId: number): void {
        this.broadcast({ intent: 'chrome.closeTab', tabId });
    }

    /** Request fresh tab data from Chrome */
    getTabs(): void {
        this.broadcast({ intent: 'chrome.getTabs' });
    }

    /** Attach CDP debugger to a tab and start screenshot streaming */
    attachDebugger(tabId: number): void {
        this.broadcast({ intent: 'chrome.attachDebugger', tabId });
    }

    /** Detach CDP debugger from the currently attached tab */
    detachDebugger(): void {
        this.broadcast({ intent: 'chrome.detachDebugger' });
    }

    /** Relay a mouse event to the debugged tab */
    dispatchMouseEvent(tabId: number, event: object): void {
        this.broadcast({ intent: 'chrome.mouseEvent', tabId, event });
    }

    /** Relay a keyboard event to the debugged tab */
    dispatchKeyEvent(tabId: number, event: object): void {
        this.broadcast({ intent: 'chrome.keyEvent', tabId, event });
    }

    /** Relay a scroll/wheel event to the debugged tab */
    scroll(tabId: number, x: number, y: number, deltaX: number, deltaY: number): void {
        this.broadcast({ intent: 'chrome.scroll', tabId, x, y, deltaX, deltaY });
    }

    /** Register a callback for tab updates */
    onTabsUpdate(fn: (msg: ChromeMessage) => void): void {
        this._onTabsUpdate = fn;
    }

    /** True if at least one Chrome extension is connected */
    get isConnected(): boolean {
        return this.clients.size > 0;
    }

    broadcast(msg: object): void {
        const frame = buildWsFrame(JSON.stringify(msg));
        for (const socket of this.clients) {
            try { socket.write(frame); } catch (e) {}
        }
    }

    private sendTo(socket: net.Socket, msg: object): void {
        try { socket.write(buildWsFrame(JSON.stringify(msg))); } catch (e) {}
    }

    private log(msg: string): void {
        this.outputChannel.appendLine(`[ChromeBridge ${new Date().toISOString().slice(11, 19)}] ${msg}`);
    }

    dispose(): void {
        for (const socket of this.clients) {
            try { socket.destroy(); } catch (e) {}
        }
        this.clients.clear();
        this.server?.close();
        this.outputChannel.dispose();
    }
}

// ============================================
// WEBSOCKET FRAME HELPERS (text frames only)
// ============================================

function parseWsFrame(buffer: Buffer): string | null {
    if (buffer.length < 2) return null;

    const masked = !!(buffer[1] & 0x80);
    let payloadLen = buffer[1] & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
        if (buffer.length < 4) return null;
        payloadLen = buffer.readUInt16BE(2);
        offset = 4;
    } else if (payloadLen === 127) {
        if (buffer.length < 10) return null;
        // 64-bit length — JS can't really handle >2^53 but cover the header
        payloadLen = buffer.readUInt32BE(6);
        offset = 10;
    }

    const maskLen = masked ? 4 : 0;
    if (buffer.length < offset + maskLen + payloadLen) return null;

    const mask = masked ? buffer.slice(offset, offset + 4) : null;
    offset += maskLen;

    const payload = Buffer.from(buffer.slice(offset, offset + payloadLen));
    if (mask) {
        for (let i = 0; i < payload.length; i++) {
            payload[i] ^= mask[i % 4];
        }
    }

    return payload.toString('utf8');
}

function getFrameLength(buffer: Buffer): number {
    if (buffer.length < 2) return 0;
    const masked = !!(buffer[1] & 0x80);
    let payloadLen = buffer[1] & 0x7f;
    let offset = 2;

    if (payloadLen === 126) { payloadLen = buffer.readUInt16BE(2); offset = 4; }
    else if (payloadLen === 127) { payloadLen = buffer.readUInt32BE(6); offset = 10; }

    return offset + (masked ? 4 : 0) + payloadLen;
}

function buildWsFrame(msg: string): Buffer {
    const payload = Buffer.from(msg, 'utf8');
    const len = payload.length;

    let header: Buffer;
    if (len < 126) {
        header = Buffer.from([0x81, len]);
    } else if (len < 65536) {
        header = Buffer.from([0x81, 126, (len >> 8) & 0xff, len & 0xff]);
    } else {
        header = Buffer.from([0x81, 127, 0, 0, 0, 0,
            (len >> 24) & 0xff, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
    }

    return Buffer.concat([header, payload]);
}

// ============================================
// TYPES
// ============================================

export interface ChromeMessage {
    type?: string;
    intent?: string;
    tabs?: ChromeTab[];
    workspaces?: ChromeWorkspace[];
    tab?: ChromeTab;
    tabId?: number;
    workspace?: ChromeWorkspace;
    url?: string;
    urls?: string[];
    workspaceId?: string;
    [key: string]: unknown;
}

export interface ChromeTab {
    id: number;
    url: string;
    title: string;
    favIconUrl?: string;
    active?: boolean;
    discarded?: boolean;
}

export interface ChromeWorkspace {
    id: string;
    name: string;
    icon?: string;
    color?: string;
    tabIds: number[];
}
