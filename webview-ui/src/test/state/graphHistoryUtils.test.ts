import * as assert from 'assert';
import {
  canRedoGraph,
  canUndoGraph,
  pushGraphSnapshot
} from '../../utils/graphHistoryUtils';

export function run() {
  let history: any[] = [];
  let index = -1;

  const first = pushGraphSnapshot({
    history,
    index,
    nextNodes: [{ id: 'n1' }],
    nextEdges: [],
    maxSnapshots: 3
  });
  history = first.history;
  index = first.index;
  assert.strictEqual(first.changed, true);
  assert.strictEqual(history.length, 1);
  assert.strictEqual(index, 0);

  const duplicate = pushGraphSnapshot({
    history,
    index,
    nextNodes: [{ id: 'n1' }],
    nextEdges: [],
    maxSnapshots: 3
  });
  assert.strictEqual(duplicate.changed, false);
  assert.strictEqual(duplicate.history.length, 1);

  const second = pushGraphSnapshot({
    history,
    index,
    nextNodes: [{ id: 'n2' }],
    nextEdges: [],
    maxSnapshots: 3
  });
  history = second.history;
  index = second.index;
  assert.strictEqual(history.length, 2);
  assert.strictEqual(canUndoGraph(index), true);
  assert.strictEqual(canRedoGraph(index, history.length), false);
}
