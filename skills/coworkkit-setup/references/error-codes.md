# Error codes

> Every error you can meet, by layer: the POST /session refusals and their reason tokens, what the button shows for each, the action-level codes your handlers and onActionRecord see, session-end reasons, and the microphone messages.

Errors reach you at three layers, and each has its own vocabulary. A refused session mint carries a `reason` token on the wire; the button turns that into a short ring label for the user; and an action the agent calls answers with a `code` in its RPC envelope. Nothing on the wire is called `code`. This page lists all three, then the session-end reasons you'll see in Watch and the microphone messages.

## Minting a session: POST /session

Every refusal is JSON with two fields, `error` (a sentence for a log line) and `reason` (a stable token for your code):

```json
{ "error": "out of credit", "reason": "out_of_credit" }
```

Relay the status and the `reason` to the browser unchanged (the [Getting started](/docs/getting-started) route does) and the button shows the right label. The right-hand column is what the user sees when you do:

| HTTP | reason | What happened | Ring says | What to do |
| --- | --- | --- | --- | --- |
| 401 | `missing_api_key` | No x-api-key header reached us. | **Setup needed** | Set COWORKKIT_API_KEY on the server and restart it. |
| 401 | `unknown_api_key` | The key doesn't match any workspace. | **Setup needed** | Check the key, and that it belongs to the workspace you think it does. |
| 403 | `tenant_revoked` | The workspace's access has been revoked. | **Can’t connect** | Nothing in your code fixes this; get in touch. |
| 400 | `missing_user` | The mint body carried no user.id. | **Setup needed** | Derive user.id server-side from your own authenticated session and send it. |
| 400 | `retired_field` | The mint body sent the retired top-level userId / userIp instead of user.id / user.ip (SPEC-0106). | **Setup needed** | Move the id under user.id and the client IP under user.ip; update @coworkkit/server to ≥ 0.1.0-rc.3. |
| 429 | `session_cap` | The workspace is at its daily session limit. | **Line busy** | Wait for the day to roll over, or ask us about a higher limit. |
| 429 | `daily_limit` | This user has used their whole daily minute allowance — the per-user Quota wall. | **Daily limit reached** | The user's daily allowance resets at 00:00 UTC; raise it under the coworker's Quotas card (Starter+). |
| 429 | `unmetered` | The workspace has no credit balance provisioned at all: a setup gap on our side, not an empty balance. | **Setup needed** | Get in touch; nothing in your code fixes this. |
| 429 | `out_of_credit` | The workspace's minutes are used up. | **Out of credit** | Top up under Settings → Plan & Billing; sessions start again immediately. |
| 503 | `transport_unassigned` | The workspace has no voice transport assigned yet, so the session can't be placed. | **Can’t connect** | A provisioning step on our side; get in touch. |
| 503 | `no_cell_in_region` | The workspace is pinned to a region with no capacity available right now; we refuse rather than serve it elsewhere. | **Can’t connect** | Retry. If it persists, get in touch. |

Three answers carry no `reason`. A `404` `{ "error": "not found" }` means a wrong path or method, usually a mistyped `COWORKKIT_CLOUD_URL`; the ring reads it as a bare 4xx and says *Setup needed*. A `500` `{ "error": "internal error" }` is a fault on our side; the ring says *Can’t connect*, retry, and tell us if it persists. And a non-JSON body means something in front of the service answered instead of it (a proxy, a captive portal, a placeholder page); `mintSession` throws on it even when the status is 200, and the ring says *Can’t connect*.

`reason` is an **open set**: new tokens are added, existing ones aren't renamed or removed, and a value you don't recognize is not an error in your integration. Fall back to the HTTP status.

### CoworkkitError

On your server, `mintSession` throws exactly one class, `CoworkkitError` (exported by `@coworkkit/server` and `@coworkkit/react`), for any non-2xx status and for a 2xx whose body isn't JSON:

```ts
import { CoworkkitError, mintSession } from "@coworkkit/server";

try {
  return await mintSession(process.env.COWORKKIT_API_KEY!, { user: { id: userId } });
} catch (err) {
  if (err instanceof CoworkkitError) {
    err.status; // HTTP status of /session, e.g. 429
    err.reason; // the token above when the service sent one, e.g. "out_of_credit"
    err.message; // "Coworkkit /session failed (HTTP 429): out of credit"
  }
  throw err;
}
```

A network failure (DNS, a refused connection) is not wrapped: it surfaces as `fetch`'s own `TypeError`. The key never appears in the message.

The Next.js drop-in route maps these for you: a missing `COWORKKIT_API_KEY` answers `500` `{ "error": "COWORKKIT_API_KEY is not set" }`; a `CoworkkitError` answers with the upstream status when it's 400 or above and `502` otherwise (so a 200-with-HTML can't pass your browser's `res.ok` check), with `{ "error", "reason" }` as the body; anything else thrown, including your own `getUserId`, answers `502` `{ "error": "<its message>" }`.

## What the user sees

