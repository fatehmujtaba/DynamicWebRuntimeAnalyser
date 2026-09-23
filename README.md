# Dynamic Website Runtime Analyzer

Records how a website behaves at runtime — DOM, CSS, network traffic, console
output, and user interactions — and exports it as a structured, inspectable
session you can browse in a dashboard. Treats a website as a graph of UI
*states* (pages, modals, dropdowns, tabs) connected by the interactions that
cause transitions between them, rather than just a pile of scraped pages.

Two ways to build a session:

- **Manual recording** — you browse the site yourself (log in, click around);
  every interaction, resulting state, and network call is captured automatically.
- **Automatic exploration** — point it at a URL and it discovers and clicks
  through links/buttons/tabs on its own, within configurable safety boundaries
  (no payments, deletes, logouts, or form submissions by default).

## Architecture

```
src/
  browser/     Playwright browser/session lifecycle, storage-state reuse for logins
  recorder/    DOM mutation, CSS, network, console, interaction, screenshot capture
  explorer/    Element discovery, state fingerprinting, safety boundaries, the exploration loop
  analysis/    Builds the state graph + unified timeline from the raw per-event logs
  storage/     Session/artifact storage (JSON + content-addressed files on disk)
  server/      Express API that serves recorded sessions to the dashboard
  cli.ts       `record` and `explore` commands
dashboard/     React + Tailwind UI for browsing recorded sessions
tests/         Automated smoke tests (run against a public test site)
scripts/       Dev utilities (seed sample data, visual QA)
data/sessions/ Recorded sessions land here (gitignored — this is output, not source)
```

Recorder and explorer are deliberately decoupled: the explorer only decides
*what* to click; clicking through Playwright fires the same interaction
listeners a manual session would, so every explored click gets full capture
for free.

## Requirements

- Node.js 22+
- macOS/Linux/Windows (Playwright installs its own Chromium via `postinstall`)

## Setup

```bash
npm install                    # installs deps + Chromium for Playwright
cd dashboard && npm install    # dashboard has its own package.json
cd ..
```

## Usage

### Record a session manually

```bash
npm run record -- https://example.com
```

Opens a real (headed) Chromium window. Log in and browse normally — every
click, hover, form field change, DOM mutation, network call, and console
message is captured continuously; full DOM/screenshot snapshots are taken at
meaningful checkpoints (navigation, interaction, manual trigger), not on
every event. Press **Enter** in the terminal at any time to force an extra
checkpoint. Type `stop` + Enter (or just close the browser window) to end the
recording and export it to `data/sessions/<session-id>/`.

Useful flags: `--headless`, `--output <dir>`, `--storage-state <path>` (reuse
a previously saved login), `--checkpoint-debounce <ms>`.

### Explore a site automatically

```bash
npm run explore -- https://example.com
```

Same startup flow (log in if needed, press Enter to begin), then the explorer
discovers interactive elements and clicks through them on its own —
non-destructive by default (see **Safety boundaries** below).

Useful flags: `--allowed-domain <hostname>` (repeatable; root URL's hostname
is always included), `--max-depth <n>` (default 2), `--max-actions <n>`
(default 20), `--allow-form-submission` (off by default), plus the same
`--headless` / `--output` / `--storage-state` flags as `record`.

#### Safety boundaries (automatic exploration only)

By default the explorer never submits a native form and skips any element
whose visible text/label matches a blocked-action pattern (delete, remove,
pay, checkout, purchase, order, confirm, cancel, log out, sign out, send,
submit, unsubscribe, deactivate). It only follows links within the allowed
domain list. Every skip is recorded with a reason in the exploration report —
nothing is silently dropped.

### Browse a recorded session in the dashboard

```bash
npm run serve            # terminal 1 — API server on :4000
npm run dashboard:dev    # terminal 2 — Vite dev server on :5173 (proxies /api to :4000)
```

Open the printed dashboard URL. You'll see every session under
`data/sessions/`: stats, a state list or graph view, per-state tabs
(screenshot / DOM / CSS / network / events), a before/after computed-style
diff for the element that was interacted with, a chronological timeline of
every captured event, and a side-by-side state comparison view with DOM/CSS
diffing.

For a production-style single-process setup instead:

```bash
npm run dashboard:build  # builds dashboard/dist
npm run serve            # now also serves the built dashboard at :4000
```

### Tests

```bash
npm test           # manual-recording pipeline, against a public test login page
npm run test:explore  # automatic exploration, against a public link-heavy test page
```

Both hit `the-internet.herokuapp.com`, a site built for exactly this kind of
automation testing.

## Session output

Each run produces `data/sessions/<session-id>/`:

| File/dir | Contents |
| --- | --- |
| `session.json` | Summary + counts |
| `states.json`, `states/<n>-<id>/` | Every captured UI state: `dom.html`, `screenshot.png`, optional `element-snapshot.json` |
| `interactions.jsonl`, `network.jsonl`, `console.jsonl`, `mutations.jsonl` | Append-only raw event logs |
| `graph.json` | States as nodes, interactions as edges — the runtime state graph |
| `timeline.json` | Every event kind merged into one chronological stream |
| `resources/` | Content-addressed CSS/JS/HTML bodies + source maps (deduplicated by hash) |
| `exploration-report.{json,md}` | Present for `explore` sessions: explored/duplicate/skipped/failed, with reasons |
| `report.md` | Human-readable summary |
| `.auth/storage-state.json` | **Private** — the saved login. Never read by the dashboard/exports. |

Passwords and other sensitive field values are never written anywhere; only
element locators/metadata are recorded. Network headers/bodies are sanitized
(cookies, auth tokens, credential-shaped JSON keys redacted).

## Known limitations

- Duplicate-state detection uses a structural fingerprint (route + visible
  interactive elements' roles/labels), not full-page hashing — it's a
  heuristic, not a guarantee.
- The explorer restores state by reloading the root URL and replaying clicks,
  not browser back-navigation, per the architecture's guidance that this is
  more reliable for authenticated/SPA workflows — but it means exploration is
  slower than a naive crawler.
- Coverage is inherently partial: this records and reports what was actually
  observed, not a claim of complete site coverage.
