# Codex Skill Universe Operator Guide

## First Start

Use the launch script from the dashboard repository:

```bash
node skills/codex-skill-universe/scripts/launch.mjs --root . --port 5173
```

If the skill is installed under `~/.codex/skills/codex-skill-universe`, run that installed script and pass `--root` with the dashboard repository path.

The script:

- locates the dashboard by `package.json` name `codex-skill-universe`
- runs `npm run scan`
- starts `npm run dev -- --host 127.0.0.1 --port 5173`
- checks `http://127.0.0.1:5173/api/health`

## Health Checks

Useful endpoints:

```text
http://127.0.0.1:5173/api/health
http://127.0.0.1:5173/api/skills
http://127.0.0.1:5173/api/recommendations
```

The `/api/skills` response should include `skills`, `clusters`, `relations`, `insights`, and `meta.warnings`.

## Maintenance Checks

Run quick checks:

```bash
node skills/codex-skill-universe/scripts/check.mjs --root .
```

Run a stronger release check:

```bash
node skills/codex-skill-universe/scripts/check.mjs --root . --build
```

The build may fail inside restricted sandboxes with `spawn EPERM` when Vite starts `esbuild`. If the same command passes outside the sandbox, treat it as an environment restriction, not a code failure.

## Windows Notes

- Prefer `npm.cmd` over `npm` in PowerShell automation because `npm.ps1` may be blocked by execution policy.
- If PowerShell `Start-Process` fails with duplicate `Path` or `PATH`, normalize the process environment before launching Node or npm.
- If port `5173` is busy, pass `--port 5174` and open the matching URL.
- The launch script writes dev server logs to `.skill-universe/launch-dev.log` and `.skill-universe/launch-dev.err.log`.

## Recommendation Status

The recommendation panel depends on ClawHub search/detail APIs. If `/api/recommendations` reports `offline` or zero candidates:

- keep local skill scanning and workflow features available
- report the warning text from `meta.warnings`
- do not fabricate candidate skills
- do not install anything automatically

## Local Data and Privacy

Runtime files live under `.skill-universe/` and are local cache/state:

- `embeddings.json`
- `recommendations.json`
- `projects/*.json`
- screenshots and temporary logs

The default dashboard behavior is local-first. It scans local `SKILL.md` metadata and does not upload local skill bodies, reference text, assets, logs, project profiles, `.env` files, or secrets. Recommendation search sends only gap keywords to ClawHub.
