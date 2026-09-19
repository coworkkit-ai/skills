# Troubleshooting & FAQ

> The agent connects but is silent, the mic is blocked, the button never appears: the usual first-run snags and their fixes.

The usual first-run snags, and why each one happens. If something here doesn't match what you're seeing, the [Watch panel](/docs/watch) will show you the session's actual state, and your browser console has the exact error.

## Getting connected

### The button never appears.

The `CoworkkitProvider` isn't mounting. Three common causes: it's not wrapping your app, it isn't in a `"use client"` component (`getToken` is a function prop, so the Provider has to be a client component), or you've set `intensity="off"`. The Provider needs to wrap your tree in a client component with a working `getToken`.

### The button appears on my login page too.

You wrapped the root layout. Wrap the layout of your signed-in area instead (in Next.js, the route group's `layout.tsx`), so the button only mounts once there is a user for the agent to act as.

### The agent connects but is silent.

First check your token route: it must return HTTP 200 with a JSON body of `{ token, serverUrl, cloudUrl }`. A 4xx/5xx or a missing field leaves the agent with nowhere to speak from. Then check you allowed the microphone. Finally, if the browser blocked audio autoplay, the SDK shows a one-tap "enable sound" affordance; click it and audio resumes.

### The microphone is blocked, or I get no permission prompt.

The mic needs a **secure context**. It works on `localhost` and on any `https://` origin, but the browser refuses `getUserMedia` on a plain `http://` LAN IP (e.g. testing from your phone against `http://192.168.x.x`), so serve that over HTTPS instead. When the prompt does appear, allow the mic; an earlier "block" sticks until you clear it in the site's permissions.

### My environment variable isn't picked up.

Restart the dev server after editing `.env.local`. The server reads env vars once, at start. A value added or changed while it's running won't be seen until the next boot.

## What the ring is telling you

When a session can't start, the button doesn't just sit there: its ring shows a short status, and the precise cause goes to your browser console (never to your users; they see only the label). Here is every label it can show:

| Ring says | What happened | What to do |
| --- | --- | --- |
| **Setup needed** | Your token route answered with a setup fault: a missing or unknown key, no user.id, or a bare 401/403/404 from the route itself. Also shown when the coworker has no minutes provisioned yet. | Check COWORKKIT_API_KEY is set on the server and the dev server was restarted; confirm the route returns the mint response unchanged. The precise reason is logged to the browser console. |
| **Can’t connect** | The catch-all. The route or the network failed (a 5xx, an unreachable server), the coworker's account is revoked or not yet ready on our side, or your own getToken threw something the SDK couldn't classify: a fetch or CORS bug, a non-JSON body, an error thrown without its status and reason attached. | Open the browser console first; the real error is there. If it came from your code, fix that and make sure getToken relays the status and reason (the Getting started snippet does). If the route is healthy and the console shows a 5xx from us, retry; if it persists, get in touch. |
| **No answer** | The session connected but no agent joined it in time. | Almost always transient; retry in a few seconds. If it keeps happening it's on our side, so get in touch. |
| **Out of credit** | The coworker's workspace has no minutes left. | Top up under Settings → Plan & Billing in the portal; sessions start again immediately. |
| **Line busy** | The coworker is at its daily session limit. | Wait for the day to roll over, or ask us about a higher limit. |

The precision here depends on your `getToken` passing the failure through. If yours returns `res.json()` without checking `res.ok`, an error body comes back as a "session" with no `serverUrl`, and the SDK can only report *Setup needed*, for a bad key, an empty balance, and a busy line alike. You lose the distinction, not the label. The snippet in [Getting started](/docs/getting-started) throws with the status and the `reason` attached, which is what gives the ring its full vocabulary.

## Once you're talking

### I can't see the mute, hand-mode, or end buttons.

They're tucked under the button and hidden until you reach for them: hover the button, tap its face on a touchscreen (they stay up for a few seconds), or Tab onto the button to reach them by keyboard. They also show for three seconds when a session starts. If the mic is muted and the buttons are hidden, a small red dot stays on the button until you unmute or bring the controls back.

### The agent says it can't do that.

Either nothing is declared yet (the agent can only call what your app declares with `useAction` and `useElement`), or the thing it was asked to do is a UI touch and [Hand mode](/docs/hand-mode) isn't armed. Element actions need it by definition. The user arms it from the hand button in the control row; the agent can't arm it itself.

### My action never fires.

Open the [Watch panel](/docs/watch) and check the **Catalogue** tab. If the action isn't listed, the component declaring it isn't mounted on the page the user is on: mount it where its state lives, or in a persistent layout (see [Patterns](/docs/patterns)). If it is listed but the agent picks the wrong tool or none, the `description` is doing the choosing; say plainly what it does and when to use it. If it fires and gets blocked, the **Timeline** tab shows the gate: `needs_hand_mode`, or a confirmation that timed out.

### It worked, then the agent stopped after a while.

Sessions idle-cut after a stretch of inactivity to save your minutes; see [the session lifecycle](/docs/advanced). Nothing's broken; click the button again to start a fresh session.

### Which browsers are supported?

Modern Chromium (Chrome, Edge, Arc, Brave), Safari, and Firefox: anything with WebRTC and microphone access. There's no plugin or extension to install. Details on [Browser & framework support](/docs/compatibility).

### Still stuck?

Email [ebi@coworkkit.ai](mailto:ebi@coworkkit.ai) with the Watch panel's session export (the download button in its header). It carries the state, timeline, and transcript we need to see what you saw.
