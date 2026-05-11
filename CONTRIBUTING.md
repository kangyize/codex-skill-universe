# Contributing

Thanks for helping improve Codex Skill Universe.

## Development

```bash
npm ci
npm run dev
```

## Checks

Before opening a pull request, run:

```bash
npm run build
npm run test:privacy
npm run test:scan
npm run test:recommendations
```

If you change the UI, also run:

```bash
npm run test:visual
```

## Privacy Rules

Do not commit:

- `.env.local`
- `.skill-universe/`
- local logs
- private skill contents
- local research project data

Use `.env.example` for documented environment variables.

## Pull Requests

Please keep changes focused. Include:

- what changed
- why it changed
- how it was tested
- any privacy or security impact
