import * as vscode from 'vscode';

function getWorkspaceRoot(): vscode.Uri {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!root) {
        throw new Error('Open a workspace folder first.');
    }
    return root;
}

export function resolveWorkspaceRelativeFile(pathValue: string): vscode.Uri {
    const rawPath = String(pathValue || '').trim().replace(/\\/g, '/');
    if (!rawPath) {
        throw new Error('Missing workspace-relative path.');
    }
    if (rawPath.startsWith('/') || rawPath.includes('..')) {
        throw new Error('Only safe workspace-relative paths are allowed.');
    }
    const parts = rawPath.split('/').map((part) => part.trim()).filter(Boolean);
    return vscode.Uri.joinPath(getWorkspaceRoot(), ...parts);
}

export async function readWorkspaceTextFile(pathValue: string): Promise<string> {
    const uri = resolveWorkspaceRelativeFile(pathValue);
    const bytes = await vscode.workspace.fs.readFile(uri);
    return Buffer.from(bytes).toString('utf8');
}

export async function fileExistsInWorkspace(pathValue: string): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(resolveWorkspaceRelativeFile(pathValue));
        return true;
    } catch {
        return false;
    }
}
