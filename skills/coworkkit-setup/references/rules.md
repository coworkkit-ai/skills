# Coworkkit — rules for your coding agent

> The load-bearing rules for wiring and changing a Coworkkit integration, generated from the
> public quickstart. These are the same rules the setup skill writes into your `AGENTS.md`.

- **Provider high.** `<CoworkkitProvider>` wraps the whole signed-in tree, above the app's own context/state/shell providers. A Coworkkit hook rendered outside it registers nothing — the co-worker talks but can't act, and nothing errors.
- **No key in the browser.** The Provider is a one-line mount carrying `tokenUrl` — the path of the token route, e.g. `<CoworkkitProvider tokenUrl="/api/coworkkit/session">` — and takes no key of any kind; there is no `apiKey` prop. The secret is `COWORKKIT_API_KEY`, read only by the server-side token route — never under a browser-readable prefix (`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_`) and never returned to the browser (for example from a Remix loader).
- **Real user id.** The token route derives the acting user's id from the app's own auth, server-side, never from the client. `"dev-user"` is for local development only.
- **Declare where it stays mounted.** A function from an app-wide source (a context or store available on every page) gets its `useAction` in a persistent client component — the nav or shell — so it works from anywhere. Keep an action on its page only when its function is genuinely page-local.
- **Cross-page.** For a page-local target, navigation is a `useElement` on the persistent nav and the target action stays on its own page. Never gate navigation through one page's `handActions` — it applies only while that page is active.
- **Two separate gates.** Hand mode is the touch gate: anything that operates the UI (navigate, click, toggle) is a `useElement` action, gated automatically. `control: "hard"` is the risk gate for costly or destructive actions — an on-screen Confirm the co-worker cannot click itself. A plain data write via `useAction` needs neither.
- **Shape.** `useAction({ name, description, run })` takes one object argument, not an `(event, handler)` pair.
- **Edit, don't overwrite.** Adding Coworkkit code to an existing file keeps every line that file already has. The one-line Provider mount (with its `tokenUrl`) and the token route are exact — take them from the quickstart for this stack, adapting only where they go.
- **Closed loop.** Never choose or configure a voice provider, a model, or a transport, and never add a provider key or connection URL — the runtime supplies all of it.
