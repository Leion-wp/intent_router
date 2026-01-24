import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

export function registerDockerProvider(context: vscode.ExtensionContext) {
    // V2 direction: Docker steps compile to terminal commands in the runner.
    // We still register schemas/templates for the builder and keep VS Code commands as a fallback for direct routing.
    doRegister();
}

function doRegister() {
    registerCapabilities({
        provider: 'docker',
        type: 'vscode',
        capabilities: [
            {
                capability: 'docker.build',
                command: 'vscode-docker.configure', // Best approximation for build workflow in V1
                description: 'Build a Docker image',
                args: [
                    { name: 'tag', type: 'string', description: 'Image tag', required: true },
                    { name: 'path', type: 'path', description: 'Context path', default: '.' }
                ]
            },
            {
                capability: 'docker.run',
                command: 'vscode-docker.containers.start',
                description: 'Run a Docker container',
                args: [
                    { name: 'image', type: 'string', description: 'Image ID or name', required: true },
                    { name: 'detach', type: 'boolean', description: 'Run in background', default: true }
                ]
            }
        ]
    });
    console.log('[Intent Router] Registered Docker provider capabilities.');
}

export const dockerTemplates: Record<string, any> = {
    'docker.build': { "tag": "myapp:latest", "path": "." },
    'docker.run': { "image": "myapp:latest", "detach": true }
};
