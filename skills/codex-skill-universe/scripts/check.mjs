#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PACKAGE_NAME = 'codex-skill-universe';

function parseArgs(argv) {
  const args = {
    root: process.env.SKILL_UNIVERSE_ROOT || '',
    build: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--root') args.root = argv[++index] || '';
    else if (item === '--build') args.build = true;
  }

  return args;
}

function npmInvocation(args) {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', 'npm.cmd', ...args]
    };
  }
  return { command: 'npm', args };
}

function childEnv() {
  const env = { ...process.env };
  if (process.platform === 'win32' && env.Path && env.PATH) {
    delete env.PATH;
  }
  return env;
}

async function readPackageName(dir) {
  try {
    const payload = JSON.parse(await fsp.readFile(path.join(dir, 'package.json'), 'utf8'));
    return payload.name;
  } catch {
    return '';
  }
}

async function findUp(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if ((await readPackageName(current)) === PACKAGE_NAME) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function findUnder(startDir, maxDepth = 4) {
  const queue = [{ dir: startDir, depth: 0 }];
  while (queue.length) {
    const { dir, depth } = queue.shift();
    if ((await readPackageName(dir)) === PACKAGE_NAME) return dir;
    if (depth >= maxDepth) continue;

    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (['node_modules', '.git', 'dist', '.skill-universe'].includes(entry.name)) continue;
      queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
    }
  }
  return null;
}

async function locateProjectRoot(rootArg) {
  if (rootArg) {
    const candidate = path.resolve(rootArg);
    if ((await readPackageName(candidate)) === PACKAGE_NAME) return candidate;
    const nested = await findUnder(candidate, 3);
    if (nested) return nested;
    throw new Error(`No ${PACKAGE_NAME} package.json found under ${candidate}`);
  }

  const fromCwd = await findUp(process.cwd());
  if (fromCwd) return fromCwd;

  const documentsCodex = path.join(os.homedir(), 'Documents', 'Codex');
  const fromDocuments = await findUnder(documentsCodex, 4);
  if (fromDocuments) return fromDocuments;

  throw new Error(`Could not locate a ${PACKAGE_NAME} project. Pass --root <dashboard-repo>.`);
}

function runNpmScript(projectRoot, scriptName) {
  return new Promise((resolve) => {
    const invocation = npmInvocation(['run', scriptName]);
    const child = spawn(invocation.command, invocation.args, {
      cwd: projectRoot,
      env: childEnv(),
      stdio: 'inherit',
      shell: false
    });
    child.on('error', (error) => resolve({ scriptName, ok: false, error }));
    child.on('exit', (code) => resolve({ scriptName, ok: code === 0, code }));
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = await locateProjectRoot(args.root);
  const scripts = ['typecheck', 'test:scan', 'test:privacy', 'test:semantic', 'test:ai'];
  if (args.build) scripts.push('build');

  console.log(`Project: ${projectRoot}`);
  const results = [];

  for (const scriptName of scripts) {
    console.log(`\nRunning ${scriptName}...`);
    results.push(await runNpmScript(projectRoot, scriptName));
  }

  console.log('\nSummary');
  for (const result of results) {
    const status = result.ok ? 'PASS' : 'FAIL';
    const detail = result.error ? ` - ${result.error.message}` : result.code ? ` - exit ${result.code}` : '';
    console.log(`${status} ${result.scriptName}${detail}`);
  }

  if (!args.build) {
    console.log('SKIP build - pass --build for a release check.');
  }

  if (results.some((result) => !result.ok)) process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
