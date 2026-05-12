# Codex Skill Universe

Codex Skill Universe is a local web dashboard for exploring, organizing, and extending Codex skills. It scans local skills and plugin-contributed skills, builds a 3D "skill universe", explains similarity and overlap, recommends workflows, and helps turn a skill collection into a research workflow cockpit.

The app is local-first. It does not require an OpenAI API key for the default experience. Optional OpenAI embeddings can be enabled for stronger semantic clustering, and optional OpenAI Responses API access enables AI Skill Doctor analysis.

## Features

- 3D skill universe with clusters, focus flight, skill details, health scoring, and route highlighting.
- Similarity and overlap explanations for related skills.
- Recommendation radar for ClawHub candidates, including verified links, stars, downloads, risk hints, install plans, and manual deep audit.
- Automatic skill directory watcher with change notifications.
- Research Mission Mode for local research project planning:
  - project profiles
  - stage-based skill routes
  - project gap radar
  - next-action suggestions
  - evidence-chain prompts
- AI Skill Doctor for user-triggered skill analysis, repair suggestions, trigger-word cleanup, and Skill Group suggestions.
- Local Skill Groups saved as reusable ordered workflows with a default prompt.
- Local skill usage counters with a histogram panel for seeing which skills are used most.
- Layout presets, draggable/minimizable panels, local layout snapshots, performance modes, tags, and timeline history.
- Privacy-first summaries for semantic processing. References and assets are not uploaded by default.

## Requirements

- Windows, macOS, or Linux
- Node.js 20 or newer
- npm
- A Codex skills directory, usually:
  - Windows: `C:\Users\<you>\.codex\skills`
  - macOS/Linux: `~/.codex/skills`

## Quick Start

```bash
npm ci
npm run dev
```

Open the local URL shown by Vite, usually:

```text
http://127.0.0.1:5173/
```

If port `5173` is busy:

```bash
npm run dev -- --port 5174
```

## Install as a Codex Skill

This repository also includes a lightweight Codex skill package at:

```text
skills/codex-skill-universe/
```

The skill does not duplicate the web app source. It gives Codex a focused operating guide plus helper scripts for opening, refreshing, checking, and troubleshooting this local dashboard.

Install it into your Codex skills directory:

```powershell
$target = "$env:USERPROFILE\.codex\skills\codex-skill-universe"
New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
Copy-Item -Recurse -Force ".\skills\codex-skill-universe" $target
```

Validate the installed skill:

```powershell
python "$env:USERPROFILE\.codex\skills\.system\skill-creator\scripts\quick_validate.py" "$env:USERPROFILE\.codex\skills\codex-skill-universe"
```

After restarting Codex, invoke it explicitly with:

```text
Use $codex-skill-universe to open my local Codex Skill Universe dashboard and refresh its skill scan.
```

## Configuration

Copy `.env.example` to `.env.local` if you want optional OpenAI-powered embeddings or AI Skill Doctor support:

```bash
cp .env.example .env.local
```

Default local mode works without `OPENAI_API_KEY`. To enable AI Skill Doctor:

```bash
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=gpt-4.1-mini
OPENAI_BASE_URL=https://api.openai.com/v1
```

`OPENAI_ANALYSIS_MODEL` defaults to `gpt-4.1-mini`. AI analysis uses the OpenAI [Responses API](https://platform.openai.com/docs/api-reference/responses) with [Structured Outputs](https://platform.openai.com/docs/guides/structured-outputs?api-mode=responses).

The app reads `skill-universe.config.json` for scan and embedding settings. By default, references and assets are not sent to external APIs.

## Local Data

Runtime data is stored under `.skill-universe/` and is ignored by git. This can include:

- embedding cache
- recommendation cache
- screenshots from visual checks
- local research project profiles
- local Skill Groups in `skill-groups/*.json`
- local skill usage counters in `skill-usage.json`
- timeline and temporary state

Do not commit `.skill-universe/` or `.env.local`.

## Scripts

```bash
npm run dev
npm run build
npm run typecheck
npm run preview
npm run scan
npm run test:scan
npm run test:privacy
npm run test:semantic
npm run test:ai
npm run test:usage
npm run test:watcher
npm run test:recommendations
npm run test:visual
```

`test:visual` uses Playwright and may require browser dependencies in some environments.

`test:scan` is a local integration test. It expects a real Codex skills directory on the machine running it, so it is not part of the default GitHub Actions workflow.

## Privacy

Skill Universe is designed to be local-first:

- It scans local `SKILL.md` files and plugin skill metadata.
- It does not commit local caches, project profiles, logs, or API keys.
- It does not upload references/assets text by default.
- AI Skill Doctor is only triggered by user action and sends the selected `SKILL.md` frontmatter/body plus metadata and resource names, with local paths and secrets redacted.
- AI Skill Group suggestions do not upload the full local skill catalog; the server asks AI about the selected skill and adds related companion skills locally.
- Recommendation search sends only gap keywords to ClawHub.
- Research Mission Mode stores project files locally in `.skill-universe/projects/*.json`.
- Skill Groups are stored locally in `.skill-universe/skill-groups/*.json`.
- Skill usage counters are stored locally in `.skill-universe/skill-usage.json`; they are not uploaded or committed.

See [PRIVACY.md](PRIVACY.md) for more detail.

## Security

The recommendation and install-plan features do not auto-install skills. They generate reviewable plans only. Always inspect a third-party skill before installation, especially scripts, network access, and API-key requirements.

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
