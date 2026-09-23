import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clis = [
  path.join(root, 'bin/repowiki.mjs'),
  path.join(root, 'skills/repowiki-gen/scripts/repowiki.mjs'),
];
const source = 'src/中文.ts';
const page = 'content/测试.md';
const wiki = `---\nstatus: stable\ntype: overview\ntriggers: [测试]\ndescription: test\n---\n\n[claim](file://src/%E4%B8%AD%E6%96%87.ts#L4-L5)\n[duplicate](file://src/%E4%B8%AD%E6%96%87.ts#L4-L5)\n[single](file://src/%E4%B8%AD%E6%96%87.ts#L8)\n\n\`\`\`text\n[example](file://src/%E4%B8%AD%E6%96%87.ts#L2)\n\`\`\`\n`;

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function runCli(cwd, cli, ...args) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.error, undefined, result.error?.message);
  return result;
}

function fixture(cli) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'repowiki-citation-'));
  git(cwd, 'init', '-q');
  git(cwd, 'config', 'user.email', 'citation-check@example.invalid');
  git(cwd, 'config', 'user.name', 'Citation check');
  fs.mkdirSync(path.dirname(path.join(cwd, source)), { recursive: true });
  fs.writeFileSync(path.join(cwd, source), Array.from({ length: 8 }, (_, i) => `const n${i + 1} = ${i + 1};`).join('\n') + '\n');
  fs.mkdirSync(path.dirname(path.join(cwd, `docs/repowiki/${page}`)), { recursive: true });
  fs.writeFileSync(path.join(cwd, `docs/repowiki/${page}`), wiki);
  fs.writeFileSync(path.join(cwd, 'docs/repowiki/index.md'), '# Index\n');
  fs.mkdirSync(path.join(cwd, '.repowiki'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.repowiki/plan.json'), JSON.stringify({
    modules: [{ slug: 'core', dir: 'core', scope: ['src/**'] }],
    articles: [{ slug: 'test', file: page, modules: ['core'] }],
  }));
  git(cwd, 'add', 'src', 'docs/repowiki');
  git(cwd, 'commit', '-qm', 'baseline');
  const updated = runCli(cwd, cli, 'state', '--update', '--json');
  assert.equal(updated.status, 0, updated.stderr);
  const state = JSON.parse(fs.readFileSync(path.join(cwd, '.repowiki/state.json'), 'utf8'));
  assert.equal(state.citation_index_version, 1);
  assert.deepEqual(state.pages[page].citations, [
    { source, line_start: 4, line_end: 5, occurrences: 2 },
    { source, line_start: 8, line_end: 8, occurrences: 1 },
  ]);
  return cwd;
}

for (const cli of clis) {
  const cwd = fixture(cli);
  try {
    const sourcePath = path.join(cwd, source);
    const lines = fs.readFileSync(sourcePath, 'utf8').trimEnd().split('\n');
    lines.splice(2, 0, 'const insertedA = 9;', 'const insertedB = 10;');
    fs.writeFileSync(sourcePath, lines.join('\n') + '\n');
    git(cwd, 'add', source);
    git(cwd, 'commit', '-qm', 'insert lines before citations');
    let status = runCli(cwd, cli, 'status', '--json');
    assert.equal(status.status, 10);
    let report = JSON.parse(status.stdout);
    assert.equal(report.status, 'stale');
    assert.deepEqual(report.affected_pages, [page]);
    assert.equal(report.citation_index_available, true);
    assert.equal(report.citation_revalidation_candidates.length, 2);
    assert(report.citation_revalidation_candidates.every(x => x.reason === 'line_shift' && x.line_delta === 2));

    const afterInsert = fs.readFileSync(sourcePath, 'utf8').trimEnd().split('\n');
    afterInsert[5] = 'const n4 = changed;';
    fs.writeFileSync(sourcePath, afterInsert.join('\n') + '\n');
    git(cwd, 'add', source);
    git(cwd, 'commit', '-qm', 'change cited source line');
    status = runCli(cwd, cli, 'status', '--json');
    report = JSON.parse(status.stdout);
    assert(report.citation_revalidation_candidates.some(x => x.reason === 'changed_lines'));

  const unrelatedCwd = fixture(cli);
  try {
    const sourcePath = path.join(unrelatedCwd, source);
    const lines = fs.readFileSync(sourcePath, 'utf8').trimEnd().split('\n');
    lines[1] = 'const n2 = changed;';
    fs.writeFileSync(sourcePath, lines.join('\n') + '\n');
    git(unrelatedCwd, 'add', source);
    git(unrelatedCwd, 'commit', '-qm', 'change outside cited lines');
    const report = JSON.parse(runCli(unrelatedCwd, cli, 'status', '--json').stdout);
    assert.deepEqual(report.affected_pages, [page]);
    assert.deepEqual(report.citation_revalidation_candidates, []);
  } finally {
    fs.rmSync(unrelatedCwd, { recursive: true, force: true });
  }

  const legacyCwd = fixture(cli);
  try {
    const statePath = path.join(legacyCwd, '.repowiki/state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    delete state.citation_index_version;
    for (const entry of Object.values(state.pages)) delete entry.citations;
    fs.writeFileSync(statePath, JSON.stringify(state));
    const sourcePath = path.join(legacyCwd, source);
    const lines = fs.readFileSync(sourcePath, 'utf8').trimEnd().split('\n');
    lines[3] = 'const n4 = changed;';
    fs.writeFileSync(sourcePath, lines.join('\n') + '\n');
    git(legacyCwd, 'add', source);
    git(legacyCwd, 'commit', '-qm', 'change source with legacy state');
    const report = JSON.parse(runCli(legacyCwd, cli, 'status', '--json').stdout);
    assert.equal(report.citation_index_available, false);
    assert.deepEqual(report.citation_revalidation_candidates, []);
    assert.deepEqual(report.affected_pages, [page]);
  } finally {
    fs.rmSync(legacyCwd, { recursive: true, force: true });
  }
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
}

console.log('Citation-index and diff-impact checks passed for both CLI copies.');
