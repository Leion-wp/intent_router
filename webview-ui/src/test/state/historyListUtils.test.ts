import * as assert from 'assert';
import { computeHistoryWindow, filterHistoryRuns, getResumeFromFailedStepId } from '../../utils/historyListUtils';

export function run() {
  const history = [
    { name: 'Build A', status: 'success', timestamp: Date.parse('2026-02-01T10:00:00Z') },
    { name: 'Deploy B', status: 'failure', timestamp: Date.parse('2026-02-01T11:00:00Z') }
  ];
  const filtered = filterHistoryRuns(history, 'deploy failure');
  assert.strictEqual(filtered.length, 1);
  assert.strictEqual(filtered[0].name, 'Deploy B');

  const withPr = filterHistoryRuns([
    {
      name: 'Factory Run',
      status: 'success',
      timestamp: Date.parse('2026-02-01T12:00:00Z'),
      pullRequests: [
        { title: 'feat(frontend): TICKET-7', url: 'https://github.com/acme/repo/pull/77', head: 'feature/TICKET-7-frontend', base: 'main', number: 77, state: 'open', isDraft: false }
      ]
    }
  ], 'pull/77 frontend');
  assert.strictEqual(withPr.length, 1);
  const byState = filterHistoryRuns([
    {
      name: 'Factory Run',
      status: 'success',
      timestamp: Date.parse('2026-02-01T12:00:00Z'),
      pullRequests: [{ title: 'feat(api): TICKET-8', url: 'https://github.com/acme/repo/pull/78', head: 'feature/TICKET-8-backend', base: 'main', number: 78, state: 'merged', isDraft: false }]
    }
  ], 'merged 78');
  assert.strictEqual(byState.length, 1);
  assert.strictEqual(getResumeFromFailedStepId({
    steps: [
      { stepId: 'a', status: 'success' },
      { stepId: 'b', status: 'failure' },
      { stepId: 'c', status: 'failure' }
    ]
  }), 'b');
  assert.strictEqual(getResumeFromFailedStepId({
    steps: [{ status: 'failure' }]
  }), null);

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
