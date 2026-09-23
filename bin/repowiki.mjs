#!/usr/bin/env node

// repowiki.mjs — Repo Wiki CLI: init / scan / state / status / validate
// Node.js ESM single file, zero third-party dependencies
// Only uses node: built-in modules (fs, path, crypto, child_process)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

// ─── Constants ───────────────────────────────────────────────────────────────

const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'vendor', 'dist', 'build', 'target',
  '__pycache__', '.venv', '.env', '.repowiki', 'repowiki',
  'third_party', '__pypackages__', '.gradle', '.next', '.nuxt',
  '.jekyll-cache', 'out', '.cache', '.pytest_cache',
  '.vscode-test', '.codesandbox', '_site', 'testdata',
]);

const KEY_FILE_PATTERNS = [
  '.env', '.npmrc', '.pypirc', '.ssh',
  '.key', '.pem', '_rsa', '_dsa', '_ed25519', '_ecdsa',
  'secret.json', 'secret.yaml', 'secret.yml',
  '.p12', '.pfx', 'id_rsa', 'id_ecdsa', 'id_ed25519',
];

const MAX_FILE_SIZE = 1 * 1024 * 1024; // 1 MB default

const LANG_MAP = new Map([
  ['.ts', 'typescript'], ['.tsx', 'typescript'], ['.mts', 'typescript'],
  ['.js', 'javascript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'], ['.jsx', 'javascript'],
  ['.go', 'go'],
  ['.py', 'python'],
  ['.rs', 'rust'],
  ['.java', 'java'],
  ['.cs', 'csharp'],
  ['.rb', 'ruby'],
  ['.php', 'php'],
  ['.swift', 'swift'],
  ['.kt', 'kotlin'], ['.kts', 'kotlin'],
  ['.scala', 'scala'],
  ['.md', 'markdown'], ['.mdx', 'markdown'],
  ['.json', 'json'],
  ['.yaml', 'yaml'], ['.yml', 'yaml'],
  ['.toml', 'toml'],
  ['.css', 'css'], ['.scss', 'scss'], ['.less', 'less'],
  ['.html', 'html'], ['.htm', 'html'],
  ['.sql', 'sql'],
  ['.sh', 'shell'], ['.bash', 'shell'],
  ['.ps1', 'powershell'], ['.psm1', 'powershell'],
  ['.dockerfile', 'dockerfile'],
  ['.xml', 'xml'], ['.svg', 'xml'],
  ['.proto', 'protobuf'],
  ['.vue', 'vue'],
  ['.svelte', 'svelte'],
  ['.c', 'c'], ['.h', 'c'],
  ['.cpp', 'cpp'], ['.hpp', 'cpp'], ['.cc', 'cpp'], ['.cxx', 'cpp'],
  ['.zig', 'zig'],
]);

const STATE_SCHEMA = 1;

// AGENTS.md managed-block markers (owned by `repowiki init`; manual edits go outside)
const AGENTS_BLOCK_BEGIN = '<!-- repowiki:begin';
const AGENTS_BLOCK_END = '<!-- repowiki:end -->';

// Wiki source declaration line (single source of truth: managed block + additive merges)
const WIKI_SOURCE_LINE = '- docs/repowiki/ — 自动生成的项目知识（未人工验证）';

// ─── Paths ───────────────────────────────────────────────────────────────────

function repoRoot(dir) {
  return path.resolve(dir || process.cwd());
}

function repowikiDir(root) {
  return path.join(root, '.repowiki');
}

function docsRepowikiDir(root) {
  return path.join(root, 'docs', 'repowiki');
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

function readUtf8(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function readJson(filePath) {
  const content = readUtf8(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function sha256OfFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

function isKeyFile(fileName) {
  for (const p of KEY_FILE_PATTERNS) {
    if (fileName.includes(p) || fileName.endsWith(p)) return true;
  }
  return false;
}

function detectLanguage(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '') {
    // Check for Dockerfile, Makefile etc.
    const base = path.basename(fileName).toLowerCase();
    if (base === 'dockerfile') return 'dockerfile';
    if (base === 'makefile') return 'makefile';
    if (base === 'gemfile') return 'ruby';
    return 'other';
  }
  return LANG_MAP.get(ext) || 'other';
}

function countLines(content) {
  if (!content) return 0;
  let count = 0;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') count++;
  }
  // If content doesn't end with newline, add last line
  if (content.length > 0 && !content.endsWith('\n')) count++;
  return count;
}

// ─── Gitignore / Repowikiignore pattern matching ────────────────────────────

function parseGitignorePatterns(filePath) {
  const content = readUtf8(filePath);
  if (!content) return [];
  return content.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
}

function gitignoreToGlob(pattern) {
  // Convert basic gitignore patterns to simple path matchers
  // Invert negation patterns (those starting with !)
  const negate = pattern.startsWith('!');
  if (negate) pattern = pattern.slice(1);

  let regexStr = '^';
  let i = 0;

  // If pattern starts with /, anchor to root
  if (pattern.startsWith('/')) {
    pattern = pattern.slice(1);
    regexStr += '(\\./)?';
  } else {
    // Trailing / is a directory marker, not an inner slash
    const normalized = pattern.endsWith('/') ? pattern.slice(0, -1) : pattern;
    if (!normalized.includes('/')) {
      // No inner slash -> match anywhere (by path segment, e.g. 'bin/', '*.log')
      regexStr += '(.*\\/)?';
    } else {
      // Contains inner slash -> anchor to root
      regexStr += '(\\./)?';
    }
  }

  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === '*') {
      if (i + 1 < pattern.length && pattern[i + 1] === '*') {
        // ** matches everything
        if (i + 2 < pattern.length && pattern[i + 2] === '/') {
          regexStr += '(.+\\/)?';
          i += 3;
          continue;
        }
        regexStr += '.*';
        i += 2;
        continue;
      }
      // * matches everything except /
      regexStr += '[^/]*';
      i++;
    } else if (ch === '?') {
      regexStr += '[^/]';
      i++;
    } else if (ch === '.') {
      regexStr += '\\.';
      i++;
    } else if (ch === '/') {
      regexStr += '\\/';
      i++;
    } else {
      regexStr += ch;
      i++;
    }
  }

  if (!pattern.endsWith('/')) {
    regexStr += '$';
  } else {
    regexStr += '.*$';
  }

  try {
    return { regex: new RegExp(regexStr), negate };
  } catch {
    return null;
  }
}

function isExcludedByPattern(fileRelPath, patterns) {
  for (const p of patterns) {
    const matcher = gitignoreToGlob(p);
    if (matcher && matcher.regex.test(fileRelPath)) {
      // Negation patterns (!pattern) mean "do NOT exclude"
      if (matcher.negate) return false;
      return true;
    }
  }
  return false;
}

