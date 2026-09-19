# Coworkkit — rules for your coding agent

> The load-bearing rules for wiring and changing a Coworkkit integration, generated from the
> public quickstart. These are the same rules the setup skill writes into your `AGENTS.md`.

- The `<CoworkkitProvider>` wrapper (with its `getToken` prop) and the token-mint route are exact — reproduce them as shown; adapt only *where* each goes to fit this repo.
- Where the instructions above say to create a NEW file, write the whole file; do not splice fragments.
- Where they say to WRAP or ADD TO an existing file, keep every line that file already has and only insert the new code — never overwrite the file or drop its contents. In Remix, leave the `<html>`, `<head>`, `<Meta>`, `<Links>`, and `<Scripts>` exactly as they are and wrap only the `<Outlet />`.
- `<CoworkkitProvider>` takes no key of any kind — there is no `apiKey` prop. The secret lives only in the route above, server-side.
- **Wrap high.** Put `<CoworkkitProvider>` as high as the signed-in tree goes — **around** your app's own context/state/shell providers, not nested inside them. Everything that will ever declare an action must be a descendant of `<CoworkkitProvider>`, and a persistent nav is the usual place actions live — so if your state provider is what renders your nav, the Provider must sit ABOVE that state provider, not just around its inner `{children}`. An action declared in a component that ends up outside `<CoworkkitProvider>` silently registers nothing, and the co-worker talks but can't act.
- When both seams are wired, tell the developer to start their dev server and smoke-test: a small button appears in the bottom-right corner — click it, allow the microphone, and say hello; the agent should reply by voice. Do not wire any actions in this beat — the first-action section below is separate and opt-in.
