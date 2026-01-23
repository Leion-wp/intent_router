import * as vscode from 'vscode';
import { registerCapabilities } from '../registry';

export function registerDockerProvider(context: vscode.ExtensionContext) {
    const dockerExtension = vscode.extensions.getExtension('ms-azuretools.vscode-docker');
    if (!dockerExtension) {
        return; // Strict discovery: if not present, do not register.
    }

    if (!dockerExtension.isActive) {
        dockerExtension.activate().then(() => doRegister(), () => {});
    } else {
        doRegister();
    }
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
                    { name: 'tag', type: 'string', description: 'Image tag' },
                    { name: 'path', type: 'string', description: 'Context path', default: '.' }
                ]
            },
            {
                capability: 'docker.run',
                command: 'vscode-docker.containers.start',
                description: 'Run a Docker container',
                args: [
                    { name: 'image', type: 'string', description: 'Image ID or name' }
                ]
            },
            {
                capability: 'docker.logs',
                command: 'vscode-docker.containers.viewLogs',
                description: 'View logs for a container',
                args: []
            }
        ]
    });
    console.log('[Intent Router] Registered Docker provider capabilities.');
}

export const dockerTemplates: Record<string, any> = {
    'docker.build': { "tag": "myapp:latest", "path": "." },
    'docker.run': { "image": "myapp:latest" },
    'docker.logs': {}
};
