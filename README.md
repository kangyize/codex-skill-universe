# Codex Skill Universe

Codex Skill Universe is a local web dashboard for exploring, organizing, and extending Codex skills. It scans local skills and plugin-contributed skills, builds a 3D "skill universe", explains similarity and overlap, recommends workflows, and helps turn a skill collection into a research workflow cockpit.

The app is local-first. It does not require an OpenAI API key for the default experience. Optional OpenAI embeddings can be enabled later for stronger semantic clustering.

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

## Configuration

Copy `.env.example` to `.env.local` if you want optional embedding support:

```bash
cp .env.example .env.local
```

Default local mode works without `OPENAI_API_KEY`.

The app reads `skill-universe.config.json` for scan and embedding settings. By default, references and assets are not sent to external APIs.

## Local Data

Runtime data is stored under `.skill-universe/` and is ignored by git. This can include:

- embedding cache
- recommendation cache
- screenshots from visual checks
- local research project profiles
- timeline and temporary state

Do not commit `.skill-universe/` or `.env.local`.

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run scan
npm run test:scan
npm run test:privacy
npm run test:semantic
npm run test:watcher
npm run test:recommendations
npm run test:visual
```

`test:visual` uses Playwright and may require browser dependencies in some environments.

## Privacy

Skill Universe is designed to be local-first:

- It scans local `SKILL.md` files and plugin skill metadata.
- It does not commit local caches, project profiles, logs, or API keys.
- It does not upload references/assets text by default.
- Recommendation search sends only gap keywords to ClawHub.
- Research Mission Mode stores project files locally in `.skill-universe/projects/*.json`.

See [PRIVACY.md](PRIVACY.md) for more detail.

## Security

The recommendation and install-plan features do not auto-install skills. They generate reviewable plans only. Always inspect a third-party skill before installation, especially scripts, network access, and API-key requirements.

See [SECURITY.md](SECURITY.md).

## License

MIT. See [LICENSE](LICENSE).
