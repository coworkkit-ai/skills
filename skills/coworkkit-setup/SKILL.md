---
name: coworkkit-setup
description: >-
  Adds a voice AI co-worker to a web app with Coworkkit and proves it works before the developer
  starts a session. Use when someone asks to add voice, a voice assistant or a voice agent to
  their app, to set up, install or integrate Coworkkit (@coworkkit/react, @coworkkit/server), or
  when a repository has no Coworkkit yet. Detects the stack (Next.js App Router, Vite + Express,
  Remix, or another React app), wires the browser Provider and a server-side token route,
  declares a first surface and offers one real action, runs a bundled verifier (versions,
  Provider placement, key hygiene, and a live token mint through the app's own route), and
  writes the durable rules into AGENTS.md. Not for changing an existing integration — use
  coworkkit-declare for that.
license: MIT
compatibility: >-
  A JavaScript/TypeScript web front end (Next.js App Router, Vite + Express, Remix, or a similar
  React app) plus a place to run server-side code for the token route. Node 18+ is required for
  the bundled verifier. Browser + WebRTC only — no telephony, no mobile SDK.
metadata:
  sdk: "0.1.0-rc.6"
---

# Add a voice co-worker with Coworkkit, and verify it

Take this app from no Coworkkit to a first voice session that **talks and does something**, then
leave the rules in place for every later change. Coworkkit is a closed loop: your app declares
what the co-worker can do and where the user is; Coworkkit runs the speech, the model and the
transport behind a short-lived session token your own backend mints. You never choose or configure
a voice provider, a model, or a transport, and there is no key in the browser.

Work the beats in order. Do not skip the verify beat, and do not wire app-specific actions until
after voice is confirmed.

## Beat 0 — Rules you follow throughout

<!-- coworkkit:rules:start -->
- **Provider high.** `<CoworkkitProvider>` wraps the whole signed-in tree, above the app's own context/state/shell providers. A Coworkkit hook rendered outside it registers nothing — the co-worker talks but can't act, and nothing errors.
- **No key in the browser.** The Provider is a one-line mount carrying `tokenUrl` — the path of the token route, e.g. `<CoworkkitProvider tokenUrl="/api/coworkkit/session">` — and takes no key of any kind; there is no `apiKey` prop. The secret is `COWORKKIT_API_KEY`, read only by the server-side token route — never under a browser-readable prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`) and never returned to the browser (for example from a Remix loader).
- **Real user id.** The token route derives the acting user's id from the app's own auth, server-side, never from the client. `"dev-user"` is for local development only.
- **Declare where it stays mounted.** A function from an app-wide source (a context or store available on every page) gets its `useAction` in a persistent client component — the nav or shell — so it works from anywhere. Keep an action on its page only when its function is genuinely page-local.
- **Cross-page.** For a page-local target, navigation is a `useElement` on the persistent nav and the target action stays on its own page. Never gate navigation through one page's `handActions` — it applies only while that page is active.
- **Two separate gates.** Hand mode is the touch gate: anything that operates the UI (navigate, click, toggle) is a `useElement` action, gated automatically. `control: "hard"` is the risk gate for costly or destructive actions — an on-screen Confirm the co-worker cannot click itself. A plain data write via `useAction` needs neither.
- **Shape.** `useAction({ name, description, run })` takes one object argument, not an `(event, handler)` pair.
- **Edit, don't overwrite.** Adding Coworkkit code to an existing file keeps every line that file already has. The one-line Provider mount (with its `tokenUrl`) and the token route are exact — take them from the quickstart for this stack, adapting only where they go.
- **Closed loop.** Never choose or configure a voice provider, a model, or a transport, and never add a provider key or connection URL — the runtime supplies all of it.
<!-- coworkkit:rules:end -->

## Beat 1 — Detect the stack and get the quickstart

1. Identify the front-end framework and where server-side code runs:
   - **Next.js App Router** (`app/` directory) — the token route is a route handler in the same project.
   - **Vite + Express** — the Provider mounts in the Vite app; the token route is added to the Express server.
   - **Remix** — the token route is a resource route; the Provider wraps `app/root.tsx`.
   - **Other React app** — follow the closest of the above; the token route is any server endpoint that can read an environment variable.
2. Get the exact, current wiring for that stack. **Prefer the live copy**, fall back to the bundled one:
   - Live: fetch `https://app.coworkkit.ai/docs-md/quickstart-<framework>.md`
     (`quickstart-nextjs-app-router.md`, `quickstart-vite-express.md`, `quickstart-remix.md`).
   - Bundled fallback: `references/quickstart-<framework>.md` in this skill.
   - If the Coworkkit MCP is connected (Claude Code plugin path), call `get_started` for the same content instead of fetching.
3. **Use the quickstart for the exact code and where each file goes — nothing else.** It is written as a standalone prompt with its own two-step flow. Where its procedure differs from this skill (it says to skip surfaces, and to smoke-test before anything is verified), this skill's beats win: declare the landing surface (Beat 4), make the first-action offer (Beat 5), and verify (Beat 6) before anyone starts a session.
4. Read the app's entry files before you change anything: the front-end entry (layout/root/`App`), the router or nav, and where server code lives.

## Beat 2 — Account and key

The token route needs one secret: `COWORKKIT_API_KEY`.

1. If the developer does not have a key yet, point them to [app.coworkkit.ai](https://app.coworkkit.ai): sign up (free), create a coworker, and copy its key from the coworker's **API keys** tab.
2. The key goes in a **git-ignored** env file (`.env.local` for Next.js, the Express server's `.env` for Vite, `.env` for Remix). **Do not ask for the key in chat.** Ask the developer to add the line `COWORKKIT_API_KEY=<their key>` to that file themselves and tell you when it is done; if the line is already there, leave it alone. To check, test for the line's presence without printing its value — for example `grep -c '^COWORKKIT_API_KEY=' .env.local`. If the developer pastes the key into chat anyway, write it to the env file and never repeat it back. Never print, log or commit the key's value, and confirm the env file is covered by `.gitignore` (most `.env*` files already are; add a line if not).

## Beat 3 — Wire the two seams

Follow the quickstart from Beat 1. There are exactly two seams; wire only these in this beat.

- **Front end — `@coworkkit/react`.** Install it, then mount
  `<CoworkkitProvider tokenUrl="/api/coworkkit/session">` in the app's root layout — `tokenUrl` is
  the path of the token route below (the SDK POSTs to it). Under Next.js App Router it goes
  directly in `app/layout.tsx`, inside `<body>`: a Server Component can host it, so there is no
  client wrapper file to create. Mount it **as high as the signed-in tree goes** — above the app's
  own context/state/shell providers, so every component that will ever declare an action is a
  descendant. It takes **no key of any kind**. To WRAP an existing entry file (layout, root,
  `App`), keep every line it has and only move its contents inside the Provider; if the entry file
  does not exist yet, write the whole file.
- **Back end — `@coworkkit/server`.** Install it, then add the token-mint route that reads
  `COWORKKIT_API_KEY` server-side and returns the session. Next.js uses `coworkkitSessionRoute`
  from `@coworkkit/server/next`; other backends use `mintSession` from `@coworkkit/server`. For a
  NEW route file, write the whole file; to ADD a route to an existing server file, keep the rest of
  that file intact.

Install both packages at the **same version**. If the app uses pnpm, yarn or bun, use that package
manager's install command rather than `npm`.

**User id.** If the app has real authentication, derive the acting user's id from it, server-side.
If you must leave the `"dev-user"` placeholder, note it — it is a before-production item for the
closing report.

## Beat 4 — Declare the landing surface (always)

Before the first session, declare one `useSurface` on the app's landing/main view, e.g.:

```tsx
useSurface({ label: "Tasks board", data: { total: tasks.length, remaining } });
```

`label` is the whole identity; `data` is optional ambient state the co-worker can see. Declaring a
surface makes the very first greeting aware of where the user is — with no runtime change. Pick a
short, human label for the page the user lands on.

## Beat 5 — Offer the first action (don't auto-wire, don't defer)

You have the app's code open now, so make a concrete offer immediately:

1. Tell the developer plainly: voice is ready to smoke-test, but it can talk and not yet act,
   because no actions are wired.
2. Name the **two or three** things a user would most likely ask for by voice in **this** app, as
   the **real** functions you found (e.g. `addTask` in `state.tsx`) — not generic examples — and
   ask which one to wire.
3. Wire **only** the one they pick, as a `useAction({ name, description, run })`:
   - If its function comes from an **app-wide** source (a context/store available on every page),
     mount the `useAction` in a **persistent component** (the nav or another always-mounted client
     component) so it works from anywhere. This is the common case.
   - Only if the function is **genuinely page-local** (it exists only while one page is mounted),
     wire navigation as a `useElement` on the persistent nav and keep the action on its page.

See `references/actions-surfaces.md` and `references/patterns.md` (or the live
`https://app.coworkkit.ai/docs-md/patterns.md`) for mount shape and the gates. Deeper wiring is the
`coworkkit-declare` skill's job — wire exactly one action here.

## Beat 6 — Verify (fix every FAIL, then re-run)

Run the bundled verifier from the app's repo root:

```
node <this skill's dir>/scripts/verify.mjs --url http://localhost:<dev-port>
```

`<this skill's dir>` is the folder that contains this SKILL.md — in the app's repo that is typically `.claude/skills/coworkkit-setup` or `.agents/skills/coworkkit-setup`.

It reports each check as PASS / WARN / FAIL / SKIP and never prints your key. It checks: both
packages installed at the same version and at least the SDK version this skill targets; a
`<CoworkkitProvider>` with a `tokenUrl` or a `getToken` prop (one or the other — both is a WARN)
and **no** key prop; a token route importing `mintSession` or `coworkkitSessionRoute`;
`COWORKKIT_API_KEY` referenced server-side (never under a browser-exposed prefix like
`NEXT_PUBLIC_` / `VITE_` / `PUBLIC_`) in a git-ignored env file; the count of declared actions,
surfaces and elements; and, when `--url` points at a running dev server, a **live token mint**
through the app's own route.

- Fix **every FAIL** and re-run until there are none. A FAIL maps to a fix (see
  `references/error-codes.md` / `references/troubleshooting.md`).
- If the live check SKIPs because the dev server is not running, ask the developer to start it and
  re-run with `--url`.
- Do not tell the developer to start a session until the verifier exits with no FAIL.

## Beat 7 — First magic

Give the developer the exact moment, tied to the action you wired. For example, if you wired
`addTask`:

> Start the app, click the Coworkkit button in the bottom-right corner, allow the microphone, and
> say **"add a task to call mom"**. You'll hear the co-worker reply, and a new "call mom" task
> appears in the list.

If no action is wired yet — the developer declined, or the app has no real functions yet — the first magic is the greeting itself: *start the app, click the small round button in the bottom-right corner, allow the microphone, and say **"hello — where am I?"*** The co-worker replies by voice and names the surface you declared.

Name the exact phrase to say and the exact visible result. If the Coworkkit MCP is connected and
the first session doesn't behave, call `diagnose_session` on the session id; otherwise open the
coworker's **Sessions** page in the portal to see why.

## Beat 8 — Persist the rules

Write the load-bearing rules into the repo so they hold after this skill leaves context:

```
node <this skill's dir>/scripts/verify.mjs --write-rules
```

`<this skill's dir>` is the folder that contains this SKILL.md — in the app's repo that is typically `.claude/skills/coworkkit-setup` or `.agents/skills/coworkkit-setup`.

This inserts (or updates, idempotently) a `<!-- coworkkit:rules:start -->` … `<!-- coworkkit:rules:end -->`
block into `AGENTS.md` (created if absent), and adds an `@AGENTS.md` import line to `CLAUDE.md` if
that file exists and lacks it. Re-running it never duplicates the block.

## Beat 9 — Report

Close with a short report containing:

- **Files written / changed** — each path.
- **Assumptions** — the user-id source (real auth vs the `"dev-user"` placeholder) and the token
  route path.
- **Before production** — if `"dev-user"` is still in the route, flag it: derive the real user id
  from the app's auth before shipping.
- **What to test** — the first-magic phrase and its visible result.
- **Next** — run the `coworkkit-declare` skill to wire more of the app (more actions, surfaces,
  elements, the `control` gate, Hand mode).

## When the Coworkkit MCP is connected

If the Claude Code plugin installed the MCP, prefer it: `get_started` / `get_docs` for content, and
`check_setup` / `diagnose_session` after the first session. When it is not connected, use the live
docs markdown and the bundled `references/`, plus the portal's Sessions page — every beat above
still applies with no loss.
