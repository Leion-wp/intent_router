/**
 * HostBridge abstracts the communication layer between the Webview UI (React)
 * and its environment host (VS Code Desktop or Acode Android).
 */

export interface HostBridgeInterface {
  postMessage(message: any): void;
  onMessage(handler: (message: any) => void): () => void;
}

class HostBridge implements HostBridgeInterface {
  private isVsCode: boolean;
  private vscodeApi: any = null;

  constructor() {
    // Detect VS Code environment
    this.isVsCode = typeof (window as any).acquireVsCodeApi === 'function';
    if (this.isVsCode && !(window as any).vscode) {
      (window as any).vscode = (window as any).acquireVsCodeApi();
    }
    this.vscodeApi = (window as any).vscode;
  }

  postMessage(message: any): void {
    if (this.isVsCode && this.vscodeApi) {
      this.vscodeApi.postMessage(message);
    } else if (typeof (window as any).acodeBridge !== 'undefined' && (window as any).acodeBridge.postMessage) {
      (window as any).acodeBridge.postMessage(message);
    } else if (window.parent !== window) {
       // Fallback for iframe messaging (Acode could use this)
       window.parent.postMessage(message, '*');
    } else {
      console.warn('HostBridge: No valid host found to postMessage', message);
    }
  }

  onMessage(handler: (message: any) => void): () => void {
    const listener = (event: MessageEvent) => {
      // In VS Code or standard web messaging, event.data contains the message payload
      const message = event.data;
      if (message) {
        handler(message);
      }
    };

    window.addEventListener('message', listener);

    // Return a cleanup function
    return () => {
      window.removeEventListener('message', listener);
    };
  }
}

// Export a singleton instance
export const hostBridge = new HostBridge();
