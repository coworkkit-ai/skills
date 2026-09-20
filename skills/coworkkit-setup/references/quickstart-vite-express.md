# Coworkkit quickstart — Vite SPA + Express

> The token route lives on a separate Express backend; the Provider mounts in the Vite app.

Hand this to your coding agent, or follow it by hand. The only value you supply is the key — it replaces `<YOUR_API_KEY>` below, is a server-side secret, and never reaches the browser.

You are integrating **Coworkkit** — a voice + agent runtime — into this existing Vite (React) single-page app with an Express backend. Work in two beats: **first**, wire the two runtime seams below so the user gets an AI co-worker they can talk to; **then**, once the developer confirms voice works, *offer* to wire a first action (final section). During the first beat, wire ONLY the seams — no app-specific actions, surfaces, elements, or pages.

**How it works.** Coworkkit is a closed loop. The browser never holds the secret key. The backend holds `COWORKKIT_API_KEY` and mints a short-lived session token; the browser SDK calls that route through `getToken`, receives the token, and self-configures the voice connection from the response. There are two seams to wire — a `<CoworkkitProvider>` in the browser and a backend token-mint route — and nothing else: do not choose or configure a voice provider, a model, or a transport, and never add a provider key or connection URL. The runtime supplies all of that.

**Front end — `@coworkkit/react` (holds no secret).** Install `@coworkkit/react` where this app's browser dependencies live. Then WRAP your existing `src/App.tsx`: keep everything it already contains and move it inside `<CoworkkitProvider>`, matching this shape:

```tsx
import { CoworkkitProvider } from "@coworkkit/react";
import { CoworkkitWatch } from "@coworkkit/react/watch";

export function App() {
  return (
    <CoworkkitProvider
      getToken={async (ctx) => {
        const res = await fetch("/api/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(ctx ?? {}),
        });
        if (!res.ok) {
          // Check before parsing, and guard the parse: an error page (a proxy 404,
          // a framework 500) is often HTML, and a throw here would lose both fields.
          const body = await res.json().catch(() => ({}));
          // Pass the reason AND the status through — that is what lets the button say
          // "Setup needed" for a bad key instead of a generic "Can't connect":
          throw Object.assign(new Error(body.error ?? "session mint failed"), {
            reason: body.reason,
            status: res.status,
          });
        }
        return res.json();
      }}
    >
      {/* ...your existing app... */}
      <CoworkkitWatch />
    </CoworkkitProvider>
  );
}
```

The `{/* ...your existing app... */}` marker is where your current `App` contents go — move them there, don't discard them. Vite apps are all-client, so there's no server/client boundary to manage. If the Vite dev server and Express run on different ports, add a `/api` proxy in `vite.config.ts` so the `fetch` reaches Express.

**Back end — `@coworkkit/server` (holds the key).** Install `@coworkkit/server` where this app's server dependencies live. Put the secret key in `.env (your Express server's root)`:

```bash
COWORKKIT_API_KEY=<YOUR_API_KEY>
```

Keep it server-only — never a `VITE_`-prefixed name (Vite inlines every `VITE_*` var into the client bundle); read it only via process.env. Then ADD this route (and its import) to your existing `server/index.ts`, keeping the rest of that file intact:

```ts
import { CoworkkitError, mintSession } from "@coworkkit/server";

