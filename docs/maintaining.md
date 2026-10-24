# Maintaining

The skill lives in `skills/line-flex-message/`; everything else in this repo is for developing it.

## Tests

`npm test` runs:

- `tests/golden.test.mjs`: the renderer in default mode must reproduce the Flex Message Simulator's HTML for every single-property probe in `tests/data/probe-results.json` and every combined case in `tests/data/golden/` (class and style order normalised). Annotated output (`--boxes`) may differ only by `data-path` attributes.
- `tests/validate.test.mjs`: `validate.sh` against a local fake `api.line.me` (results, exit codes, token never leaking, base-URL allowlist).

## Device mode (`--device ios`)

`DEVICE_CSS` and the device script in `scripts/render.mjs` add what the simulator ignores; the default mode must stay identical to the simulator, so device behaviour only ever lives behind `ctx.device`.

`npm run check-device` (needs Chrome and [uv](https://docs.astral.sh/uv/)) renders each card of `tests/device/calibration.json` in iOS mode and compares box heights, line counts and `scaling` sizes with the iPhone measurements in `tests/device/ios-expected.json`.

To recalibrate or add a device: send `tests/device/calibration.json` to a test channel you own, screenshot each card whole, measure with `uv run --with pillow==13.0.0 python tools/measure-device.py <png>...` (and `tools/measure-scaling.py` for card C5 at each text size), then record the findings in `skills/line-flex-message/references/device-<os>.md` and `tests/device/<os>-expected.json`.

## When LINE ships new CSS

- `npm run check-css` reports whether the stylesheet at `CSS_URL` has changed (public CDN only).
- When LINE moves it to a new hash, `node tools/check-css.mjs --diff <new url>` lists the renderer-relevant rules that differ; update `references/measured-values.md`, then bump `CSS_URL` and `CSS_SHA256` in `scripts/render.mjs` (`check-css` prints the new sha256).

The repo stores only the CSS URL and its sha256, never LINE's stylesheet. `preview.mjs` downloads the file into the user's cache directory and refuses any content whose sha256 differs from `CSS_SHA256`.
