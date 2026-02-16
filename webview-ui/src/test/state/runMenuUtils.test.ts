import * as assert from 'assert';
import { canRunFromSelection, getRunPillBackground } from '../../utils/runMenuUtils';

export function run() {
  assert.strictEqual(getRunPillBackground('idle'), 'var(--ir-run-idle)');
  assert.strictEqual(getRunPillBackground('running'), 'var(--ir-run-running)');
  assert.strictEqual(getRunPillBackground('success'), 'var(--ir-run-success)');
  assert.strictEqual(getRunPillBackground('error'), 'var(--ir-run-error)');

  assert.strictEqual(canRunFromSelection('node_1'), true);
  assert.strictEqual(canRunFromSelection('   '), false);
  assert.strictEqual(canRunFromSelection(null), false);
}
