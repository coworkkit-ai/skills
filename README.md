# Coworkkit skills

Agent Skills that take your coding agent from "nothing installed" to a working voice
[Coworkkit](https://coworkkit.ai) integration — an AI co-worker that talks to your users,
sees what is on screen, and operates your app as the signed-in user.

Two skills, one install:

- **`coworkkit-setup`** — detect your stack, install the SDK, wire the token route and the
  Provider, declare a first surface and one real action, then run a bundled verifier (versions,
  Provider placement, key hygiene, a live token mint) before you ever start a session. Ends by writing
  the load-bearing rules into your `AGENTS.md` so they survive after the skill leaves context.
- **`coworkkit-declare`** — the procedure for every later change: choose the right primitive
  (`useAction` / `useSurface` / `useElement` / `cue`), the state-first cross-page recipe, the
  `control` open/soft/hard gate, Hand mode, and propose-then-wire manners.

## Install

Any agent (Claude Code, Cursor, Codex, Copilot, Gemini CLI, and 70+ others), via the open
[`skills` CLI](https://skills.sh):

```
npx skills add coworkkit-ai/skills
```

Claude Code users can install it as a plugin instead — this **also** wires the Coworkkit MCP
server (live docs with no account, plus session diagnostics after a one-time browser sign-in):

```
/plugin marketplace add coworkkit-ai/skills
/plugin install coworkkit@coworkkit
```

No account is needed to install. When it is time to wire the token route you create a free
coworker at [app.coworkkit.ai](https://app.coworkkit.ai) and copy its key — a **server-side**
secret that never reaches the browser and never gets pasted into a chat.

## Use it

Open your app in your coding agent and say:

> Add Coworkkit to this app so I can talk to it by voice — use the coworkkit-setup skill.

Later, to teach the co-worker more:

> Use the coworkkit-declare skill to let the co-worker <do the thing>.

## What "verified" means

`coworkkit-setup` runs `coworkkit-setup/scripts/verify.mjs` (Node 18+, zero dependencies) in your
repo. It checks that both packages are installed at the same version, that `<CoworkkitProvider>`
is mounted with a `tokenUrl` (or `getToken`) prop and no key prop, that the token route reads the
secret server-side from a git-ignored env file, and — when your dev server is running — that a
real token mint through **your own** token route succeeds. It never prints your key.

## Not the source of truth

This repository is **generated** — do not edit it here. The skills' source lives in the
Coworkkit monorepo (`skills/`) and their reference content is derived from the public docs at
[app.coworkkit.ai/docs](https://app.coworkkit.ai/docs); every change is mirrored here by the
release process. Open an issue in this repository rather than sending a pull request — fixes land in the source and are mirrored here.

MIT licensed.
