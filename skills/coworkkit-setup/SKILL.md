---
name: coworkkit-setup
description: >-
  Add a voice AI co-worker to a web app with Coworkkit and prove it works before the developer
  starts a session. Use when a repository has no Coworkkit yet and someone wants voice that both talks
  and does something: it detects the stack (Next.js App Router, Vite + Express, Remix, or other),
  installs @coworkkit/react and @coworkkit/server, wires the browser Provider and a server-side
  token route, declares a first surface and one real action, runs a bundled verifier (versions,
  Provider placement, key hygiene, and a live token mint through the app's own route), and writes
  the load-bearing rules into AGENTS.md. Do not use it to change an existing integration — use the
  coworkkit-declare skill for that.
license: MIT
compatibility: >-
  A JavaScript/TypeScript web front end (Next.js App Router, Vite + Express, Remix, or a similar
  React app) plus a place to run server-side code for the token route. Node 18+ is required for
  the bundled verifier. Browser + WebRTC only — no telephony, no mobile SDK.
metadata:
  sdk: "0.1.0-rc.4"
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
- The `<CoworkkitProvider>` wrapper (with its `getToken` prop) and the token-mint route are exact — reproduce them as shown; adapt only *where* each goes to fit this repo.
- Where the instructions above say to create a NEW file, write the whole file; do not splice fragments.
- Where they say to WRAP or ADD TO an existing file, keep every line that file already has and only insert the new code — never overwrite the file or drop its contents. In Remix, leave the `<html>`, `<head>`, `<Meta>`, `<Links>`, and `<Scripts>` exactly as they are and wrap only the `<Outlet />`.
- `<CoworkkitProvider>` takes no key of any kind — there is no `apiKey` prop. The secret lives only in the route above, server-side.
- **Wrap high.** Put `<CoworkkitProvider>` as high as the signed-in tree goes — **around** your app's own context/state/shell providers, not nested inside them. Everything that will ever declare an action must be a descendant of `<CoworkkitProvider>`, and a persistent nav is the usual place actions live — so if your state provider is what renders your nav, the Provider must sit ABOVE that state provider, not just around its inner `{children}`. An action declared in a component that ends up outside `<CoworkkitProvider>` silently registers nothing, and the co-worker talks but can't act.
- When both seams are wired, tell the developer to start their dev server and smoke-test: a small button appears in the bottom-right corner — click it, allow the microphone, and say hello; the agent should reply by voice. Do not wire any actions in this beat — the first-action section below is separate and opt-in.
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
3. Read the app's entry files before you change anything: the front-end entry (layout/root/`App`), the router or nav, and where server code lives.

## Beat 2 — Account and key

The token route needs one secret: `COWORKKIT_API_KEY`.

1. If the developer does not have a key yet, point them to [app.coworkkit.ai](https://app.coworkkit.ai): sign up (free), create a coworker, and copy its key from the coworker's **API keys** tab.
2. Put the key in a **git-ignored** env file (`.env.local` for Next.js, the Express server's `.env` for Vite, `.env` for Remix). Either have the developer paste it, or write the file yourself — but **never print the key's value, never echo it into chat, and never commit it**. Confirm the env file is covered by `.gitignore` (most `.env*` files already are; add a line if not).

## Beat 3 — Wire the two seams

Follow the quickstart from Beat 1. There are exactly two seams; wire only these in this beat.

- **Front end — `@coworkkit/react`.** Install it, then mount `<CoworkkitProvider getToken={…}>`.
  Mount it **as high as the signed-in tree goes** — above the app's own context/state/shell
  providers, so every component that will ever declare an action is a descendant. It takes **no
  key of any kind**. For a NEW provider file, write the whole file; to WRAP an existing entry file
  keep every line it has and only move its contents inside the Provider.
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

It reports each check as PASS / WARN / FAIL / SKIP and never prints your key. It checks: both
packages installed at the same version and at least the SDK version this skill targets; a
`<CoworkkitProvider>` with a `getToken` prop and **no** key prop; a token route importing
`mintSession` or `coworkkitSessionRoute`; `COWORKKIT_API_KEY` referenced server-side (never under a
browser-exposed prefix like `NEXT_PUBLIC_` / `VITE_` / `PUBLIC_`) in a git-ignored env file; the
count of declared actions, surfaces and elements; and, when `--url` points at a running dev server,
a **live token mint** through the app's own route.

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

Name the exact phrase to say and the exact visible result. If the Coworkkit MCP is connected and
the first session doesn't behave, call `diagnose_session` on the session id; otherwise open the
coworker's **Sessions** page in the portal to see why.

## Beat 8 — Persist the rules

Write the load-bearing rules into the repo so they hold after this skill leaves context:

```
node <this skill's dir>/scripts/verify.mjs --write-rules
```

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