A failed start never shows a dialog. The button's ring shows one of five short labels for a few seconds (the full table, with fixes, is on [Troubleshooting](/docs/troubleshooting)), and the precise cause goes to the browser console as `[coworkkit] connect failed (reason: …, status: …)`. Two of the labels come from timing rather than a token: *Can’t connect* when the voice connection hasn't established within **10 seconds**, and *No answer* when the session is up but no agent has joined within **15 seconds**. There's no callback for a failed start today; the ring and the console are the surface. If you need to branch on it in code, tell us.

## Actions: the RPC codes

When the agent calls an action, the browser answers with an envelope: `ok: true` and the result, or `ok: false` and `error: { code, message, retryable? }`. The agent never reads a code aloud; it turns each into a natural sentence. These are the codes produced today:

| code | When | What the user hears |
| --- | --- | --- |
| `needs_hand_mode` | A UI-touch action was called while Hand mode is off. Nothing ran. | The agent offers Hand mode once, in plain words, and waits. |
| `needs_confirmation` | A hard action raised its confirmation card. The handler runs only after Confirm. | The agent asks the user to tap Confirm on screen. |
| `confirmation_busy` | Another confirmation is still on screen. | The agent asks the user to resolve that one first. |
| `not_found` | The action isn't declared on the page the user is viewing. | The agent offers to take the user there, and never pretends it worked. |
| `internal` | Your handler threw. The message is your Error.message, verbatim. | The agent phrases the failure naturally, so write that message for a person. |
| `invalid_args` | The call's payload wasn't valid JSON. Internal; report it if you ever see it. | The agent phrases a failure. |
| `unavailable` | The session isn't connected. Transient. | The agent phrases a failure. |

Every call also produces one `ActionRecord` for your `onActionRecord` prop (see [Control](/docs/control)). Its `gate` is one of `fired`, `needs_hand_mode`, `confirmed`, `cancelled` or `timeout`, and when the handler ran its `outcome` carries `ok` plus, on failure, the same `{ code, message }` as the envelope. A cancelled or timed-out confirmation records `ok: false` with no error object: the user declined, nothing failed. The confirmation timeout is **60 seconds** by default (`confirmationTimeout`), and a session that ends with a card still open records `timeout`; the handler never runs.

## Session end reasons

When a session ends, the [Watch panel](/docs/watch) timeline records a `session_end` with a reason. In every case the button simply returns to idle, and the next click starts a fresh session:

| reason | What happened |
| --- | --- |
| `complete` | The conversation ended normally, after the goodbye. |
| `out_of_credit` | The balance hit zero mid-session. The ring flashes Out of credit, the agent says one closing line, and the button returns to idle. |
| `session_limit` | The session reached its max length (a per-user Quota wall). The ring shows Session limit reached; the agent says a short goodbye (or cuts, per session.closing). |
| `daily_limit` | The user hit their daily minute allowance mid-session. The ring shows Daily limit reached; the agent closes the same way. |
| `budget_limit` | The session reached the per-session budget your code passed at mint (session.budgetMinutes, Growth). The ring shows Session limit reached. |
| `user_away` | The idle cut. The button dozes first, then ends the session, silently. |
| `disconnected` | The user's side left: they ended the session, closed the tab, or lost the connection. |
| `crashed` | We ended it: a restart or a deploy on our side. Silent; the button returns to idle. Starting a new session works right away. |

Three more entries appear only in Watch and explain the "I asked and nothing happened" report: `tool_blocked` (Hand mode blocked a call), `tools_update_failed` (the agent couldn't load your latest declarations for that turn), and `catalogue_gave_up` (the agent never received your declarations at all, so it can only talk). All three are worth a look at the Catalogue tab and at where the declaring components are mounted.

## Microphone and audio

A microphone problem never blocks the session: it connects with the mic muted, the mic button shows it, and the settings panel under the button shows one of these messages:

| Panel says | Cause |
| --- | --- |
| Microphone blocked — allow microphone access in your browser or system settings, then reopen this panel. | Permission denied, or a non-secure http:// origin (the mic needs HTTPS or localhost). |
| No microphone found — connect one and try again. | No input device. |
| Microphone is in use by another app — close it and try again. | Another application holds the device. |
| The selected microphone is unavailable — pick another below. | The remembered device is gone. |
| Couldn't access the microphone. Check your browser's site permissions. | Anything else. |

The other way round, when the browser blocks the agent's audio from playing (autoplay policy), the button shows a one-tap **🔊 Tap to enable sound** affordance; tapping it resumes audio for the rest of the session.

## Other endpoints

The optional dev tools call two more routes with the session's token, and their errors are `{ "error": "..." }` with no `reason`: `401` for an expired or invalid session token, `403` for a revoked workspace, `400` for a missing or over-long text, `429` for the daily cap. The look-code lookup ([Appearance](/docs/appearance)) answers `404` for an unknown code and the SDK falls back to the default look silently, with one `console.debug` line. Everything else, the voice connection included, is covered by [Network requirements](/docs/network-requirements).

Missing one? Email [ebi@coworkkit.ai](mailto:ebi@coworkkit.ai) with the Watch export and we'll add it here.
