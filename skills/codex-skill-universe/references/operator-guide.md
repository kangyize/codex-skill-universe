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
http://127.0.0.1:5173/api/ai/status
http://127.0.0.1:5173/api/skill-groups
http://127.0.0.1:5173/api/skill-usage
```

The `/api/skills` response should include `skills`, `clusters`, `relations`, `insights`, and `meta.warnings`.

`/api/ai/status` returns `enabled: false` when `OPENAI_API_KEY` is missing or still set to a placeholder.

## OpenAI API Setup

AI Skill Doctor is optional. Local scanning, health scoring, recommendations, and Skill Groups still work without an API key.

Configure the API in the dashboard process environment or `.env.local`:

```bash
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_ANALYSIS_MODEL` defaults to `gpt-4.1-mini`. The dashboard calls `/v1/responses` and requests structured JSON output for single-skill analysis and Skill Group suggestions.

## AI Skill Doctor

Use AI Skill Doctor only after the user selects a skill or explicitly asks to analyze one skill. The intended flow is:

1. Check `/api/ai/status`.
2. If enabled, trigger the page's `AI Check` button or `POST /api/ai/analyze-skill` with `{ "skillId": "..." }`.
3. Review the score, issues, fixes, suggested description, trigger terms, and privacy notes.
4. Optionally trigger `POST /api/ai/suggest-skill-group` using the selected `skillId` and the analysis result. The AI request sees only the selected skill; the server adds related local companion skills afterward.
5. Save the suggested group only after it is visible for review.

Do not run AI analysis across the whole library in the background.

## Skill Groups

Skill Groups are local, page-level workflow bundles. They are not exported as new Codex skills.

Storage:

```text
.skill-universe/skill-groups/*.json
```

Each group has:

```text
id, name, purpose, members[{ skillId, role, order, reason }], defaultPrompt, workflowSteps, createdAt, updatedAt
```

When AI suggests a group, the server filters out any member whose `skillId` is not already present in `/api/skills` and reports that in `warnings`.

## Skill Usage Statistics

Usage statistics are local counters for dashboard review. They are not inferred from private Codex conversation logs.

Storage:

```text
.skill-universe/skill-usage.json
```

Useful calls:

```text
GET  /api/skill-usage
POST /api/skill-usage/record  { "skillId": "...", "event": "manual" }
POST /api/skill-usage/reset   { "skillId": "..." }
```

Use the page's `使用量` panel to view the histogram, and the skill detail panel's `记录一次使用` button to increment a selected skill.

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
- `skill-groups/*.json`
- `skill-usage.json`
- screenshots and temporary logs

The default dashboard behavior is local-first. It scans local `SKILL.md` metadata and does not upload reference text, assets, logs, project profiles, `.env` files, or secrets. Recommendation search sends only gap keywords to ClawHub.

AI Skill Doctor sends only the selected skill's `SKILL.md` frontmatter/body, headings, trigger terms, health summary, and resource names. It redacts local absolute paths and secret-like values, and it does not read or send `references/`, `assets/`, logs, `.env` files, or `.skill-universe/` cache contents.

AI Skill Group suggestions do not upload the full local skill catalog. The request is scoped to the selected skill and optional analysis summary; related members are added locally from the dashboard's relation graph.

Skill usage counters stay local in `.skill-universe/skill-usage.json`. Do not parse or upload Codex session logs to infer usage automatically.
