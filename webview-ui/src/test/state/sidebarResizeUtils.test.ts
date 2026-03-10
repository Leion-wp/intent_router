import * as assert from 'assert';
import { computeSidebarWidthFromKey } from '../../utils/sidebarResizeUtils';

export function run() {
  assert.strictEqual(
    computeSidebarWidthFromKey({
      currentWidth: 300,
      key: 'ArrowLeft',
      minWidth: 220,
      maxWidth: 520,
      defaultWidth: 300
    }),
    284
  );

  assert.strictEqual(
    computeSidebarWidthFromKey({
      currentWidth: 512,
      key: 'ArrowRight',
      minWidth: 220,
      maxWidth: 520,
      defaultWidth: 300
    }),
    520
  );

  assert.strictEqual(
    computeSidebarWidthFromKey({
      currentWidth: 401,
      key: 'Home',
      minWidth: 220,
      maxWidth: 520,
      defaultWidth: 300
    }),
    220
  );

  assert.strictEqual(
    computeSidebarWidthFromKey({
      currentWidth: 401,
      key: 'Enter',
      minWidth: 220,
      maxWidth: 520,
      defaultWidth: 300
    }),
    300
  );
}
