import * as assert from 'assert';
import { getNextQuickAddIndex, resolveQuickAddSubmitIndex } from '../../utils/quickAddNavigationUtils';

export function run() {
  assert.strictEqual(getNextQuickAddIndex(0, 'ArrowDown', 3), 1);
  assert.strictEqual(getNextQuickAddIndex(2, 'ArrowDown', 3), 2);
  assert.strictEqual(getNextQuickAddIndex(1, 'ArrowUp', 3), 0);
  assert.strictEqual(getNextQuickAddIndex(0, 'ArrowUp', 3), 0);
  assert.strictEqual(getNextQuickAddIndex(0, 'Enter', 3), null);

  assert.strictEqual(resolveQuickAddSubmitIndex(-1, 3), 0);
  assert.strictEqual(resolveQuickAddSubmitIndex(10, 3), 2);
  assert.strictEqual(resolveQuickAddSubmitIndex(1, 3), 1);
  assert.strictEqual(resolveQuickAddSubmitIndex(1, 0), null);
}
