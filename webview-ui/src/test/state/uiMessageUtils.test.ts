import * as assert from 'assert';
import { formatUiError, formatUiInfo, formatUiWarning } from '../../utils/uiMessageUtils';

export function run() {
  assert.strictEqual(
    formatUiError('bad payload', { context: 'Node Studio', action: 'Fix and retry.' }),
    'Error: Node Studio: bad payload — Fix and retry.'
  );

  assert.strictEqual(formatUiWarning('Warning: duplicated id'), 'Warning: duplicated id');
  assert.strictEqual(formatUiInfo('', { context: 'Propagate' }), 'Info: Propagate: Operation completed.');
}
