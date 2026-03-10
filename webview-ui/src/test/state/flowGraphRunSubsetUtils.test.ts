import * as assert from 'assert';
import { computeRunSubsetFromGraph } from '../../utils/flowGraphUtils';

export function run() {
  const nodes = [
    { id: 'start', type: 'startNode' },
    { id: 'prompt_1', type: 'promptNode' },
    { id: 'repo_1', type: 'repoNode' },
    { id: 'build', type: 'actionNode' },
    { id: 'deploy', type: 'actionNode' },
    { id: 'recover', type: 'actionNode' },
    { id: 'other', type: 'actionNode' }
  ];
  const edges = [
    { source: 'start', target: 'prompt_1' },
    { source: 'prompt_1', target: 'repo_1' },
    { source: 'repo_1', target: 'build' },
    { source: 'build', target: 'deploy' },
    { source: 'build', sourceHandle: 'failure', target: 'recover' },
    { source: 'start', target: 'other' }
  ];

  const subsetFromBuild = computeRunSubsetFromGraph('build', nodes, edges);
  assert.strictEqual(subsetFromBuild.preview.has('build'), true);
  assert.strictEqual(subsetFromBuild.preview.has('deploy'), true);
  assert.strictEqual(subsetFromBuild.allowed.has('recover'), true);
  assert.strictEqual(subsetFromBuild.allowed.has('prompt_1'), true);
  assert.strictEqual(subsetFromBuild.allowed.has('repo_1'), true);
  assert.strictEqual(subsetFromBuild.allowed.has('other'), false);

  const subsetFromStart = computeRunSubsetFromGraph('start', nodes, edges);
  assert.strictEqual(subsetFromStart.preview.has('other'), true);
  assert.strictEqual(subsetFromStart.allowed.has('recover'), true);
}
