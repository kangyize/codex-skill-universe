#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const PACKAGE_NAME = 'codex-skill-universe';

function parseArgs(argv) {
  const args = {
    root: process.env.SKILL_UNIVERSE_ROOT || '',
    port: Number(process.env.SKILL_UNIVERSE_PORT || 5173),
    host: process.env.SKILL_UNIVERSE_HOST || '127.0.0.1',
    skipScan: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--root') args.root = argv[++index] || '';
    else if (item === '--port') args.port = Number(argv[++index] || args.port);
    else if (item === '--host') args.host = argv[++index] || args.host;
    else if (item === '--skip-scan') args.skipScan = true;
  }

  if (!Number.isFinite(args.port) || args.port <= 0) args.port = 5173;
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

function runNpm(args, cwd) {
  return new Promise((resolve, reject) => {
    const invocation = npmInvocation(args);
    const child = spawn(invocation.command, invocation.args, {
      cwd,
      env: childEnv(),
      stdio: 'inherit',
      shell: false
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`npm ${args.join(' ')} exited with ${code}`));
    });
  });
}

async function healthUrl(host, port) {
  return `http://${host}:${port}/api/health`;
}

async function checkHealth(host, port) {
  try {
    const response = await fetch(await healthUrl(host, port));
    if (!response.ok) return false;
    const payload = await response.json().catch(() => ({}));
    return payload.ok === true;
  } catch {
    return false;
  }
}

async function waitForHealth(host, port, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkHealth(host, port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function startDevServer(projectRoot, host, port) {
  await fsp.mkdir(path.join(projectRoot, '.skill-universe'), { recursive: true });
  const out = fs.openSync(path.join(projectRoot, '.skill-universe', 'launch-dev.log'), 'a');
  const err = fs.openSync(path.join(projectRoot, '.skill-universe', 'launch-dev.err.log'), 'a');
  const invocation = npmInvocation(['run', 'dev', '--', '--host', host, '--port', String(port)]);
  const child = spawn(invocation.command, invocation.args, {
    cwd: projectRoot,
    detached: true,
    env: childEnv(),
    stdio: ['ignore', out, err],
    shell: false
  });
  child.unref();
  return child.pid;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const projectRoot = await locateProjectRoot(args.root);
  const url = `http://${args.host}:${args.port}/`;

  console.log(`Project: ${projectRoot}`);

  if (!args.skipScan) {
    console.log('Refreshing skill scan...');
    await runNpm(['run', 'scan'], projectRoot);
  }

  if (await checkHealth(args.host, args.port)) {
    console.log(`Dashboard already running: ${url}`);
    return;
  }

  const pid = await startDevServer(projectRoot, args.host, args.port);
  const ready = await waitForHealth(args.host, args.port);
  if (!ready) {
    throw new Error(`Started dev server process ${pid}, but ${await healthUrl(args.host, args.port)} did not become healthy. Check .skill-universe/launch-dev.err.log.`);
  }

  console.log(`Dashboard running: ${url}`);
  console.log(`Dev server PID: ${pid}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
