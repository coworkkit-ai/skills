---
name: coworkkit-declare
description: >-
  Wires more of a web app for its Coworkkit voice co-worker and makes every later change the
  right way. Use once voice is working (coworkkit-setup done) and someone wants the co-worker to
  do more — add or change an action, a surface, an element or a cue, make it navigate, confirm a
  risky action, or fix a co-worker that talks but does not act. Picks the right primitive
  (useAction, useSurface, useElement, cue), mounts it where it stays reachable (state-first),
  sets the control gate (open / soft / hard) by cost, keeps Hand mode as the separate touch
  axis, proposes before wiring, and re-runs the bundled verifier. Use coworkkit-setup instead
  for the first install and the token route.
license: MIT
compatibility: >-
  A repository already integrated with Coworkkit (a <CoworkkitProvider> mounted with getToken and a
  server-side token route — coworkkit-setup's job). React front end; Node 18+ for the bundled
  verifier. Browser + WebRTC only.
metadata:
  sdk: "0.1.0-rc.4"
---

# Declare what the co-worker can do, and change it safely

This is the procedure for every change after voice is working: teaching the co-worker a new thing,
adjusting one it already has, or steering how it behaves. The vocabulary is small — **four
primitives and two gates** — and the craft is entirely in *where* each declaration lives, *which*
gate it gets, and *what* you tell the agent about it. Work one capability at a time.

Content you can read in full, live or bundled — **prefer the live copy, fall back to the bundled
one** (and if the Coworkkit MCP is connected, `get_docs` fetches the same pages):

- Primitives: `references/actions-surfaces.md` · `https://app.coworkkit.ai/docs-md/actions-surfaces.md`
- Where to mount / cross-page / descriptions: `references/patterns.md` · `https://app.coworkkit.ai/docs-md/patterns.md`
- The confirmation gate: `references/control.md` · `https://app.coworkkit.ai/docs-md/control.md`
- The touch gate: `references/hand-mode.md` · `https://app.coworkkit.ai/docs-md/hand-mode.md`
- How the loop fits together: `references/how-it-works.md` · `https://app.coworkkit.ai/docs-md/how-it-works.md`

The rules coworkkit-setup wrote into this repo's `AGENTS.md` still hold — read them first, they are
the floor. Everything below is how to build well on top of them.

## 1 — Choose the primitive

Four primitives describe the app to the co-worker. Reach for whichever fit; you rarely need all
four on one page. Each is a hook that lives wherever the relevant React state already lives.

- **`useAction`** — a function the co-worker can call: a `name`, a `description` it reads to decide
  *when* to call, optional JSON-Schema `parameters`, and a `run` handler. This is "what it can do."
  (`defineAction` is the same shape at module scope, for a function with no React state to hang off —
  make sure that module is imported somewhere.)
- **`useSurface`** — where the user is: a human `label` (the identity the co-worker says aloud) plus
  optional ambient `data` (counts, the current item) it can see. A declared surface also makes the
  very first greeting aware of the page.
- **`useElement`** — a thing on the page the co-worker can see and *operate*: a `name`, optional live
  `state`, and — when interactive — an `actions` map (navigate, toggle, open a panel). Element
  actions are a UI touch by definition, so they are Hand-gated automatically.
- **`cue`** — one sentence about *what matters here or how to behave*, set on a surface or an
  element. The co-worker reads it as data to weigh, never as a script to obey.

Read/interactive is just the presence of `actions` on the element; there is no separate read-only
primitive. Full shapes and fields: `references/actions-surfaces.md`.

## 2 — Mount it where it stays reachable (state-first)

**A declaration exists only while the component that made it is mounted.** That one rule decides
placement, and getting it wrong is the most common failure — a hook on a page that unmounts
registers nothing the moment the user navigates away.

- **App-wide function** (a context, a store, a mutation available on every page): declare it in a
  component that is **always mounted** — the nav, the shell, or a small client component in the
  signed-in layout. It then works from anywhere with no navigation. This is the common case and the
  most robust wiring. In Next.js a layout is a Server Component, so give it one small `"use client"`
  child that holds the app-wide declarations.
- **Genuinely page-local function** (it exists only while one page is open): declare it on that page,
  next to the state it changes, and use the cross-page recipe below so the co-worker gets there
  first.

### The cross-page recipe

"Change my name", asked from the Tasks page, when the name form only exists on Settings. The
co-worker has to navigate first, and navigating is a UI touch:

- **Navigation is a `useElement` on the persistent nav** (always mounted, Hand-gated by definition),
  with `actions` like `goToSettings: () => router.push("/settings")`.
- **The target action stays on its own page**, next to the state it changes.

At runtime: the user arms Hand mode → the co-worker calls `navigation.goToSettings` → the Settings
page mounts and its action appears → the co-worker calls it. Do **not** gate navigation through one
page's `handActions` (that list only applies while that surface is active). Full example:
`references/patterns.md`.

## 3 — Set the control gate by cost

Every action carries a `control` level — how firmly the call is gated before it fires. Choose it by
one question: **how costly is this to get wrong?**

- **`open` (default)** — fires immediately. Reads and anything reversible (add a task, rename).
- **`soft`** — the co-worker confirms out loud and proceeds only on a yes. Meaningful but recoverable
  (archive a thread, send an email).
- **`hard`** — the SDK raises an on-screen Confirm / Cancel card that a real person must click; **the
  co-worker can never fire it itself.** Destructive, irreversible, or spends money (delete, pay,
  revoke). Give it a `confirmationSummary` for custom phrasing or a live count.

A name containing `delete`/`remove`/`wipe`/`purge`/`erase`/`destroy` with no `control` is nudged to
`soft` as a backstop — choose explicitly anyway. Details and the card: `references/control.md`.

## 4 — Keep Hand mode as the separate touch axis

`control` and **Hand mode** are different axes and they compose. Hand mode answers *may the
co-worker operate the UI at all* — a switch **only the user** arms (from the hand button in the
Coworkkit button's control row); the co-worker can never arm it itself. `control` answers *how firmly is this
one call confirmed* once it is allowed to run.

- Every `useElement` action is Hand-gated automatically — operating a mounted element is a UI touch.
- A plain `useAction` is ungated unless you list its name in `useSurface`'s `handActions` (which
  applies only while that surface is active — for something reachable from anywhere, make it a
  `useElement` on the persistent nav instead).
- A `hard`-controlled element action must clear **both** gates: Hand mode armed *and* a click on the
  card.

The gate is enforced on both sides (SDK-authoritative, runtime pre-checks the same rule), so a
disarmed UI-touch call never leaves the browser. Full story: `references/hand-mode.md`.

## 5 — Manners: propose, then wire (one at a time)

Do not auto-wire a pile of actions. Work in small beats, the way a good co-worker onboards:

1. Survey the app and name the **two or three** things a user would most likely ask for by voice, as
   the **real** functions in this code (not generic examples).
2. **Propose them and ask which to wire** — one at a time. Wire only what the developer picks.
3. Write a `description` that says what it does *and when to use it*, in the words a user would say,
   and describe every parameter. The `description` is the only thing the co-worker reads to decide
   whether to call it; overlapping or vague descriptions are why an agent picks the wrong action.
4. Keep `data` / `state` small and meaningful (the id the co-worker passes back, the three counts
   that answer "what's left?"), and nothing you would not want read aloud.
5. Use a `cue` to *steer, not script*: "the user is reviewing an overdue invoice; the due date is
   what matters" — never "always offer a reminder." Persona-level behaviour (tone, hard limits)
   belongs in the coworker's boundaries in the portal, not in a cue.

Then say it aloud and confirm the change works before moving to the next. If the app has a dev Watch
panel, its Catalogue tab shows exactly what is mounted right now — if an action you expect isn't
listed, it's on a component that isn't mounted.

## 6 — Verify after every change

Re-run the bundled verifier from the repo root after any change to an action, a surface, an element,
the Provider, or the token route:

```
node <coworkkit-setup skill dir>/scripts/verify.mjs --url http://localhost:<dev-port>
```

It re-checks Provider placement and key hygiene, reports the counts of actions / surfaces / elements
it now finds, and (with `--url` on a running dev server) mints a live token through the app's own
route. Fix every FAIL before telling the developer the change is ready. If the Coworkkit MCP is
connected, `check_setup` and `diagnose_session` add a live view after the next session.

## Never do these

- Put the key, or anything key-shaped, in the browser — there is no key prop; the secret lives only
  in the token route, server-side.
- Trust a client-supplied user id in the token route — derive it from your own auth.
- Declare an action on a component that unmounts when the user leaves the page it works from.
- Gate navigation through one page's `handActions` — make it a `useElement` on the persistent nav.
- Leave a delete on `open` because "the co-worker will ask first" — only `hard` can't be talked past.
- Choose or configure a voice provider, model, or transport — there is nothing to configure; the
  closed loop supplies all of it.
