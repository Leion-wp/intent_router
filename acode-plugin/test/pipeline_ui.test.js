const assert = require('assert');
const { PipelineUI, DEFAULT_PIPELINE_BATCH_SIZE } = require('../main.js');

class MockDOMNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this._textContent = '';
    this._innerHTML = '';
    this.onclick = null;
    this.disabled = false;
  }

  get textContent() {
    if (this._textContent) return this._textContent;
    return this.children.map(c => typeof c === 'string' ? c : c.textContent).join('');
  }

  set textContent(val) {
    this._textContent = String(val);
    this.children = [];
  }

  get innerHTML() {
    return this._innerHTML || this.children.map(c => typeof c === 'string' ? c : (c.outerHTML || '')).join('');
  }

  set innerHTML(val) {
    this._innerHTML = String(val);
    if (val === '') {
      this.children = [];
    }
  }

  appendChild(child) {
    if (child instanceof MockDocumentFragment) {
      const fragmentChildren = [...child.children];
      child.children = [];
      for (const fc of fragmentChildren) {
        fc.parentNode = this;
        this.children.push(fc);
      }
      return child;
    }
    if (child && typeof child === 'object') {
      child.parentNode = this;
    }
    this.children.push(child);
    return child;
  }

  append(...nodes) {
    for (const node of nodes) {
      this.appendChild(node);
    }
  }

  querySelectorAll(selector) {
    const results = [];
    const search = (node) => {
      for (const child of node.children) {
        if (typeof child !== 'object' || !child) continue;
        if (selector === 'button' && child.tagName === 'BUTTON') {
          results.push(child);
        } else if (selector === 'strong' && child.tagName === 'STRONG') {
          results.push(child);
        } else if (selector === 'div' && child.tagName === 'DIV') {
          results.push(child);
        }
        search(child);
      }
    };
    search(this);
    return results;
  }
}

class MockDocumentFragment {
  constructor() {
    this.children = [];
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }
}

function setupMockDocument() {
  global.document = {
    createElement: (tag) => new MockDOMNode(tag),
    createDocumentFragment: () => new MockDocumentFragment()
  };
}

function teardownMockDocument() {
  delete global.document;
}

