# line-flex-message-skill

An [Agent Skill](https://agentskills.io) that lets coding agents write [LINE Flex Messages](https://developers.line.biz/en/docs/messaging-api/using-flex-messages/), validate them against LINE's official API, and preview them the way an iPhone shows them — before anything is sent.

- **Validate** with LINE's [Validate message objects](https://developers.line.biz/en/reference/messaging-api/#validate-message-objects-of-push-message) endpoint: nothing is delivered, and the result is LINE's own verdict rather than a guess.
- **Preview** as PNG with headless Chrome. The default mode reproduces the Flex Message Simulator's HTML; `--device ios` adds what the Simulator ignores — iOS line height, `maxLines`, `lineSpacing`, `adjustMode: shrink-to-fit`, `scaling` at any iOS text size — calibrated against a real iPhone to within 1–1.5px.
- **Measure** with `--boxes`: every component's box as JSON, for placing `position: absolute` elements by number.

## Install

```sh
npx skills add lis186/line-flex-message-skill
```

Or copy `skills/line-flex-message/` into your agent's skills directory (for example `~/.claude/skills/line-flex-message` for Claude Code). The skill follows the open Agent Skills format, so any agent that reads `SKILL.md` can use it.

Requirements: Node.js 22+ (preview and validation), Chrome or Chromium (preview), bash, curl and jq (validation).

## Validation token

Validation needs the long-lived channel access token of a **test** Messaging API channel — the token can message that channel's friends, so use a channel with no real users. Provide it as `LINE_VALIDATE_TOKEN`; on macOS the skill also reads the keychain item `line-validate` or 1Password (`op://Dev/line-validate/credential`). Without a token, validation reports `valid=skipped` and says acceptance was not verified.

## How accurate is the preview?

See [docs/evaluation.md](docs/evaluation.md): the same tasks given to agents with and without the skill, scored against iPhone screenshots. Without the skill, agents already write valid, qualitatively correct Flex JSON; the skill adds an authoritative validity check, calibrated vertical metrics (text-heavy cards were otherwise over-estimated by 10–15%), and ready-made, tested tooling.

Measured only on iOS so far. Android is not calibrated.

## Develop

```sh
npm test             # renderer vs Simulator output, validate.sh vs a fake API
npm run check-device # iOS mode vs iPhone measurements (needs Chrome and uv)
npm run check-css    # has LINE's Flex stylesheet changed?
```

See [docs/maintaining.md](docs/maintaining.md).

## Disclaimer

Not affiliated with or endorsed by LY Corporation. LINE is a trademark of LY Corporation. The renderer is an independent implementation written from observing the Flex Message Simulator's output and LINE's public documentation; this repository contains no LINE source code or stylesheets — the stylesheet is downloaded from LINE's public CDN at preview time and cached locally.

## License

[MIT](LICENSE)
