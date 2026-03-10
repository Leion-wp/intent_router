import * as assert from 'assert';
import { getNextSidebarTabIndex } from '../../utils/sidebarTabNavigationUtils';

export function run() {
  assert.strictEqual(getNextSidebarTabIndex(0, 'ArrowRight', 3), 1);
  assert.strictEqual(getNextSidebarTabIndex(0, 'ArrowLeft', 3), 2);
  assert.strictEqual(getNextSidebarTabIndex(1, 'Home', 3), 0);
  assert.strictEqual(getNextSidebarTabIndex(1, 'End', 3), 2);
  assert.strictEqual(getNextSidebarTabIndex(1, 'Enter', 3), null);
}
