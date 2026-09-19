# How it works

> The closed loop, end to end: what your app declares, what Coworkkit runs, and why the key never reaches the browser.

Coworkkit gives your app a voice: an agent the user can talk to, which can also see and operate the page. One split makes it all tractable. **You declare your app's brain, and Coworkkit runs everything else.** This page is that model. The primitives you declare get their own page; here we care about where the line sits and why.

## The closed loop

Coworkkit is a **closed loop**: it runs the *entire* voice runtime, end to end. It is not a convenience layer over parts you assemble. It is the whole stack, on our side of the line:

- microphone capture and the WebRTC voice connection;
- speech-to-text, the LLM that reasons, and text-to-speech;
- the on-screen button, the voice visualizer, and the live captions;
- the Hand-mode gate that decides whether the agent may touch your UI.

That last gate has a name. Actions that operate on-page elements are what we call **Hand mode**. The user arms it, and the gate lives in the SDK at the point of dispatch. [Hand mode](/docs/hand-mode) covers arming and the dual-sided gate in full.

You never choose or configure a provider, a model, or a transport. There is nothing to pick, tune, or hold provider keys for. Two things follow from that, and they are the reason the loop is closed rather than pluggable:

- **Your secret key stays server-side.** The browser never receives it (see below), so there is no key to leak into a bundle, a network tab, or a stray log line.
- **There is nothing to wire but two small pieces.** No LiveKit project, no STT/TTS accounts, no model config. The runtime is ours to operate and yours to ignore.

The trade is intentional. You give up provider choice, which almost no in-app agent ever needs to exercise. In return the integration is three small files instead of twenty (a token route, a Provider, and a one-line wrap in your layout), and it stays three as we upgrade the runtime underneath you.

## Two halves: your browser and your backend

The integration splits along one line, the same line the closed loop draws. Your **browser half** holds no secret; your **backend half** holds the key. That split is why there are two packages:

- **Browser half, `@coworkkit/react`:** `CoworkkitProvider` and the hooks. It renders the button and runs your actions against live state. It ships to the client, so it can never hold a secret.
- **Backend half, `@coworkkit/server`:** one route that mints a short-lived token, holding your `COWORKKIT_API_KEY`. It runs on your server, never in the browser.

**Why two installs?** Because the halves live on opposite sides of a security boundary. Anything you ship to the browser is public, so your secret key, and the mint that uses it, have to live server-side in `@coworkkit/server`, while `@coworkkit/react` is the public half. Two installs is that boundary made physical: no build step can accidentally bundle your key into the browser, because the key isn't in the browser package at all. (A single package behind a runtime guard is possible. We keep the packages separate on purpose, so the boundary is structural rather than a convention you could trip over.)

The browser half is just your React tree. It doesn't care whether you route by URL or by state, single-page or server-rendered. The agent knows which view the user is on from `useSurface({ label })`, a human label you pass, never from the URL, so a state-driven SPA is a first-class citizen, not a special case.

## The two pieces of wiring

**One:** a route on your backend holds `COWORKKIT_API_KEY` and mints a short-lived session token. `mintSession` POSTs your key to Coworkkit and returns `{ token, serverUrl, cloudUrl }`; `coworkkitSessionRoute` is the thin Next.js wrapper around it. The key never leaves this file:

**`app/api/session/route.ts`**

```ts
import { coworkkitSessionRoute } from "@coworkkit/server/next";

// COWORKKIT_API_KEY stays here. The browser only ever receives the short-lived token.
export const POST = coworkkitSessionRoute({
  // "dev-user" is dev-only. Before shipping, derive the id from your auth, server-side:
  //   getUserId: async () => (await auth()).userId
  getUserId: () => "dev-user",
});
```

**Two:** in the browser, `CoworkkitProvider` calls that route through `getToken` and self-configures from the response. You never pass your key to it. The Provider takes no key prop at all, so your *secret* key has no path to the client:

**`app/providers.tsx`**

```tsx
<CoworkkitProvider
  getToken={async (ctx) => {
    const res = await fetch("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(ctx ?? {}),
    });
    if (!res.ok) {
      // Guard the parse: an error page is often HTML, and a throw here loses both fields.
      const body = await res.json().catch(() => ({}));
      // Pass the reason AND the status through. That is what lets the button say
      // "Setup needed" for a bad key instead of a generic "Can't connect":
      throw Object.assign(new Error(body.error ?? "session mint failed"), {
        reason: body.reason,
        status: res.status,
      });
    }
    return res.json();
  }}
>
  {children}
</CoworkkitProvider>
```

That is the entire integration surface. The step-by-step version (install, env var, smoke-test) lives in [Getting started](/docs/getting-started). The point here is that there are only ever these two seams.

## What you declare vs. what we run

**You declare your app's brain**: hand-written React hooks that sit where your state already lives, so the agent reasons about the real thing, not a copy:

- **actions**: what the agent can do (`useAction` / `defineAction`);
- **surfaces**: where the user is (`useSurface`);
- **elements**: what it can see and operate (`useElement`);
- **cues**: how to behave (the `cue` field).

**We run everything else**: the connection, the transcription, the model, the voice, the on-screen UI. Your declarations are app-specific and only you can write them; the runtime is undifferentiated and you would never want to. That division is the product. The four primitives get their own page: [Actions, surfaces & elements](/docs/actions-surfaces).

## The request path

Concretely, one session comes up like this:

1. `CoworkkitProvider` mounts and calls your `getToken`.
2. Your route runs `mintSession`, which exchanges your secret key for a short-lived token and returns `{ token, serverUrl, cloudUrl }`.
3. The SDK opens the voice connection with that token and the agent worker joins.
4. Your declared actions, surfaces, elements, and cues stream to the agent over the control channel, and stream again whenever they change.
5. When the user speaks, the agent reasons and calls your actions back. Your `run` handlers execute right there in the browser, against live state.

BrowserCoworkkitProvider→getToken()Your /session routeholds the key→mintSessionCoworkkit runtimemints + runs the session→joinsThe agentreasons, calls your actions←

Short-lived token flows back to the browser — the SDK self-configures from it. Your secret key stays on the route; it never makes that trip.

Every step past the token exchange is Coworkkit's to run. Your job starts and ends at the two seams: the route that mints, and the declarations that describe your app.
