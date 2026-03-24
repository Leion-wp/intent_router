import * as assert from 'assert';
import { normalizeSidebarTabs } from '../../types/theme';

export function run() {
  const migrated = normalizeSidebarTabs([
    { id: 'nodes', title: 'NODES', icon: 'codicon-symbol-misc', type: 'pipelines', visible: true },
    { id: 'history', title: 'HISTORY', icon: 'codicon-history', type: 'history', visible: true },
    { id: 'env', title: 'ENV', icon: 'codicon-symbol-constant', type: 'settings', visible: true },
    { id: 'studio', title: 'STUDIO', icon: 'codicon-tools', type: 'studio', visible: true }
  ]);

  assert.strictEqual(migrated.some((tab) => tab.id === 'delivery' && tab.type === 'catalog' && tab.visible), true);
  assert.strictEqual(migrated.findIndex((tab) => tab.id === 'delivery') > migrated.findIndex((tab) => tab.id === 'nodes'), true);
}