function collectSubdirGitignores(rootDir) {
  // Collect patterns from subdirectory .gitignore files, prefixed with their relative path
  const patterns = [];
  const queue = [rootDir];
  while (queue.length > 0) {
    const dir = queue.shift();
    const ignorePath = path.join(dir, '.gitignore');
    if (fs.existsSync(ignorePath)) {
      const relDir = path.relative(rootDir, dir).replace(/\\/g, '/');
      if (relDir === '') continue; // root .gitignore handled separately
      const rawPatterns = parseGitignorePatterns(ignorePath);
      for (const p of rawPatterns) {
        // Prefix each pattern with its directory relative to repo root
        if (p.startsWith('/')) {
          patterns.push('/' + relDir + p);
        } else {
          patterns.push(relDir + '/' + p);
        }
      }
    }
    // Recurse into subdirs (same EXCLUDED_DIRS/wiki-dir logic as walkDir)
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      const childRelPath = path.relative(rootDir, path.join(dir, entry.name)).replace(/\\/g, '/');
      if (childRelPath === 'docs/repowiki' || childRelPath.startsWith('docs/repowiki/')) continue;
      queue.push(path.join(dir, entry.name));
    }
  }
  return patterns;
}

function isTextFile(filePath) {
  // Check if file is likely a text file by reading the first few bytes
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(512);
    const bytesRead = fs.readSync(fd, buf, 0, 512, 0);
    fs.closeSync(fd);
    // Check for null bytes (binary indicator)
    return !buf.slice(0, bytesRead).includes(0);
  } catch {
    return false;
  }
}

// ─── Directory walker ────────────────────────────────────────────────────────

function* walkDir(rootDir, excludePatterns) {
  const queue = [rootDir];
  const root = path.resolve(rootDir);

  while (queue.length > 0) {
    const dir = queue.shift();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(root, fullPath).replace(/\\/g, '/');

      // Check excluded dirs
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        // Always exclude wiki output directory from scanning
        if (relPath === 'docs/repowiki' || relPath.startsWith('docs/repowiki/')) continue;
        queue.push(fullPath);
        continue;
      }

      // Apply pattern exclusion
      if (excludePatterns.length > 0 && isExcludedByPattern(relPath, excludePatterns)) {
        continue;
      }

      // Skip key files
      if (isKeyFile(entry.name)) continue;

      // Check size
      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }
      if (stat.size > MAX_FILE_SIZE) continue;

      yield { fullPath, relPath, name: entry.name, size: stat.size };
    }
  }
}

// ─── _module.yaml mini parser/writer (Qoder-compatible subset) ───────────────
// Format (subset of Qoder's _module.yaml): schema_version/title/scope/source_files
// plus lists depends_on[]/related_to[] (each item: string or {path}) and children[].

