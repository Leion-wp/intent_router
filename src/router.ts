import * as vscode from 'vscode';
import { Intent, UserMapping } from './types';
import { resolveCapabilities } from './registry';

export async function routeIntent(intent: Intent) {
    const userMappings = getUserMappings();
    const providers = resolveCapabilities(intent, userMappings);

    console.log(`Routing intent: ${intent.intent}`, intent);

    if (providers.length === 0) {
        vscode.window.showWarningMessage(`No capabilities resolved for intent: ${intent.intent}`);
        return;
    }

    for (const provider of providers) {
        try {
            if (provider.type && provider.type !== 'vscode') {
                console.warn(`Skipping non-VSCode provider type: ${provider.type} for ${provider.capability}`);
                continue;
            }

            const payload = provider.mapPayload ? provider.mapPayload(intent) : intent.payload;
            console.log(`Executing capability: ${provider.command}`);
            await vscode.commands.executeCommand(provider.command, payload);
        } catch (error) {
            console.error(`Failed to execute capability ${provider.command}:`, error);
            vscode.window.showErrorMessage(`Failed to execute ${provider.command}: ${error}`);
        }
    }
}

function getUserMappings(): UserMapping[] {
    const config = vscode.workspace.getConfiguration('intentRouter');
    const rawMappings = config.get<UserMapping[]>('mappings', []);

    if (!Array.isArray(rawMappings)) {
        return [];
    }

    return rawMappings.filter(m => !!m && typeof m.capability === 'string' && typeof m.command === 'string');
}
