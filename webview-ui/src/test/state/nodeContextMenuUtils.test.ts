import * as assert from 'assert';
import {
  canDeleteContextNode,
  canDisconnectContextNode,
  canRunFromContextNode,
  canToggleCollapseContextNode,
  isStartNodeId
} from '../../utils/nodeContextMenuUtils';

export function run() {
  assert.strictEqual(isStartNodeId('start'), true);
  assert.strictEqual(isStartNodeId(' node_1 '), false);

  assert.strictEqual(canRunFromContextNode('start'), false);
  assert.strictEqual(canDeleteContextNode('start'), false);
  assert.strictEqual(canToggleCollapseContextNode('start'), false);
  assert.strictEqual(canDisconnectContextNode('start'), false);

  assert.strictEqual(canRunFromContextNode('node_5'), true);
  assert.strictEqual(canDeleteContextNode('node_5'), true);
  assert.strictEqual(canToggleCollapseContextNode('node_5'), true);
  assert.strictEqual(canDisconnectContextNode('node_5'), true);
}