function parseModuleYaml(content) {
  if (!content) return null;
  const lines = String(content).split('\n');
  const out = { scope: [], source_files: [], depends_on: [], related_to: [], children: [] };
  let section = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const indent = line.length - line.trimStart().length;
    const trimmed = line.trim();
    if (indent === 0 && trimmed.includes(':')) {
      const key = trimmed.slice(0, trimmed.indexOf(':')).trim();
      const val = trimmed.slice(trimmed.indexOf(':') + 1).trim();
      if (['scope', 'source_files', 'depends_on', 'related_to', 'children'].includes(key)) {
        section = key;
        if (val && val !== '[]') out[key].push(val.replace(/^["']|["']$/g, ''));
      } else {
        section = null;
        if (['schema_version', 'title', 'module_path'].includes(key)) out[key] = val.replace(/^["']|["']$/g, '');
      }
      continue;
    }
    if (section && trimmed.startsWith('-')) {
      let item = trimmed.replace(/^-\s*/, '').trim();
      const m = item.match(/^path:\s*(.+)$/) || item.match(/^\{\s*path:\s*([^}]+)\}$/);
      if (m) item = m[1].trim().replace(/^["']|["']$/g, '');
      out[section].push(item.replace(/^["']|["']$/g, ''));
    }
  }
  return out;
}

function writeModuleYaml(data) {
  const list = (items) => (items && items.length ? items.map((i) => `    - ${i}`).join('\n') : '    []');
  const rel = (items) => {
    if (!items || !items.length) return '    []';
    return items.map((i) => (/^[\w\-/]+$/.test(i) ? `    - path: ${i}` : `    - \"${i}\"`)).join('\n');
  };
  return [
    'schema_version: 1',
    `title: ${data.title || ''}`,
    'scope:',
    list(data.scope),
    'source_files:',
    list(data.source_files),
    'depends_on:',
    rel(data.depends_on),
    'related_to:',
    rel(data.related_to),
    'children:',
    list(data.children),
    '',
  ].join('\n');
}

function parseFrontmatter(content) {
  if (!content || !content.startsWith('---')) return null;

  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) return null;

  const yamlBlock = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 3).trim();

  const fields = {};
  let currentKey = null;

  for (const line of yamlBlock.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check for list continuation (starts with -)
    if (trimmed.startsWith('-') && currentKey) {
      const val = trimmed.replace(/^-\s*/, '').trim();
      const existing = fields[currentKey];
      if (Array.isArray(existing)) {
        existing.push(val.replace(/^["']|["']$/g, ''));
      } else if (existing === '' || existing === undefined) {
        // Initialize as array when key had empty value
        fields[currentKey] = [val.replace(/^["']|["']$/g, '')];
      }
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value = trimmed.slice(colonIndex + 1).trim();

    // Check if value is a list (starts with [)
    if (value.startsWith('[') && value.endsWith(']')) {
      value = value.slice(1, -1).split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
      fields[key] = value;
      currentKey = key;
      continue;
    }

    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    fields[key] = value;
    currentKey = key;
  }

  return { fields, body };
}

// ─── Subcommand: scan ────────────────────────────────────────────────────────

async function cmdScan(args) {
  const root = repoRoot();
  const rwDir = repowikiDir(root);
  const snapshotPath = path.join(rwDir, 'snapshot.json');

  // Collect exclude patterns
  const excludePatterns = [];

  // Read .repowikiignore
  const rwIgnorePath = path.join(root, '.repowikiignore');
  if (fs.existsSync(rwIgnorePath)) {
    excludePatterns.push(...parseGitignorePatterns(rwIgnorePath));
  }

  // Read root .gitignore
  const gitIgnorePath = path.join(root, '.gitignore');
  if (fs.existsSync(gitIgnorePath)) {
    excludePatterns.push(...parseGitignorePatterns(gitIgnorePath));
  }

  // Read .git/info/exclude (git's global exclude file)
  const gitInfoExclude = path.join(root, '.git', 'info', 'exclude');
  if (fs.existsSync(gitInfoExclude)) {
    excludePatterns.push(...parseGitignorePatterns(gitInfoExclude));
  }

  // Read subdirectory .gitignore files (nested rules apply relative to their dir)
  const subdirGitignores = collectSubdirGitignores(root);
  excludePatterns.push(...subdirGitignores);

  // Walk directory
  const files = [];
  const skippedDirs = [];
  const skippedFiles = [];
  const langStats = {};
  let totalSize = 0;
  let totalLines = 0;

  for (const entry of walkDir(root, excludePatterns)) {
    const lang = detectLanguage(entry.name);

    // Skip binary files (matching Qoder isBinaryFile behavior)
    if (!isTextFile(entry.fullPath)) {
      skippedFiles.push({ path: entry.relPath, reason: 'binary' });
      continue;
    }

    let hash = null;
    let lines = 0;

    try {
      hash = sha256OfFile(entry.fullPath);
    } catch {
      hash = null;
    }

    const content = readUtf8(entry.fullPath);
    if (content !== null) {
      lines = countLines(content);
      totalLines += lines;
    }

    files.push({
      path: entry.relPath,
      size: entry.size,
      hash,
      language: lang,
      lines,
    });

    langStats[lang] = (langStats[lang] || 0) + 1;
    totalSize += entry.size;
  }

  // Excluded directories stats (from EXCLUDED_DIRS set)
  for (const d of EXCLUDED_DIRS) {
    if (d !== '.repowiki') { // .repowiki is runtime state, not user code
      const dirPath = path.join(root, d);
      if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
        skippedDirs.push(d);
      }
    }
  }

  // Sort files by path
  files.sort((a, b) => a.path.localeCompare(b.path));

  const snapshot = {
    schema: 1,
    generated_at: new Date().toISOString(),
    files,
    stats: {
      total_files: files.length,
      total_size: totalSize,
      total_lines: totalLines,
      languages: langStats,
    },
    excluded: {
      directories: skippedDirs,
      files: skippedFiles,
      size_limit: `${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB`,
    },
  };

  writeJson(snapshotPath, snapshot);

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
  } else if (!args.includes('--quiet')) {
    console.log(`Scan complete: ${files.length} files, ${(totalSize / 1024).toFixed(1)} KB, ${totalLines} lines`);
    console.log(`Languages: ${Object.entries(langStats).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l}:${c}`).join(', ')}`);
    console.log(`Snapshot written to: .repowiki/snapshot.json`);
  }

  return 0;
}

// ─── Subcommand: state ───────────────────────────────────────────────────────

function createStateFile(root) {
  const rwDir = repowikiDir(root);
  const statePath = path.join(rwDir, 'state.json');

  // Try to get current git info
  let commit = '';
  let branch = '';
  try {
    commit = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { commit = ''; }
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { branch = ''; }

  // Try to compute snapshot digest
  let snapshotDigest = '';
  const snapshotPath = path.join(rwDir, 'snapshot.json');
  if (fs.existsSync(snapshotPath)) {
    const snap = readJson(snapshotPath);
    if (snap) {
      snapshotDigest = crypto.createHash('sha256').update(
        JSON.stringify(snap.files || [])
      ).digest('hex');
    }
  }

  const state = {
    schema: STATE_SCHEMA,
    partition: { locale: 'zh' },
    generated_at: new Date().toISOString(),
    git: { commit, branch },
    pages: {},
    snapshot_digest: snapshotDigest,
    snapshot_file: '.repowiki/snapshot.json',
    last_run: {
      status: 'none',
      phase: '',
      started_at: '',
      finished_at: '',
      error: '',
    },
  };

  writeJson(statePath, state);
  return statePath;
}

function getGitInfo(root) {
  let commit = '';
  let branch = '';
  try {
    commit = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { commit = ''; }
  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { branch = ''; }
  return { commit, branch };
}

function computeSnapshotDigest(root) {
  const snapshotPath = path.join(repowikiDir(root), 'snapshot.json');
  if (!fs.existsSync(snapshotPath)) return '';
  const snap = readJson(snapshotPath);
  if (!snap) return '';
  return crypto.createHash('sha256').update(JSON.stringify(snap.files || [])).digest('hex');
}

function collectWikiMarkdown(wikiDir) {
  const mdFiles = [];
  function walk(dir, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, prefix + entry.name + '/');
      } else if (entry.name.endsWith('.md') || entry.name === '_module.yaml') {
        mdFiles.push({ fullPath, relPath: prefix + entry.name });
      }
    }
  }
  walk(wikiDir, '');
  return mdFiles;
}

function citationsForPage(content) {
  const scannable = String(content || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]*`/g, '');
  const citations = new Map();
  const link = /\]\(file:\/\/([^\)#]+)#L(\d+)(?:-L?(\d+))?\)/g;
  let match;
  while ((match = link.exec(scannable)) !== null) {
    let source;
    try { source = decodeURIComponent(match[1]); } catch { source = match[1]; }
    source = source.replace(/^\.\//, '');
    const start = Number(match[2]);
    const end = Number(match[3] || match[2]);
    if (!source || start < 1 || end < start) continue;
    const key = `${source}\0${start}\0${end}`;
    const existing = citations.get(key);
    if (existing) existing.occurrences++;
    else citations.set(key, { source, line_start: start, line_end: end, occurrences: 1 });
  }
  return [...citations.values()];
}

function parseDiffRanges(diffOutput) {
  const ranges = new Map();
  let source = '';
  for (const line of diffOutput.split('\n')) {
    const fileMatch = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (fileMatch) {
      source = fileMatch[1];
      if (source.startsWith('docs/repowiki/') || source.startsWith('.repowiki/')) {
        source = '';
        continue;
      }
      if (!ranges.has(source)) ranges.set(source, []);
      continue;
    }
    const hunk = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (!hunk || !source) continue;
    const oldStart = Number(hunk[1]);
    const oldCount = hunk[2] === undefined ? 1 : Number(hunk[2]);
    const newCount = hunk[4] === undefined ? 1 : Number(hunk[4]);
    ranges.get(source).push({ oldStart, oldCount, newCount });
  }
  return ranges;
}

function affectedCitations(pages, ranges) {
  const affected = [];
  for (const [page, info] of Object.entries(pages || {})) {
    for (const citation of info.citations || []) {
      let lineDelta = 0;
      let overlapsChange = false;
      for (const hunk of ranges.get(citation.source) || []) {
        const delta = hunk.newCount - hunk.oldCount;
        if (hunk.oldCount === 0) {
          if (hunk.oldStart <= citation.line_start) lineDelta += delta;
          if (hunk.oldStart >= citation.line_start && hunk.oldStart <= citation.line_end + 1) overlapsChange = true;
        } else {
          const oldEnd = hunk.oldStart + hunk.oldCount - 1;
          if (hunk.oldStart <= citation.line_end && oldEnd >= citation.line_start) overlapsChange = true;
          if (oldEnd < citation.line_start) lineDelta += delta;
        }
      }
      if (overlapsChange || lineDelta !== 0) {
        affected.push({ page, ...citation, reason: overlapsChange ? 'changed_lines' : 'line_shift', line_delta: lineDelta });
      }
    }
  }
  return affected;
}

function sourcesForPage(relPath, plan) {
  if (!plan || !Array.isArray(plan.modules)) return [];
  const rp = String(relPath).replace(/^\.\//, '');
  const sources = [];
  const addAll = (list) => {
    for (const s of (Array.isArray(list) ? list : [])) {
      if (typeof s === 'string' && s && !sources.includes(s)) sources.push(s);
    }
  };

  // Custom knowledge dirs (top-level single-file topics): plan.custom[] with dir/scope
  const customs = Array.isArray(plan.custom) ? plan.custom : [];
  for (const c of customs) {
    if (!c || typeof c !== 'object') continue;
    const dir = c.dir || c.slug;
    if (dir && rp.startsWith(`knowledge/${dir}/`)) {
      addAll(c.source_files);
      addAll(c.scope);
    }
  }

  for (const mod of plan.modules) {
    if (!mod || typeof mod !== 'object') continue;
    const pages = Array.isArray(mod.pages) ? mod.pages : [];
    const hitPage = pages.some((p) => p === rp || (typeof p === 'string' && p.replace(/^\.\//, '') === rp));
    const dir = mod.dir || mod.slug;
    const hitDir = Boolean(dir) && rp.startsWith(`knowledge/${dir}/`);
    const slug = mod.slug;
    const hitLegacy = Boolean(slug) && (rp === `${slug}/overview.md` || rp.startsWith(`${slug}/`));
    if (hitPage || hitDir || hitLegacy) {
      addAll(mod.source_files);
      addAll(mod.scope);
    }
  }

  if (Array.isArray(plan.articles)) {
    for (const art of plan.articles) {
      if (!art || typeof art !== 'object') continue;
      const file = typeof art.file === 'string' ? art.file.replace(/^\.\//, '') : '';
      if (!file || file !== rp) continue;
      addAll(art.scope);
      for (const ms of (Array.isArray(art.modules) ? art.modules : [])) {
        const mod = plan.modules.find((m) => m && m.slug === ms);
        if (mod) {
          addAll(mod.source_files);
          addAll(mod.scope);
        }
      }
    }
  }

  return sources;
}

function buildPagesMap(root) {
  const wikiDir = docsRepowikiDir(root);
  const pages = {};
  if (!fs.existsSync(wikiDir)) return { pages, pageCount: 0 };

  const plan = readJson(path.join(repowikiDir(root), 'plan.json'));
  const mdFiles = collectWikiMarkdown(wikiDir);
  // _module.yaml overlay: bundle-side scope/source_files enrich plan-derived sources
  const yamlByDir = new Map();
  for (const f of mdFiles) {
    const m = f.relPath.match(/^knowledge\/([^/]+)\/_module\.yaml$/);
    if (!m) continue;
    const parsed = parseModuleYaml(readUtf8(f.fullPath));
    if (parsed) yamlByDir.set(m[1], parsed);
  }
  for (const f of mdFiles) {
    // log.md is runtime-ish output; still track hash for protection consistency
    const contentHash = sha256OfFile(f.fullPath) || '';
    const sources = sourcesForPage(f.relPath, plan);
    const kd = f.relPath.match(/^knowledge\/([^/]+)\//);
    if (kd && yamlByDir.has(kd[1])) {
      const y = yamlByDir.get(kd[1]);
      for (const s of (y.source_files || []).concat(y.scope || [])) {
        if (typeof s === 'string' && s && !sources.includes(s)) sources.push(s);
      }
    }
    pages[f.relPath] = {
      sources,
      content_hash: contentHash,
      citations: f.relPath.endsWith('.md') ? citationsForPage(readUtf8(f.fullPath)) : [],
    };
  }
  return { pages, pageCount: mdFiles.length, plan };
}

function coverageFromPlan(plan) {
  if (!plan || !plan.coverage_check) return null;
  const c = plan.coverage_check;
  return {
    covered_files: c.covered_files ?? null,
    total_files: c.total_files ?? null,
    uncovered: Array.isArray(c.uncovered) ? c.uncovered : [],
  };
}

async function cmdState(args) {
  const root = repoRoot();
  const rwDir = repowikiDir(root);
  const statePath = path.join(rwDir, 'state.json');

  const hasInit = args.includes('--init');
  const hasUpdate = args.includes('--update');
  const hasJson = args.includes('--json');

  if (hasInit && hasUpdate) {
    console.error('Use either --init or --update, not both');
    return 1;
  }

  if (hasInit) {
    if (fs.existsSync(statePath)) {
      console.error('state.json already exists');
      return 1;
    }
    const createdPath = createStateFile(root);
    console.log(`state.json initialized at ${path.relative(root, createdPath)}`);
    return 0;
  }

  if (hasUpdate) {
    const wikiDir = docsRepowikiDir(root);
    if (!fs.existsSync(wikiDir)) {
      const err = { status: 'error', message: 'docs/repowiki/ not found — generate wiki before state --update' };
      if (hasJson) process.stdout.write(JSON.stringify(err) + '\n');
      else console.error(err.message);
      return 1;
    }

    const finishedAt = new Date().toISOString();
    const git = getGitInfo(root);
    const snapshotDigest = computeSnapshotDigest(root);
    const { pages, pageCount, plan } = buildPagesMap(root);
    const coverage = coverageFromPlan(plan);

    let startedAt = finishedAt;
    const runPath = path.join(rwDir, 'run.json');
    const prevRun = readJson(runPath);
    if (prevRun && prevRun.started_at) startedAt = prevRun.started_at;
    else if (prevRun && prevRun.startedAt) startedAt = prevRun.startedAt;

    // Preserve locale / partition from existing state when present
    let partition = { locale: 'zh' };
    if (fs.existsSync(statePath)) {
      const prev = readJson(statePath);
      if (prev && prev.partition) partition = prev.partition;
    }

    const state = {
      schema: STATE_SCHEMA,
      partition,
      generated_at: finishedAt,
      git,
      citation_index_version: 1,
      pages,
      snapshot_digest: snapshotDigest,
      snapshot_file: '.repowiki/snapshot.json',
      last_run: {
        status: 'success',
        phase: 'finalize',
        started_at: startedAt,
        finished_at: finishedAt,
        error: '',
      },
    };

    writeJson(statePath, state);

    // Finalize clears in-progress run marker
    if (fs.existsSync(runPath)) {
      try { fs.unlinkSync(runPath); } catch { /* ignore */ }
    }

    const report = {
      status: 'updated',
      state_file: '.repowiki/state.json',
      pages: pageCount,
      git,
      coverage,
      snapshot_digest: snapshotDigest,
      last_run: state.last_run,
    };

    if (hasJson) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      console.log(`state.json updated (${pageCount} pages)`);
      console.log(`  commit:  ${git.commit || '(none)'}`);
      console.log(`  branch:  ${git.branch || '(none)'}`);
      if (coverage && coverage.total_files != null) {
        console.log(`  coverage: ${coverage.covered_files}/${coverage.total_files} files`);
      }
      console.log(`  phase:   finalize (success)`);
    }
    return 0;
  }

  // Read and print state
  if (!fs.existsSync(statePath)) {
    if (hasJson) {
      process.stdout.write(JSON.stringify({ status: 'not_found' }) + '\n');
    } else {
      console.error('state.json not found (run "repowiki state --init" or "repowiki state --update" to create)');
    }
    return 1;
  }

  const state = readJson(statePath);
  if (!state) {
    console.error('state.json is invalid JSON');
    return 1;
  }

  if (hasJson) {
    process.stdout.write(JSON.stringify(state, null, 2) + '\n');
  } else {
    console.log(JSON.stringify(state, null, 2));
  }

  return 0;
}

// ─── Subcommand: status ──────────────────────────────────────────────────────

async function cmdStatus(args) {
  const root = repoRoot();
  const rwDir = repowikiDir(root);
  const statePath = path.join(rwDir, 'state.json');
  const wikiDir = docsRepowikiDir(root);
  const hasJson = args.includes('--json');
  const isQuiet = args.includes('--quiet');

  // Check missing
  if (!fs.existsSync(statePath) || !fs.existsSync(wikiDir)) {
    if (hasJson) {
      process.stdout.write(JSON.stringify({ status: 'missing', exit_code: 11 }) + '\n');
    } else if (isQuiet) {
      process.stdout.write('missing');
    } else {
      console.log('Wiki not yet generated. Run /repowiki-gen to create.');
    }
    return 11;
  }

  const state = readJson(statePath);
  if (!state || !state.git) {
    if (hasJson) {
      process.stdout.write(JSON.stringify({ status: 'unknown', reason: 'invalid state.json' }) + '\n');
    } else if (isQuiet) {
      process.stdout.write('unknown');
    } else {
      console.log('state.json is invalid or missing git info');
    }
    return 1;
  }

  // Check current git state
  let currentCommit = '';
  let currentBranch = '';
  try {
    currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    currentCommit = '';
  }
  try {
    currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    currentBranch = '';
  }

  // Check branch consistency
  const branchMismatch = currentBranch && state.git.branch && currentBranch !== state.git.branch;

  if (!currentCommit || !state.git.commit) {
    const result = { status: 'unknown', reason: 'cannot determine git baseline' };
    if (hasJson) {
      process.stdout.write(JSON.stringify(result) + '\n');
    } else if (isQuiet) {
      process.stdout.write('unknown');
    } else {
      console.log('Cannot determine git baseline (no commits or state not initialized)');
    }
    return 1;
  }

  // Compare commits
  if (currentCommit === state.git.commit && !branchMismatch) {
    if (hasJson) {
      process.stdout.write(JSON.stringify({ status: 'fresh', commit: currentCommit }) + '\n');
    } else if (isQuiet) {
      process.stdout.write('fresh');
    } else {
      console.log('Wiki is up to date.');
    }
    return 0;
  }

  // Stale — compute diff
  let changedFiles = [];
  let commitCount = 0;
  let diffSucceeded = false;
  let citationDiffSucceeded = false;
  let changedLineRanges = new Map();
  try {
    const baselineCommit = state.git.commit;
    const diffOutput = execSync(
      `git -c core.quotePath=false diff --name-status -M "${baselineCommit}"..HEAD`,
      { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();

    if (diffOutput) {
      changedFiles = diffOutput.split('\n')
        .filter(l => l.trim())
        .map(l => {
          const parts = l.split('\t');
          return { status: parts[0], file: parts.slice(1).join('\t') };
        })
        // Filter out wiki self-artifacts (these change when wiki regenerates, not source drift)
        .filter(f => !f.file.startsWith('docs/repowiki/') && !f.file.startsWith('.repowiki/'));
    }

    // Count commits between baseline and HEAD
    const revCount = execSync(
      `git rev-list --count "${baselineCommit}"..HEAD`,
      { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }
    ).trim();
    commitCount = parseInt(revCount, 10) || 0;
    diffSucceeded = true;
    if (state.citation_index_version === 1) {
      try {
        const lineDiff = execSync(
          `git -c core.quotePath=false diff --no-ext-diff --no-renames --unified=0 "${baselineCommit}"..HEAD`,
          { encoding: 'utf-8', cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }
        );
        changedLineRanges = parseDiffRanges(lineDiff);
        citationDiffSucceeded = true;
      } catch {
        // Citation hints are optional; the source-level stale result remains authoritative.
      }
    }
  } catch {
    // diff failed (e.g., baseline commit not found)
  }

  // Identify affected pages from state's page→source mapping
  const affectedPages = [];
  if (state.pages) {
    for (const [pagePath, pageInfo] of Object.entries(state.pages)) {
      const sources = pageInfo.sources || [];
      for (const cf of changedFiles) {
        if (sources.some(s => {
          // Simple glob match: treat ** as recursive, * as single-segment
          const pattern = s.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
          return new RegExp('^' + pattern.replace(/\//g, '\\/') + '$').test(cf.file);
        })) {
          if (!affectedPages.includes(pagePath)) affectedPages.push(pagePath);
        }
      }
    }
  }

  const citationIndexAvailable = state.citation_index_version === 1 && citationDiffSucceeded;
  const citationRevalidationCandidates = citationIndexAvailable
    ? affectedCitations(state.pages, changedLineRanges)
    : [];

  const isFresh = !branchMismatch && diffSucceeded && changedFiles.length === 0 && affectedPages.length === 0;
  const result = {
    status: branchMismatch ? 'stale_cross_branch' : isFresh ? 'fresh' : 'stale',
    baseline_commit: state.git.commit,
    head_commit: currentCommit,
    branch: { expected: state.git.branch, actual: currentBranch },
    commits_behind: commitCount,
    changed_files: changedFiles.length,
    affected_pages: affectedPages,
    citation_index_available: citationIndexAvailable,
    citation_revalidation_candidates: citationRevalidationCandidates,
    message: branchMismatch
      ? `Branch mismatch: expected ${state.git.branch}, on ${currentBranch}`
      : isFresh
        ? 'Wiki is up to date.'
        : `Wiki is stale: ${commitCount} new commits, ${changedFiles.length} files changed`,
  };

  if (hasJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else if (isQuiet) {
    process.stdout.write(result.status);
  } else {
    console.log(result.message);
    if (!isFresh && changedFiles.length > 0) {
      const pagesMsg = affectedPages.length > 0
        ? `${affectedPages.length} pages affected: ${affectedPages.slice(0, 5).join(', ')}${affectedPages.length > 5 ? '...' : ''}`
        : 'Run /repowiki-gen to update';
      console.log(pagesMsg);
    }
  }

  return isFresh ? 0 : 10;
}

// ─── Subcommand: validate ────────────────────────────────────────────────────

async function cmdValidate(args) {
  const root = repoRoot();
  const wikiDir = docsRepowikiDir(root);
  const hasJson = args.includes('--json');
  const errors = [];
  const warnings = [];

  // Check wiki directory exists
  if (!fs.existsSync(wikiDir)) {
    const error = { file: 'docs/repowiki/', field: null, message: 'docs/repowiki/ directory not found' };
    errors.push(error);
    if (hasJson) {
      process.stdout.write(JSON.stringify({ valid: false, errors, warnings }) + '\n');
    } else {
      console.error('ERROR: docs/repowiki/ directory not found');
    }
    return 1;
  }

  // Collect all markdown files (+ _module.yaml metadata, Qoder-compatible)
  const mdFiles = [];
  function collectMd(dir, prefix) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        collectMd(fullPath, prefix + entry.name + '/');
      } else if (entry.name.endsWith('.md') || entry.name === '_module.yaml') {
        mdFiles.push({ fullPath, relPath: prefix + entry.name });
      }
    }
  }
  collectMd(wikiDir, '');

  if (mdFiles.length === 0) {
    errors.push({ file: 'docs/repowiki/', field: null, message: 'no markdown files found in docs/repowiki/' });
    if (hasJson) {
      process.stdout.write(JSON.stringify({ valid: false, errors, warnings }) + '\n');
    } else {
      console.error('ERROR: no markdown files in docs/repowiki/');
    }
    return 1;
  }

  // Check index.md exists
  const indexFile = mdFiles.find(f => f.relPath === 'index.md');
  if (!indexFile) {
    errors.push({ file: 'docs/repowiki/index.md', field: null, message: 'required root index.md not found' });
  }

  // Directory conventions are checked after frontmatter parsing (knowledge
  // module directories anchor on a card with `dimension: overview`).
  // Note: _module.yaml-only dirs have no md, so collect dirs by filesystem walk too.
  const dirs = new Set();
  for (const f of mdFiles) {
    const dir = path.dirname(f.relPath);
    if (dir !== '.') {
      dirs.add(dir);
    }
  }
  try {
    const walkDirs = (dir, prefix) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) {
          const rel = prefix + e.name;
          dirs.add(rel);
          walkDirs(path.join(dir, e.name), rel + '/');
        }
      }
    };
    walkDirs(wikiDir, '');
  } catch { /* ignore */ }

  // Validate each file's frontmatter
  const parsedFields = new Map(); // relPath -> frontmatter fields (page-level files)
  for (const f of mdFiles) {
    // _module.yaml is module metadata (Qoder-compatible), validated separately below
    if (f.relPath.endsWith('/_module.yaml') || f.relPath === '_module.yaml') continue;
    const content = readUtf8(f.fullPath);
    if (!content) {
      errors.push({ file: f.relPath, field: null, message: 'file is empty or unreadable' });
      continue;
    }
    const isRootIndex = f.relPath === 'index.md';
    const isLog = f.relPath === 'log.md';

    const parsed = parseFrontmatter(content);
    if (!parsed) {
      // log.md is the generation log; it intentionally has no frontmatter
      if (!isLog) {
        warnings.push({ file: f.relPath, field: null, message: 'no valid YAML frontmatter found' });
      }
      continue;
    }

    const ff = parsed.fields;

    if (isRootIndex) {
      // Root index.md: only okf_version and description allowed
      const allowedRootFields = new Set(['okf_version', 'description']);
      for (const key of Object.keys(ff)) {
        if (!allowedRootFields.has(key)) {
          warnings.push({
            file: f.relPath,
            field: key,
            message: `field '${key}' not allowed in root index.md (only okf_version, description)`,
          });
        }
      }
      continue;
    }

    if (isLog) continue; // log.md content is free-form

    parsedFields.set(f.relPath, ff);

    // Page-level files
    const requiredFields = ['status', 'type', 'triggers', 'description'];
    for (const rf of requiredFields) {
      if (ff[rf] === undefined || ff[rf] === '') {
        errors.push({ file: f.relPath, field: rf, message: `missing required field '${rf}'` });
      }
    }

    // Validate status value
    const validStatuses = new Set(['stable', 'draft', 'deprecated']);
    if (ff.status && !validStatuses.has(ff.status)) {
      errors.push({ file: f.relPath, field: 'status', message: `invalid status '${ff.status}' (must be stable|draft|deprecated)` });
    }

    // Validate type value by family (knowledge cards vs articles)
    const inKnowledge = f.relPath.startsWith('knowledge/');
    const inContent = f.relPath.startsWith('content/');
    const knowledgeTypes = ['module'];
    const articleTypes = ['overview', 'getting_started', 'domain', 'deep_dive', 'developer_guide'];
    const allowedTypes = inKnowledge ? knowledgeTypes : (inContent ? articleTypes : knowledgeTypes.concat(articleTypes));
    if (ff.type && !allowedTypes.includes(ff.type)) {
      errors.push({
        file: f.relPath,
        field: 'type',
        message: `invalid type '${ff.type}' (must be ${allowedTypes.join('|')} in this family)`,
      });
    }

    // Knowledge cards carry a language-independent dimension field
    if (inKnowledge && (ff.dimension === undefined || ff.dimension === '')) {
      warnings.push({ file: f.relPath, field: 'dimension', message: 'knowledge card is missing the dimension field' });
    }

    // Check triggers is a non-empty array or value
    if (ff.triggers !== undefined && ff.triggers !== '') {
      if (Array.isArray(ff.triggers) && ff.triggers.length === 0) {
        warnings.push({ file: f.relPath, field: 'triggers', message: 'triggers is an empty array' });
      }
    }
  }

  // Directory conventions (+ _module.yaml per knowledge dir, Qoder-compatible)
  for (const d of dirs) {
    if (d === 'knowledge' || d === 'content') continue; // family containers need no anchor
    if (d.startsWith('knowledge/')) {
      const hasOverviewCard = mdFiles.some((f) => path.dirname(f.relPath) === d && parsedFields.get(f.relPath)?.dimension === 'overview');
      if (!hasOverviewCard) {
        warnings.push({ file: `${d}/`, field: null, message: `knowledge module directory ${d} has no card with dimension: overview` });
      }
      // Custom single-file topics carry kind/name/category frontmatter, no _module.yaml needed
      const mdInDir = mdFiles.filter((f) => path.dirname(f.relPath) === d && f.fullPath.endsWith('.md'));
      const isCustomDir = mdInDir.length === 1 && (() => {
        const ff = parsedFields.get(mdInDir[0].relPath);
        return ff && (ff.kind !== undefined || ff.category !== undefined);
      })();
      if (!isCustomDir) {
        const yamlEntry = mdFiles.find((f) => f.relPath === `${d}/_module.yaml`);
        if (!yamlEntry) {
          warnings.push({ file: `${d}/`, field: null, message: `knowledge directory ${d} has no _module.yaml` });
        } else {
          const ym = parseModuleYaml(readUtf8(yamlEntry.fullPath));
          if (!ym || !ym.title) {
            warnings.push({ file: yamlEntry.relPath, field: 'title', message: '_module.yaml is missing the title field' });
          }
          if (!ym || (!((ym.scope || []).length) && !((ym.source_files || []).length))) {
            warnings.push({ file: yamlEntry.relPath, field: 'scope', message: '_module.yaml has empty scope and source_files' });
          }
        }
      }
      continue;
    }
    if (d.startsWith('content/')) continue; // article directories need no anchor file
    const hasIndex = mdFiles.some(f => f.relPath === `${d}/index.md` || f.relPath === `${d}/overview.md`);
    if (!hasIndex) {
      warnings.push({ file: `${d}/`, field: null, message: `directory ${d} has no index.md or overview.md` });
    }
  }

  const resolveBundleTarget = (fromRel, rawLink) => {
    let target = String(rawLink).trim();
    const hashIdx = target.indexOf('#');
    if (hashIdx !== -1) target = target.slice(0, hashIdx).trim();
    if (!target) return null;
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(target)) return null; // schemes: http(s), file, mailto...
    if (target.startsWith('/')) return null;
    try {
      target = decodeURIComponent(target);
    } catch { /* keep the raw form when percent-encoding is malformed */ }
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), target));
    if (!resolved || resolved === '.' || resolved.startsWith('..')) return null;
    return resolved;
  };

  const linkTargets = new Map(); // relPath -> Set of resolved bundle-relative targets
  for (const f of mdFiles) {
    if (f.relPath.endsWith('/_module.yaml') || f.relPath === '_module.yaml') continue; // metadata has no links
    const content = readUtf8(f.fullPath);
    if (!content) continue;

    // Link-like text inside fenced code blocks and inline code spans is
    // illustrative (examples or mermaid diagrams), not part of the link graph.
    const scannable = content
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '');

    // Find markdown links: [text](path)
    const targets = new Set();
    const linkRegex = /\[([^\]]*)\]\(([^)]+)\)/g;
    let match;
    while ((match = linkRegex.exec(scannable)) !== null) {
      const resolved = resolveBundleTarget(f.relPath, match[2]);
      if (!resolved) continue;
      targets.add(resolved);
      if (!fs.existsSync(path.join(wikiDir, resolved))) {
        warnings.push({
          file: f.relPath,
          field: null,
          message: `broken link: "${match[2].trim()}" -> ${resolved}`,
        });
      }
    }
    linkTargets.set(f.relPath, targets);
  }

  // Reachability: every page (except index.md and log.md) must be linked from index.md
  if (indexFile) {
    const visited = new Set(['index.md']);
    const queue = ['index.md'];
    while (queue.length > 0) {
      const current = queue.shift();
      const targets = linkTargets.get(current);
      if (!targets) continue;
      for (const t of targets) {
        if (visited.has(t)) continue;
        visited.add(t);
        if (linkTargets.has(t)) queue.push(t);
      }
    }
    for (const f of mdFiles) {
      if (f.relPath === 'index.md' || f.relPath === 'log.md') continue;
      if (f.relPath.endsWith('/_module.yaml') || f.relPath === '_module.yaml') continue; // metadata, not pages
      if (!visited.has(f.relPath)) {
        warnings.push({ file: f.relPath, field: null, message: 'page not reachable from index.md' });
      }
    }
  }

  // Plan ↔ product consistency (plan.json v2: modules[] with dir, articles[] with file)
  const plan = readJson(path.join(repowikiDir(root), 'plan.json'));
  if (plan && Array.isArray(plan.articles)) {
    for (const art of plan.articles) {
      const file = art && typeof art.file === 'string' ? art.file.replace(/^\.\//, '') : '';
      if (file && !fs.existsSync(path.join(wikiDir, file))) {
        warnings.push({ file: 'plan.json', field: 'articles', message: `planned article file not found in bundle: ${file}` });
      }
    }
    for (const mod of (Array.isArray(plan.modules) ? plan.modules : [])) {
      const dir = mod && (mod.dir || mod.slug);
      if (dir && !fs.existsSync(path.join(wikiDir, 'knowledge', dir))) {
        warnings.push({ file: 'plan.json', field: 'modules', message: `planned module directory not found: knowledge/${dir}/` });
      }
    }
  }

  const valid = errors.length === 0;

  if (hasJson) {
    process.stdout.write(JSON.stringify({ valid, errors, warnings }, null, 2) + '\n');
  } else {
    if (valid) {
      console.log(`OK: ${mdFiles.length} files, ${errors.length} errors, ${warnings.length} warnings`);
    } else {
      console.error(`INVALID: ${errors.length} error(s), ${warnings.length} warning(s)`);
      for (const e of errors) {
        console.error(`  ERROR: ${e.file}: ${e.message}`);
      }
    }
    for (const w of warnings) {
      console.warn(`  WARN: ${w.file}: ${w.message}`);
    }
  }

  return valid ? 0 : 1;
}

// ─── Subcommand: init ────────────────────────────────────────────────────────

function buildAgentsBlock() {
  const out = [];
  out.push('<!-- repowiki:begin | 由 repowiki 管理：运行 `repowiki init` 原位更新本区块；手写内容请放在标记之外 -->');
  out.push('');
  out.push('## repowiki');
  out.push('');
  out.push(WIKI_SOURCE_LINE);
  out.push('');
  out.push('## Wiki 纪律');
  out.push('');
  out.push('- 涉及本项目代码理解、修改、排障前，先按 `repowiki` 读取相应内容（按页面 triggers 命中加载，禁止全文扫描）。');
  out.push('- 提交前 / 任务收尾前，运行 `repowiki status` 自查是否过期（退出码 10 = 过期 → 提示用户运行 /repowiki-gen）。');
  out.push('<!-- repowiki:end -->');
  return out.join('\n');
}

// Append the wiki source declaration into a hand-written `## repowiki` section.
// Additive only: existing lines are never edited or reordered; EOL style is preserved.
// Returns { status: 'merged' | 'declared' | 'notfound', text }.
function mergeSourceDeclaration(existing) {
  const isCrlf = existing.includes('\r\n');
  const stripCr = (s) => s.replace(/\r$/, '');
  const lines = existing.split('\n');
  const headIdx = lines.findIndex((l) => stripCr(l).trim() === '## repowiki');
  if (headIdx === -1) return { status: 'notfound', text: existing };

  let endIdx = lines.length;
  for (let i = headIdx + 1; i < lines.length; i += 1) {
    if (stripCr(lines[i]).trim().startsWith('#')) { endIdx = i; break; }
  }
  for (let i = headIdx + 1; i < endIdx; i += 1) {
    if (lines[i].includes('docs/repowiki')) return { status: 'declared', text: existing };
  }

  const bullet = isCrlf ? WIKI_SOURCE_LINE + '\r' : WIKI_SOURCE_LINE;
  let insertAt = -1;
  for (let i = headIdx + 1; i < endIdx; i += 1) {
    if (stripCr(lines[i]).trim().startsWith('- ')) insertAt = i + 1;
  }
  if (insertAt !== -1) {
    lines.splice(insertAt, 0, bullet);
  } else {
    const blank = isCrlf ? '\r' : '';
    const nextIdx = headIdx + 1;
    const nextIsBlank = nextIdx >= lines.length || stripCr(lines[nextIdx]).trim() === '';
    if (nextIsBlank) {
      lines.splice(nextIdx + 1, 0, bullet);
    } else {
      lines.splice(nextIdx, 0, blank, bullet);
    }
  }
  return { status: 'merged', text: lines.join('\n') };
}

async function cmdInit(args) {
  const root = repoRoot();
  const hasJson = args.includes('--json');

  const report = {
    root,
    state_file: 'created',
    agents_file: null,
    agents_action: 'none',
    sources: [],
    warnings: [],
  };

  // 1. state baseline (idempotent)
  const statePath = path.join(repowikiDir(root), 'state.json');
  if (fs.existsSync(statePath)) {
    report.state_file = 'exists';
  } else {
    createStateFile(root);
  }

  // 2. declared wiki sources
  report.sources.push('docs/repowiki/');

  // 3. AGENTS.md wiring (managed block, or additive merge into hand-written sources)
  const agentsPath = path.join(root, 'AGENTS.md');
  const block = buildAgentsBlock();
  const existing = readUtf8(agentsPath);

  if (existing === null) {
    fs.writeFileSync(agentsPath, block + '\n', 'utf-8');
    report.agents_file = 'AGENTS.md';
    report.agents_action = 'created';
  } else {
    const beginIdx = existing.indexOf(AGENTS_BLOCK_BEGIN);
    const endIdx = beginIdx === -1 ? -1 : existing.indexOf(AGENTS_BLOCK_END, beginIdx);

    if (beginIdx !== -1 && endIdx !== -1) {
      const updated = existing.slice(0, beginIdx) + block + existing.slice(endIdx + AGENTS_BLOCK_END.length);
      if (updated === existing) {
        report.agents_action = 'unchanged';
      } else {
        fs.writeFileSync(agentsPath, updated, 'utf-8');
        report.agents_action = 'updated';
      }
      report.agents_file = 'AGENTS.md';
    } else if (beginIdx !== -1) {
      report.agents_file = 'AGENTS.md';
      report.agents_action = 'skipped_corrupt';
      report.warnings.push('检测到 repowiki 起始标记但缺少结束标记，已跳过；请手工修复后重跑');
    } else {
      const merged = mergeSourceDeclaration(existing);
      if (merged.status === 'merged') {
        fs.writeFileSync(agentsPath, merged.text, 'utf-8');
        report.agents_file = 'AGENTS.md';
        report.agents_action = 'merged';
        report.warnings.push('已在手写 ## repowiki 分区中补充 `- docs/repowiki/` 声明行（其余内容未改动）');
      } else if (merged.status === 'declared') {
        report.agents_file = 'AGENTS.md';
        report.agents_action = 'manual_declared';
      } else if (existing.includes('## repowiki')) {
        report.agents_file = 'AGENTS.md';
        report.agents_action = 'skipped_manual';
        report.warnings.push('检测到 ## repowiki 但非独立标题行，未自动改动；可手工补充 `- docs/repowiki/` 声明行');
      } else {
        const base = existing.trim() === '' ? '' : (existing.endsWith('\n') ? existing + '\n' : existing + '\n\n');
        fs.writeFileSync(agentsPath, base + block + '\n', 'utf-8');
        report.agents_file = 'AGENTS.md';
        report.agents_action = 'injected';
      }
    }
  }

  // 4. report
  if (hasJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else if (!args.includes('--quiet')) {
    console.log(`repowiki init: ${root}`);
    console.log(`  state.json: ${report.state_file}`);
    console.log(`  AGENTS.md:  ${report.agents_action}`);
    console.log(`  sources:    ${report.sources.join(', ')}`);
    for (const w of report.warnings) console.warn(`  WARN: ${w}`);
  }

  return 0;
}

// ─── Help / Usage ────────────────────────────────────────────────────────────

function printUsage(exitCode = 0) {
  console.log(`repowiki — Repo Wiki CLI

Usage:
  repowiki init           Wire project: state baseline + AGENTS.md wiki wiring (idempotent)
  repowiki scan           Scan repository and create snapshot.json
  repowiki state          Read/print state.json
  repowiki state --init   Initialize state.json
  repowiki state --update Finalize: write pages map, git baseline, last_run
  repowiki status         Check wiki freshness
  repowiki validate       Validate OKF bundle in docs/repowiki/

Global flags:
  --json    Output in JSON format
  --quiet   Minimal output (for hooks/CI)

Exit codes:
  0   OK / fresh
  1   Error
  10  Stale (wiki needs update)
  11  Missing (wiki not generated)
`);
  process.exit(exitCode);
}

// ─── Main entry ──────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printUsage(0);
  }

  const cmd = args[0];

  let exitCode;
  switch (cmd) {
    case 'init':
      exitCode = await cmdInit(args);
      break;
    case 'scan':
      exitCode = await cmdScan(args);
      break;
    case 'state':
      exitCode = await cmdState(args);
      break;
    case 'status':
      exitCode = await cmdStatus(args);
      break;
    case 'validate':
      exitCode = await cmdValidate(args);
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
      printUsage(1);
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Unhandled error:', err.message || err);
  process.exit(1);
});