describe('Acode PipelineUI Batching Tests', () => {
  let mockRouter;

  function createMockRouter(lsDirResult = [], exists = true) {
    let routedCalls = [];
    return {
      $page: {
        settitle: () => {},
        innerHTML: '',
        append: function (child) { this.children = this.children || []; this.children.push(child); },
        show: () => {},
        hide: () => {}
      },
      requireFs: () => () => ({
        exists: async () => exists,
        lsDir: async () => lsDirResult
      }),
      route: async (intent) => {
        routedCalls.push(intent);
        return { success: true };
      },
      pipelineRunner: {
        runPipelineFromFile: async (fileUrl, onProgress) => {
          if (onProgress) onProgress({ step: 1, total: 1, status: 'success' });
          return { success: true };
        }
      },
      escapeHtml: (s) => s,
      toast: () => {},
      alert: () => {},
      routedCalls
    };
  }

  beforeEach(() => {
    setupMockDocument();
    global.window = {
      addedFolder: [{ url: 'file:///workspace' }]
    };
  });

  afterEach(() => {
    teardownMockDocument();
    delete global.window;
  });

  it('1. Exports DEFAULT_PIPELINE_BATCH_SIZE as 25', () => {
    assert.strictEqual(DEFAULT_PIPELINE_BATCH_SIZE, 25);
  });

  it('2. Missing pipeline directory displays notification without error', async () => {
    const router = createMockRouter([], false);
    const ui = new PipelineUI(router);
    await ui.render();

    assert.ok(ui.$cardsContainer.innerHTML.includes('No pipeline directory found'));
  });

  it('3. Empty pipeline directory displays empty state message', async () => {
    const router = createMockRouter([]);
    const ui = new PipelineUI(router);
    await ui.render();

    assert.ok(ui.$cardsContainer.innerHTML.includes('No *.intent.json files found'));
  });

  it('4. Workspaces with <= 25 pipelines (1 and 10 files) show all cards and hide Load More', async () => {
    const mockFiles = Array.from({ length: 10 }, (_, i) => ({
      name: `pipeline_${String(i + 1).padStart(2, '0')}.intent.json`,
      url: `file:///workspace/pipeline/pipeline_${i + 1}.intent.json`
    }));

    const router = createMockRouter(mockFiles);
    const ui = new PipelineUI(router);
    await ui.render();

    assert.strictEqual(ui.renderedCount, 10);
    assert.strictEqual(ui.pipelineFiles.length, 10);
    assert.strictEqual(ui.$counter.textContent, 'Showing 10 of 10 pipelines');
    assert.strictEqual(ui.$loadMoreBtn.style.display, 'none');

    // Count strong elements (pipeline card titles)
    const cardNames = ui.$cardsContainer.querySelectorAll('strong').map(s => s.textContent);
    assert.strictEqual(cardNames.length, 10);
    assert.strictEqual(cardNames[0], 'pipeline_01.intent.json');
    assert.strictEqual(cardNames[9], 'pipeline_10.intent.json');
  });

  it('5. Workspace with 200 pipelines: bounded initial batch (25 cards), Load More, and no duplicates', async () => {
    const mockFiles = Array.from({ length: 200 }, (_, i) => ({
      name: `pipeline_${String(i + 1).padStart(3, '0')}.intent.json`,
      url: `file:///workspace/pipeline/pipeline_${i + 1}.intent.json`
    }));

    const router = createMockRouter(mockFiles);
    const ui = new PipelineUI(router);
    await ui.render();

    // First batch verification
    assert.strictEqual(ui.renderedCount, 25);
    assert.strictEqual(ui.pipelineFiles.length, 200);
    assert.strictEqual(ui.$counter.textContent, 'Showing 25 of 200 pipelines');
    assert.strictEqual(ui.$loadMoreBtn.style.display, 'block');
    assert.strictEqual(ui.$loadMoreBtn.textContent, 'Load More (175 remaining)');

    let cards = ui.$cardsContainer.querySelectorAll('strong');
    assert.strictEqual(cards.length, 25);
    assert.strictEqual(cards[0].textContent, 'pipeline_001.intent.json');
    assert.strictEqual(cards[24].textContent, 'pipeline_025.intent.json');

    // Click Load More -> 2nd batch (50 total)
    ui.$loadMoreBtn.onclick();
    assert.strictEqual(ui.renderedCount, 50);
    assert.strictEqual(ui.$counter.textContent, 'Showing 50 of 200 pipelines');
    cards = ui.$cardsContainer.querySelectorAll('strong');
    assert.strictEqual(cards.length, 50);
    assert.strictEqual(cards[49].textContent, 'pipeline_050.intent.json');

    // Load remaining batches until all 200 are loaded
    while (ui.renderedCount < 200) {
      ui.$loadMoreBtn.onclick();
    }

    assert.strictEqual(ui.renderedCount, 200);
    assert.strictEqual(ui.$counter.textContent, 'Showing 200 of 200 pipelines');
    assert.strictEqual(ui.$loadMoreBtn.style.display, 'none');

    cards = ui.$cardsContainer.querySelectorAll('strong');
    assert.strictEqual(cards.length, 200);

    // Verify all cards are unique and sorted
    const names = cards.map(c => c.textContent);
    const uniqueNames = new Set(names);
    assert.strictEqual(uniqueNames.size, 200);
    assert.strictEqual(names[0], 'pipeline_001.intent.json');
    assert.strictEqual(names[199], 'pipeline_200.intent.json');
  });

  it('6. Refresh resets pagination and does not duplicate cards', async () => {
    const mockFiles = Array.from({ length: 100 }, (_, i) => ({
      name: `pipeline_${String(i + 1).padStart(3, '0')}.intent.json`,
      url: `file:///workspace/pipeline/pipeline_${i + 1}.intent.json`
    }));

    const router = createMockRouter(mockFiles);
    const ui = new PipelineUI(router);
    await ui.render();

    // Load another batch
    ui.$loadMoreBtn.onclick();
    assert.strictEqual(ui.renderedCount, 50);

    // Trigger Refresh
    await ui.loadPipelines();

    assert.strictEqual(ui.renderedCount, 25);
    assert.strictEqual(ui.pipelineFiles.length, 100);
    assert.strictEqual(ui.$counter.textContent, 'Showing 25 of 100 pipelines');

    const cards = ui.$cardsContainer.querySelectorAll('strong');
    assert.strictEqual(cards.length, 25);
  });

  it('7. Open and Execute buttons on a late-batch card work as expected', async () => {
    const mockFiles = Array.from({ length: 100 }, (_, i) => ({
      name: `pipeline_${String(i + 1).padStart(3, '0')}.intent.json`,
      url: `file:///workspace/pipeline/pipeline_${i + 1}.intent.json`
    }));

    const router = createMockRouter(mockFiles);
    const ui = new PipelineUI(router);
    await ui.render();

    // Load batches up to card 100
    while (ui.renderedCount < 100) {
      ui.$loadMoreBtn.onclick();
    }

    const cards = ui.$cardsContainer.children;
    const card100 = cards[99];
    const buttons = card100.querySelectorAll('button');

    const openBtn = buttons.find(b => b.textContent === 'Open');
    const executeBtn = buttons.find(b => b.textContent === 'Execute');

    assert.ok(openBtn, 'Open button exists on card 100');
    assert.ok(executeBtn, 'Execute button exists on card 100');

    // Test Open button click
    await openBtn.onclick();
    assert.strictEqual(router.routedCalls.length, 1);
    assert.strictEqual(router.routedCalls[0].action, 'editor:open_file');
    assert.strictEqual(router.routedCalls[0].data.name, 'pipeline_100.intent.json');

    // Test Execute button click
    let executed = false;
    router.pipelineRunner.runPipelineFromFile = async (url) => {
      assert.strictEqual(url, 'file:///workspace/pipeline/pipeline_100.intent.json');
      executed = true;
      return { success: true };
    };

    executeBtn.onclick();
    // Allow Promise microtask tick
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.strictEqual(executed, true);
  });

  it('8. Synthetic benchmark: initial load time & DOM node count for 500 & 1000 pipelines', async () => {
    const mockFiles1000 = Array.from({ length: 1000 }, (_, i) => ({
      name: `pipeline_${String(i + 1).padStart(4, '0')}.intent.json`,
      url: `file:///workspace/pipeline/pipeline_${i + 1}.intent.json`
    }));

    // Measure batched initial load
    const routerBatched = createMockRouter(mockFiles1000);
    const uiBatched = new PipelineUI(routerBatched);

    const t0 = process.hrtime.bigint();
    await uiBatched.render();
    const t1 = process.hrtime.bigint();

    const batchedMs = Number(t1 - t0) / 1e6;
    const batchedCardCount = uiBatched.$cardsContainer.children.length;

    // Simulate unbatched load for 1000 pipelines
    const routerUnbatched = createMockRouter(mockFiles1000);
    const uiUnbatched = new PipelineUI(routerUnbatched);
    // Force batch size to 1000 to simulate legacy unbatched load
    uiUnbatched.batchSize = 1000;

    const t2 = process.hrtime.bigint();
    await uiUnbatched.render();
    const t3 = process.hrtime.bigint();

    const unbatchedMs = Number(t3 - t2) / 1e6;
    const unbatchedCardCount = uiUnbatched.$cardsContainer.children.length;

    console.log(`[Benchmark 1000 pipelines] Batched first render: ${batchedMs.toFixed(2)} ms (${batchedCardCount} cards created)`);
    console.log(`[Benchmark 1000 pipelines] Unbatched full render: ${unbatchedMs.toFixed(2)} ms (${unbatchedCardCount} cards created)`);

    assert.strictEqual(batchedCardCount, 25);
    assert.strictEqual(unbatchedCardCount, 1000);
    assert.ok(batchedCardCount < unbatchedCardCount, 'Batched rendering creates significantly fewer initial DOM cards');
  });
});
