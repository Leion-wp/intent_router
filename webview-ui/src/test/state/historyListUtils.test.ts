import * as assert from 'assert';
import { computeHistoryWindow, filterHistoryRuns } from '../../utils/historyListUtils';

export function run() {
  const history = [
    { name: 'Build A', status: 'success', timestamp: Date.parse('2026-02-01T10:00:00Z') },
    { name: 'Deploy B', status: 'failure', timestamp: Date.parse('2026-02-01T11:00:00Z') }
  ];
  const filtered = filterHistoryRuns(history, 'deploy failure');
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].name, 'Deploy B');

  const window = computeHistoryWindow({
    total: 300,
    scrollTop: 920,
    viewportHeight: 360,
    rowHeight: 92,
    overscan: 6
  });
  assert.strictEqual(window.startIndex, 4);
  assert.strictEqual(window.endIndex > window.startIndex, true);
}