// Mints a session from your secret key (read from COWORKKIT_API_KEY).
// `user.id` is the user the agent acts as. "dev-user" is fine while developing; in production
// derive it from your own auth/session middleware, server-side — never from the client.
app.post("/api/session", express.json(), async (req, res) => {
  try {
    // The SDK posts its context (the browser's time zone + language) — forward it, plus the
    // client IP, so the session is placed in the user's region (used in-request only, never stored).
    const { timeZone, language } = (req.body ?? {}) as { timeZone?: string; language?: string };
    const session = await mintSession(process.env.COWORKKIT_API_KEY!, {
      user: {
        id: "dev-user",
        ...(timeZone ? { timeZone } : {}),
        ...(language ? { languageCode: language } : {}),
        ip: req.ip,
      },
    });
    res.json(session);
  } catch (err) {
    // Relay the real status and reason — a flat 502 would tell the browser "network
    // problem" when the truth is "your key is wrong".
    // `>= 400` matters: mintSession throws with the UPSTREAM status, and a 200
    // carrying an HTML error page throws too — relaying that 200 would make the
    // browser treat the error body as a valid session.
    const status =
      err instanceof CoworkkitError && err.status !== undefined && err.status >= 400
        ? err.status
        : 502;
    const reason = err instanceof CoworkkitError ? err.reason : undefined;
    const error = err instanceof Error ? err.message : "session mint failed";
    res.status(status).json(reason !== undefined ? { error, reason } : { error });
  }
});
```

Derive the acting user id from this app's authenticated session, server-side; the `"dev-user"` placeholder is for local development only.

**Rules for you, the agent.**
- The `<CoworkkitProvider>` wrapper (with its `getToken` prop) and the token-mint route are exact — reproduce them as shown; adapt only *where* each goes to fit this repo.
- Where the instructions above say to create a NEW file, write the whole file; do not splice fragments.
- Where they say to WRAP or ADD TO an existing file, keep every line that file already has and only insert the new code — never overwrite the file or drop its contents. In Remix, leave the `<html>`, `<head>`, `<Meta>`, `<Links>`, and `<Scripts>` exactly as they are and wrap only the `<Outlet />`.
- `<CoworkkitProvider>` takes no key of any kind — there is no `apiKey` prop. The secret lives only in the route above, server-side.
- **Wrap high.** Put `<CoworkkitProvider>` as high as the signed-in tree goes — **around** your app's own context/state/shell providers, not nested inside them. Everything that will ever declare an action must be a descendant of `<CoworkkitProvider>`, and a persistent nav is the usual place actions live — so if your state provider is what renders your nav, the Provider must sit ABOVE that state provider, not just around its inner `{children}`. An action declared in a component that ends up outside `<CoworkkitProvider>` silently registers nothing, and the co-worker talks but can't act.
- When both seams are wired, tell the developer to start their dev server and smoke-test: a small button appears in the bottom-right corner — click it, allow the microphone, and say hello; the agent should reply by voice. Do not wire any actions in this beat — the first-action section below is separate and opt-in.

**Rules of the road — read before you wire any action (the first-action beat).**
- **Start from the real function, and ask where it lives.** Find the function in THIS app that does what the user wants (e.g. the one that changes the display name), and ask where it comes from. If it comes from an app-wide source — a React context/provider mounted high in the tree (a `useAppState`-style hook, a Zustand/Redux/Jotai store) available on every page — mount your `useAction` in a **persistent component** (your nav, or another always-mounted client component — not a Server Component) so it works from anywhere with no navigation. That is the common case and the most robust wiring. Only if the function is genuinely page-local (it exists only while one page is mounted) do you navigate first.
- **Mount shape.** `useAction({ name, description, run })` — a single object argument, NOT an `(event, handler)` pair. Mount it where its function is in scope.
- **Two independent gates.** Hand mode (the *touch* gate) is only for actions that operate the UI the way a hand would — navigate, or click/toggle an on-screen control; declare those with `useElement` (auto-gated). A plain data write via `useAction` is not that — leave it ungated. `control: "hard"` (the *risk* gate) is for costly or destructive actions — the SDK shows an on-screen Confirm the agent cannot click itself. Separate axes.
- **Cross-page — only for a genuinely page-local target.** Wire navigation as a `useElement` on the persistent nav (auto-gated), and keep the target action on its own page; at runtime the agent arms Hand mode → navigates → the page mounts → its action runs. Do not gate navigation via one page's `handActions` — the gate only checks the active page. (Most name/profile/settings changes are app-wide, not this case.)

**Sample action first — wire `celebrate` before anything app-specific (SPEC-0115).** Once voice smoke-tests, the co-worker can talk but can't act until an action is declared. Paste this exact component anywhere inside `<CoworkkitProvider>` — it needs no app knowledge and no dependency, so the developer can prove the co-worker ACTS in ~30 seconds:

```tsx
// CelebrateAction.tsx — paste anywhere inside <CoworkkitProvider>, then say "celebrate".
import { useAction } from "@coworkkit/react";

export function CelebrateAction() {
  useAction({
    name: "celebrate",
    description: "Celebrate: show a short on-screen burst to prove the co-worker can act.",
    run: () => {
      const el = document.createElement("div");
      el.textContent = "🎉 It works — your co-worker just acted.";
      el.setAttribute(
        "style",
        "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:12px 18px;border-radius:999px;background:#111;color:#fff;font:600 15px system-ui;z-index:2147483639",
      );
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 2200);
    },
  });
  return null;
}
```

Then tell the developer to restart the dev server, click the button and say "celebrate" — a small burst confirms it acts, not just talks. That IS the first-action smoke test; the phrase to say is `celebrate`. They delete this component once a real action exists (the next beat).

**First-action beat — offer up front (don't auto-wire, don't defer).** The moment the seams are wired — you have already read this app's code — do not just stop. Tell the developer plainly, in this order: (1) voice is ready to smoke-test; (2) it can talk but can't act yet, because no actions are wired; (3) name the 2–3 things a user would most likely ask for by voice in THIS app, as the **real** functions you found (e.g. `addTask` in `state.tsx`), not generic examples — and ask which one to wire. Wire only the one they pick, following the rules above; if they named one already, wire that. Do NOT defer the survey to later or wait to be asked — you have the code open now, so make the concrete offer immediately. When it's wired, tell them to say it aloud to confirm the co-worker now acts — not just talks.

**What's next — mention, don't wire.** Once that first action works, tell the developer (don't build it now — point them to the **Actions & Surfaces** docs) that two capabilities this prompt deliberately skipped can take the co-worker further: **surfaces** (`useSurface`, telling the agent which page the user is on) and **chime-in** (letting it greet or speak first instead of only answering).
