# Backends

> Next.js is a one-line drop-in; every other JS backend mints with mintSession; anything else calls the published POST /session contract, with PHP, Python, Ruby and Go recipes included.

The backend half of Coworkkit does one job: mint a short-lived session token from your secret key ([why it works this way](/docs/how-it-works)). On **Next.js** that's a one-line drop-in. On **any other JavaScript backend** it's `mintSession`, a single call you wrap in your own route. And on **any backend at all** (PHP, Python, Ruby, Go, anything that can make an HTTPS request) you call the mint endpoint directly. Every stack fits.

Next.js — drop-in

coworkkitSessionRoute is a ready-made POST handler. One line, and your backend half is done.

Any other JS backend — mintSession

One fetch-based call you wrap in your own route — Node, Bun, Deno, and edge runtimes.

ExpressFastifyHonoKoaNestJSCloudflare WorkersBunDenoAny backend — the wire contract

Not on JavaScript? POST /session yourself — the same request mintSession makes. Copy-paste recipes below.

PHPPythonRubyGo

On Next.js, `coworkkitSessionRoute` from `@coworkkit/server/next` is the drop-in; the five-step [Getting started](/docs/getting-started) walks it end to end. Everything below is for every other stack.

## Any other JS backend: mintSession

Call `mintSession(apiKey, { user: { id } })` inside your own route and return what it gives you: `{ token, serverUrl, cloudUrl }`. It's a plain async function built on `fetch`, so it doesn't care which framework hosts it. Express, for example:

**`server.ts (Express)`**

```ts
import { mintSession } from "@coworkkit/server";

// COWORKKIT_API_KEY stays on the server — the browser only receives the short-lived token.
// `user.id` is the user the agent acts as. "dev-user" is fine while developing; in production
// derive it from your own auth/session middleware, server-side — never from the client.
app.post("/api/session", async (_req, res) => {
  try {
    const session = await mintSession(process.env.COWORKKIT_API_KEY!, { user: { id: "dev-user" } });
    res.json(session);
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "session mint failed" });
  }
});
```

The same call drops into **Fastify**, **Koa**, and **NestJS** the same way. And because `coworkkitSessionRoute` is really just `mintSession` wrapped as a Web-standard `Request` → `Response` handler, on a fetch-native runtime (**Cloudflare Workers**, **Bun**, **Deno**, **Hono**) you can drop it in directly instead.

Edge caveat: on the default path `mintSession` reads the control URL from `process.env`. On a runtime without Node's `process`, such as a bare Cloudflare Worker (no `nodejs_compat`) or Deno without `--allow-env`, pass `cloudUrl` to `mintSession` explicitly, which skips the env read. Node and Bun need nothing extra.

## Any backend: the wire contract

Under the hood, `mintSession` makes exactly one HTTPS request. That endpoint is public and language-blind, so on **PHP, Python, Ruby, Go**, or anything that speaks HTTP, you make the same request yourself. Hold your key, post the user's id, relay the JSON back to the browser's `getToken`. No Node, no SDK, no extra service on your side.

**`POST /session`**

```
POST {base}/session         base: env COWORKKIT_CLOUD_URL, default https://api.coworkkit.ai

  header   x-api-key: <your secret tenant key>      (never logged, never in the browser)
  header   content-type: application/json
  body     {"user":    {"id": "<derived server-side from your own auth>",   user.id REQUIRED
                         "languageCode": "de-DE"},                          facts optional
            "session": {"budgetMinutes": 7, "closing": "cut"}}              wishes optional

-> 2xx      {"token": "...", "serverUrl": "...", "cloudUrl": "...",
             "sessionId": "ses_...", "session": {...}, "lookCode": "..."}   relay UNCHANGED to getToken
-> 4xx/5xx  {"error": "...", "reason": "..."}                         reason optional; relay the status
```

The optional `user` object carries per-user context for this one session. Its first field, `languageCode` (BCP-47), makes the agent speak that language; [Languages](/docs/languages) covers how it resolves. Leave the extra `user` facts out and the coworker's default language applies. The recipes below post `user.id` only; add the other `user` facts (or a `session` object) to the body the same way when you need them — see [Usage, quotas & webhooks](/docs/usage) for the record, the sessions API, webhooks and Quotas. The base URL is the one `@coworkkit/server` exports as `DEFAULT_CLOUD_URL`; the `COWORKKIT_CLOUD_URL` environment variable overrides it, and you normally set neither.

Two rules make this safe. Your `apiKey` is a **server-only secret**: it never reaches the browser and never lands in a log line or an error message. Build your error strings from the HTTP status and the server's `error`/`reason`, never the key. And `user.id` is **derived server-side from your own authenticated session**, never accepted from the browser. The minted token authenticates the agent as exactly that user, so trusting a client-supplied `user.id` would let any visitor act as anyone. That impersonation boundary is the reason this call lives on the server.

**Relay the success body unchanged.** The contract grows additively (success bodies may gain fields over time), so forward the whole object you receive; don't cherry-pick `token`/`serverUrl`/`cloudUrl` and drop the rest. The browser SDK reads what it needs, and forwarding everything keeps you forward-compatible for free.

On a rejected `/session` the service may attach a `reason`, a short machine token you can map to your own user-facing copy:

| reason | what it means |
| --- | --- |
| `missing_api_key` | no x-api-key header was sent |
| `unknown_api_key` | the key doesn't match any tenant |
| `tenant_revoked` | the tenant's key has been revoked |
| `missing_user` | the request carried no user.id |
| `retired_field` | the request sent the retired top-level userId / userIp instead of user.id / user.ip (HTTP 400) |
| `session_cap` | the tenant is at its daily session limit |
| `daily_limit` | this user has used their whole daily minute allowance — the per-user Quota wall (HTTP 429) |
| `out_of_credit` | the tenant's credit balance is exhausted |
| `unmetered` | the tenant has no credit balance provisioned at all |
| `transport_unassigned` | the tenant's voice transport is unassigned — the session can't be dispatched |
| `no_cell_in_region` | the tenant is pinned to a region with no capacity available right now — refused rather than served elsewhere |

Every refusal of `/session` carries a `reason` next to `error` (a `401` is `{ "error": "unknown apiKey", "reason": "unknown_api_key" }`, a `400` is `{ "error": "userId required", "reason": "missing_user" }`). What doesn't: the transport-level answers, a `404` for a wrong path or method and a `500` for an internal fault, come back as `{ "error": "..." }` only, and a proxy or placeholder page in front of the service can answer with a non-JSON body. So check the HTTP status first, use `reason` when it's there, and treat it as an open set. A value you don't recognize is not an error in your integration. The full list, with what the button shows for each, is on [Error codes](/docs/error-codes).

Framework-free reference recipes follow: 50 to 70 lines of your language's standard library (PHP uses ext-curl), most of it the error handling you'd want anyway. Paste one, set `COWORKKIT_API_KEY` on the server (and `COWORKKIT_CLOUD_URL` only if you're not on the default), and your existing frontend connects. Each returns the decoded body unchanged and raises a typed error carrying the HTTP status and `reason` on any non-2xx status, or on a non-JSON body, so an HTML error page never becomes a raw parse crash.

### PHP

ext-curl only, PHP 8.1+. `coworkkit_mint($userId)` returns the session array; reads the key from `COWORKKIT_API_KEY`.

**`coworkkit-session.php`**

```php
<?php
// Coworkkit — mint a voice session from PHP (bring-your-own-backend).
// The whole server side of the closed loop: hold the secret key, POST /session,
// relay the JSON. Framework-free, ext-curl only, PHP >= 8.1. See backends/README.md.

/** Thrown when /session returns a non-2xx status or a non-JSON body. */
class CoworkkitException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?int $status = null,
        public readonly ?string $reason = null,
    ) {
        parent::__construct($message);
    }
}

/**
 * Mint a session. Derive $userId from YOUR OWN auth, server-side — never trust the
 * browser (KB-0001). Returns the decoded body unchanged, so unknown fields survive.
 */
function coworkkit_mint(string $userId): array
{
    $base = getenv('COWORKKIT_CLOUD_URL') ?: 'https://api.coworkkit.ai';
    $apiKey = getenv('COWORKKIT_API_KEY') ?: '';

    $ch = curl_init("{$base}/session");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5, // a stalled upstream must not pin this worker forever
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['content-type: application/json', "x-api-key: {$apiKey}"],
        CURLOPT_POSTFIELDS => json_encode(['user' => ['id' => $userId]]),
    ]);
    $text = curl_exec($ch);
    $curlErr = $text === false ? curl_error($ch) : null;
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    // (No curl_close: the CurlHandle frees itself when it goes out of scope; the call
    // is a deprecated no-op since PHP 8.0.)

    $body = json_decode((string) $text, true);
    $ok = is_array($body);
    if ($status < 200 || $status >= 300 || !$ok) {
        // Transport failure or non-JSON (HTML error/placeholder) fails clearly —
        // never an unhandled parse crash.
        $detail = $ok && isset($body['error'])
            ? (string) $body['error']
            : ($curlErr !== null
                ? "unreachable: {$curlErr} — is the service deployed/reachable?"
                : 'non-JSON response — is the service deployed/reachable?');
        $reason = $ok && isset($body['reason']) && is_string($body['reason']) ? $body['reason'] : null;
        throw new CoworkkitException("Coworkkit /session failed (HTTP {$status}): {$detail}", $status, $reason);
    }
    return $body; // relay unchanged — the contract grows additively
}
```

### Python

Standard library only (`urllib`), no pip dependency. `mint_session(user_id)` returns the session dict.

**`coworkkit_session.py`**

```python
"""Coworkkit — mint a voice session from Python (bring-your-own-backend).

The whole server side of the closed loop: hold the secret key, POST /session,
relay the JSON. Stdlib only (urllib), Python 3.8+ — no pip dependency.
See backends/README.md.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

class CoworkkitError(Exception):
    """Raised when /session returns a non-2xx status or a non-JSON body."""

    def __init__(self, message: str, status: int | None = None, reason: str | None = None):
        super().__init__(message)
        self.status = status
        self.reason = reason

def mint_session(user_id: str) -> dict:
    """Mint a session. Derive user_id from YOUR OWN auth, server-side (KB-0001).

    Returns the decoded body unchanged, so unknown fields survive.
    """
    base = os.environ.get("COWORKKIT_CLOUD_URL") or "https://api.coworkkit.ai"
    req = urllib.request.Request(
        f"{base}/session",
        data=json.dumps({"user": {"id": user_id}}).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": os.environ.get("COWORKKIT_API_KEY", ""),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed https scheme)
            status, text = resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:  # 4xx/5xx still carry a body
        status, text = exc.code, exc.read().decode()
    except urllib.error.URLError as exc:  # unreachable/timeout — typed error, never a raw traceback
        raise CoworkkitError(f"Coworkkit /session unreachable: {exc.reason} — is the service deployed/reachable?") from exc

    try:
        body = json.loads(text)
        ok = isinstance(body, dict)
    except ValueError:  # non-JSON (HTML error/placeholder) — never crash on parse
        body, ok = None, False

    if not 200 <= status < 300 or not ok:
        detail = str(body["error"]) if ok and "error" in body else "non-JSON response — is the service deployed/reachable?"
        reason = body.get("reason") if ok and isinstance(body.get("reason"), str) else None
        raise CoworkkitError(f"Coworkkit /session failed (HTTP {status}): {detail}", status, reason)
    return body  # relay unchanged — the contract grows additively
```

### Ruby

Standard library only (`net/http`). `coworkkit_mint(user_id)` returns the session hash.

**`coworkkit_session.rb`**

```ruby
# Coworkkit — mint a voice session from Ruby (bring-your-own-backend).
# The whole server side of the closed loop: hold the secret key, POST /session,
# relay the JSON. Stdlib only (net/http). See backends/README.md.

require 'net/http'
require 'json'
require 'openssl' # referenced in the transport rescue even on plain-http runs
require 'uri'

# Raised when /session returns a non-2xx status or a non-JSON body.
class CoworkkitError < StandardError
  attr_reader :status, :reason

  def initialize(message, status = nil, reason = nil)
    super(message)
    @status = status
    @reason = reason
  end
end

# Mint a session. Derive user_id from YOUR OWN auth, server-side (KB-0001).
# Returns the parsed body unchanged, so unknown fields survive.
def coworkkit_mint(user_id)
  base = ENV['COWORKKIT_CLOUD_URL']
  base = 'https://api.coworkkit.ai' if base.nil? || base.empty?
  uri = URI("#{base}/session")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'
  http.open_timeout = 5  # a stalled upstream must not pin this thread forever
  http.read_timeout = 15
  req = Net::HTTP::Post.new(uri)
  req['content-type'] = 'application/json'
  req['x-api-key'] = ENV['COWORKKIT_API_KEY'] || ''
  req.body = JSON.generate('user' => { 'id' => user_id })
  begin
    res = http.request(req)
  rescue SocketError, SystemCallError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError, EOFError => e
    # Unreachable/timeout — typed error, never a raw exception out of the recipe.
    raise CoworkkitError, "Coworkkit /session unreachable: #{e.message} — is the service deployed/reachable?"
  end

  status = res.code.to_i
  begin
    body = JSON.parse(res.body)
    ok = body.is_a?(Hash)
  rescue JSON::ParserError # non-JSON (HTML error/placeholder) — never crash on parse
    body = nil
    ok = false
  end

  if status < 200 || status >= 300 || !ok
    detail = ok && body.key?('error') ? body['error'].to_s : 'non-JSON response — is the service deployed/reachable?'
    reason = ok && body['reason'].is_a?(String) ? body['reason'] : nil
    raise CoworkkitError.new("Coworkkit /session failed (HTTP #{status}): #{detail}", status, reason)
  end
  body # relay unchanged — the contract grows additively
end
```

### Go

Standard library only. `MintSession(apiKey, userID)` returns the decoded body; Go takes the key as an explicit argument rather than from the environment.

**`coworkkit_session.go`**

```go
// Package coworkkitmint mints Coworkkit voice sessions from Go
// (bring-your-own-backend). The whole server side of the closed loop: hold the
// secret key, POST /session, relay the JSON. Stdlib only. See backends/README.md.
package coworkkitmint

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// http.DefaultClient never times out; a stalled upstream must not pin a goroutine forever.
var httpClient = &http.Client{Timeout: 15 * time.Second}

// CoworkkitError is returned when /session gives a non-2xx status or a non-JSON body.
type CoworkkitError struct {
	Status  int
	Reason  string
	Message string
}

func (e *CoworkkitError) Error() string { return e.Message }

// MintSession mints a session. Derive userID from YOUR OWN auth, server-side
// (KB-0001); apiKey is your secret tenant key. Returns the decoded body unchanged,
// so unknown fields survive.
func MintSession(apiKey, userID string) (map[string]any, error) {
	base := os.Getenv("COWORKKIT_CLOUD_URL")
	if base == "" {
		base = "https://api.coworkkit.ai"
	}
	payload, _ := json.Marshal(map[string]any{"user": map[string]string{"id": userID}})
	req, err := http.NewRequest(http.MethodPost, base+"/session", bytes.NewReader(payload))
	if err != nil {
		return nil, &CoworkkitError{Message: err.Error()}
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", apiKey)

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, &CoworkkitError{Message: fmt.Sprintf("Coworkkit /session unreachable: %v — is the service deployed/reachable?", err)}
	}
	defer res.Body.Close()
	text, _ := io.ReadAll(res.Body)

	var body map[string]any
	ok := json.Unmarshal(text, &body) == nil // non-JSON (HTML) → ok=false, never a crash

	if res.StatusCode < 200 || res.StatusCode >= 300 || !ok {
		detail := "non-JSON response — is the service deployed/reachable?"
		reason := ""
		if ok {
			if e, isStr := body["error"].(string); isStr {
				detail = e
			}
			if r, isStr := body["reason"].(string); isStr {
				reason = r
			}
		}
		return nil, &CoworkkitError{
			Status:  res.StatusCode,
			Reason:  reason,
			Message: fmt.Sprintf("Coworkkit /session failed (HTTP %d): %s", res.StatusCode, detail),
		}
	}
	return body, nil // relay unchanged — the contract grows additively
}
```

These recipes aren't just examples. Each one is tested against the same fake `/session` as our own Node package: success, unknown extra fields, an `out_of_credit` rejection, and non-JSON error pages. That's the bar for a community port too. A port in your language is official when it passes the same conformance suite `mintSession` does.

Want the route written for you? Your Coworker's [Quickstart](/tenants) tab generates a ready-to-paste setup prompt, with the exact token route for Next.js, Vite + Express, and Remix, that you hand to your AI coding agent.

---

## The published wire contract (`backends/`)

# Coworkkit — bring your own backend

The Coworkkit voice runtime is a **closed loop** (KB-0007): we host LiveKit, STT, the
LLM, and TTS. Your backend's entire job is one HTTPS call — hold your secret key,
assert who the user is from your *own* auth, `POST /session`, and relay the JSON to
the browser. No Node required, no provider wiring, no infrastructure on your side.

`@coworkkit/server`'s `mintSession` is a ~160-line convenience around this call. This
directory publishes the wire contract itself so you can implement it in **any**
language. PHP, Python, Ruby, and Go reference recipes live beside this file; each is
≤ ~40 lines of stdlib-only code and passes the conformance kit.

## The wire contract

```
POST {base}/session          base: env COWORKKIT_CLOUD_URL, default https://api.coworkkit.ai
  header  x-api-key: <secret tenant key>          (never logged, never in the browser)
  header  content-type: application/json
  body    {"user":    {"id": "<derived server-side from your own auth>",     ← user.id REQUIRED
                        "languageCode": "de-DE", "timeZone": "Europe/Berlin",  ← facts, optional
                        "ip": "<the request's client IP>"},
           "session": {"budgetMinutes": 7, "closing": "cut", "region": "europe"}}  ← wishes, optional

→ 2xx   {"token": "...", "serverUrl": "...", "cloudUrl": "...",
         "sessionId": "ses_...", "session": {...}}                 — relay UNCHANGED to the browser
→ 4xx/5xx {"error": "<message>", "reason": "<RejectReason>"}       — always present; relay status + reason
```

> **The mint shape was reshaped once (SPEC-0106, `0.1.0-rc.3`).** `user.id` replaces the retired
> top-level `userId`; `user.ip` replaces the retired `userIp`. A request that still sends the retired
> top-level names is refused `400 { reason: "retired_field" }` — never silently aliased. Two
> containers, each answering one question: `user` = who, and facts; `session` = what you want.

- **Base URL** resolves from the `COWORKKIT_CLOUD_URL` environment variable, falling
  back to the baked default `https://api.coworkkit.ai`. A customer normally sets
  neither — the default is the production front door.
- **Request:** `POST` with `content-type: application/json`, the `x-api-key` header
  carrying your secret tenant key, and a body of `{"user": {"id": <string>}}` — plus these
  optional fields:
  - `"user": {"languageCode": <BCP-47>}` — make the agent speak that language for this
    session (resolved against the coworker's supported set; an unsupported value falls
    back to the coworker default).
  - `"user": {"timeZone": <IANA zone>}` and `"user": {"ip": <client IP>}` — **placement hints**
    (SPEC-0057). The browser SDK stamps `timeZone` for you and posts it (with `language`) to your
    token route as the `getToken` context; forward it exactly as you forward `languageCode`.
    `user.ip` is the opt-in, country-precision signal — pass your request's client IP (`req.ip` /
    `x-forwarded-for`). Both are used in-request only, **never stored, never logged** (only the
    derived region is recorded); the cloud uses them to place the session near the user when the
    tenant's Regions policy allows it.
  - `"session": {"budgetMinutes", "closing", "region"}` — **what you want for this session**
    (SPEC-0106): a per-session minute budget (Growth), how it ends at a wall (`"goodbye"` default |
    `"cut"`), and a region preference (Growth). Below the entitled plan they are ignored (never
    rejected); the response's `session` echoes what actually applied.
  - `"session": {"dev": true}` — **force development mode** for this session (SPEC-0114, a boolean;
    any other type is ignored). The escape hatch for a staging/preview deployment that ships as a
    `production` bundle but should still get the dev co-worker behaviour; a normal
    `NODE_ENV !== "production"` browser build already turns dev on without it. Forwarded opaquely
    (no recipe change) and **dispatch-only — never echoed** on the response (unlike the settings
    above). Leave it unset for real production.

  The recipes post `user.id` only; add the other `user` facts / a `session` object the same way
  when you need them — an existing backend that sends only `{"user": {"id"}}` stays fully
  conformant (additive). The `@coworkkit/server` Next.js drop-in (`coworkkitSessionRoute`) does this
  for you: it reads the browser SDK's posted `getToken` context and forwards `user.timeZone` /
  `user.languageCode` plus the `x-forwarded-for` / `x-real-ip` client IP as `user.ip` (opt out with
  `forwardClientIp: false`), and accepts a `session` option. A custom route must **post the
  `getToken` context** from the browser and read it back the same way — a route that mints with
  `user.id` only drops every per-user placement signal, so Edge ranks all sessions from the account
  home. **Never send the retired top-level `userId` / `userIp`** — they are a `400 retired_field`.
- **Success (2xx):** a JSON object — `{ token, serverUrl, cloudUrl, sessionId, session }`, optionally
  with `lookCode` (the tenant's saved FAB look, SPEC-0098; absent when the tenant has none) and
  `onboarding` (the coworker's setup progress, SPEC-0115 — `{ done: ["key"|"installed"|"connected"|
  "first_action"|"live", …] }`; absent when talking to a pre-0115 control service).
  `sessionId` (`ses_…`) is the opaque handle you store to reconcile later via `GET /sessions/{id}`
  or the `session.ended` webhook; `session` echoes what actually applied (SPEC-0106). Relay it to
  the browser **unchanged** — the SDK reads whichever fields are present. New additive fields like
  these round-trip through every recipe untouched (the conformance kit pins it).
- **Failure (non-2xx):** a JSON object `{ error, reason? }`. Surface the HTTP status
  **and** the `reason` — the browser SDK maps the token to what the user is told, so
  a relay that drops it turns "your key is wrong" into "can't connect".
  Every `/session` **refusal** carries a `reason`. Transport-level responses do **not**:
  a mistyped base URL gives `404 {"error":"not found"}` and an unhandled fault gives
  `500 {"error":"internal error"}`. So read it defensively — `reason` may be absent, and
  an error body may not be JSON at all (a proxy or load balancer can return HTML).

### RejectReason values

The control service may attach one of these `reason` tokens to a rejected `/session`
(source of truth: `runtime/cloud/src/obslog.ts`):

| reason | meaning |
|---|---|
| `missing_api_key` | no `x-api-key` header was sent |
| `unknown_api_key` | the key does not match any tenant |
| `tenant_revoked` | the tenant's key has been revoked |
| `missing_user` | the request carried no `user.id` |
| `retired_field` | the request sent the retired top-level `userId` / `userIp` instead of `user.id` / `user.ip` (HTTP 400, SPEC-0106) |
| `session_cap` | the tenant is at its daily session limit |
| `daily_limit` | this user has used their whole daily minute allowance — the per-user Quota wall (HTTP 429, SPEC-0106) |
| `out_of_credit` | the tenant's credit balance is exhausted |
| `unmetered` | the tenant has no credit balance provisioned at all (SPEC-0059) |
| `transport_unassigned` | the tenant's LiveKit transport is unassigned — the session cannot be dispatched (HTTP 503, SPEC-0059) |
| `no_cell_in_region` | a region-locked tenant has no available cell in its region — refused rather than served elsewhere (HTTP 503, SPEC-0057) |

Treat `reason` as an **open** string set: map the ones you care about to user-facing
copy, and fall back gracefully for any value you don't recognize.

## Compatibility

The contract evolves **additively only**. Success bodies may grow new fields over
time; error bodies may carry new `reason` values.

- **Relay the success body unchanged** — never cherry-pick `token`/`serverUrl`/
  `cloudUrl` (or the optional `lookCode`, SPEC-0098) and drop the rest. The browser SDK
  reads what it needs; forwarding the whole object keeps you forward-compatible for free.
- **Never break on an unknown `reason`.** New reasons are expected as the platform
  grows; an unrecognized value is not an error in your integration.

## Security

- **The `apiKey` is a server-only secret.** It never reaches the browser and never
  appears in logs, error messages, or exceptions. Every recipe here builds its error
  strings from the HTTP status and the server's `error`/`reason` — never the key.
- **`userId` is derived server-side from *your own* authenticated session** (Auth.js /
  Clerk / Supabase / your session cookie), **never accepted from the browser**
  (KB-0001). The minted token's identity equals this `userId`, so the agent
  authenticates as exactly that user — trusting a client-supplied `userId` would let
  any visitor mint a session as anyone.

## The recipes

| language | recipe | entry point |
|---|---|---|
| PHP | [`php/session.php`](./php/session.php) | `coworkkit_mint(string $userId): array` |
| Python | [`python/session.py`](./python/session.py) | `mint_session(user_id: str) -> dict` |
| Ruby | [`ruby/session.rb`](./ruby/session.rb) | `coworkkit_mint(user_id)` |
| Go | [`go/session.go`](./go/session.go) | `MintSession(apiKey, userID string) (map[string]any, error)` |

Every recipe:

- reads the base URL from `COWORKKIT_CLOUD_URL` (baked default `https://api.coworkkit.ai`);
- sends `content-type: application/json`, the `x-api-key` header, and `{"user": {"id": ...}}`;
- returns the parsed 2xx body **unchanged** (unknown fields preserved);
- raises a typed error carrying the HTTP status and `reason` on any non-2xx status
  **or** a non-JSON body — an HTML error/placeholder page must never become a raw
  parse crash (a real integrator hit exactly that).

The PHP / Python / Ruby recipes read the secret key from `COWORKKIT_API_KEY`; the Go
recipe takes it as an explicit argument (Go has no ambient-secret convention). Pick
whichever is idiomatic for your stack — the wire behaviour is identical.

## Running the conformance kit

Every recipe — and `@coworkkit/server`'s `mintSession` (the Node reference) — is
verified against a local fake `/session` that scripts the success, extra-fields,
`out_of_credit` (429 — the code every credit reject reuses, SPEC-0026), and non-JSON
(200 + 502) cases and records each request's
headers and body, plus an **unreachable** case (a port nobody answers on): a recipe
must fail with its typed error, never a raw traceback, and must give up on a stalled
upstream within its built-in timeout (~15 s) rather than pin a worker forever.

```
pnpm check backends
```

(That gate command builds `@coworkkit/server` first — the kit imports it. Once built,
`pnpm --filter @coworkkit/backends-conformance test` reruns the suite directly.)

A language whose toolchain (`php`, `python3`, `ruby`, `go >= 1.21`) is absent is
skipped **visibly by name** — never silently passed; the Node reference always runs.
Two knobs: `CK_REQUIRE_TOOLCHAINS=all` (or a csv of names) turns an absent toolchain
into a **failure** — use it on machines/CI that must exercise every language;
`CK_SKIP_TOOLCHAINS=php,go` forces named skips for testing the skip path itself. A
community port has an objective bar: pass these cases.

## Shipping

Copy-paste is the distribution today: a developer opens their language's recipe,
pastes ≤ ~40 lines into their backend, sets one env var, and their existing frontend
connects.

The **graduation path** for a language is a proper registry package:

- **PHP → Composer / Packagist.** [`php/package/`](./php/package/) is a composer-ready
  scaffold (`composer.json`, PSR-4 `Coworkkit\Server\`, a `SessionMinter` class) that
  passes the same conformance cases as the plain recipe. Publishing it to Packagist is
  an **outward, founder-triggered action** and is **out of scope** here.
- The same pattern follows later for **PyPI** (Python), **RubyGems** (Ruby), and
  **pkg.go.dev** (Go) — each gated on the same conformance bar, each published only
  when demand justifies it, each an explicit founder trigger.

Until then, the recipe files in this directory are the product.

### PHP recipe — `backends/php/session.php`

```php
<?php
// Coworkkit — mint a voice session from PHP (bring-your-own-backend).
// The whole server side of the closed loop: hold the secret key, POST /session,
// relay the JSON. Framework-free, ext-curl only, PHP >= 8.1. See backends/README.md.

/** Thrown when /session returns a non-2xx status or a non-JSON body. */
class CoworkkitException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly ?int $status = null,
        public readonly ?string $reason = null,
    ) {
        parent::__construct($message);
    }
}

/**
 * Mint a session. Derive $userId from YOUR OWN auth, server-side — never trust the
 * browser (KB-0001). Returns the decoded body unchanged, so unknown fields survive.
 */
function coworkkit_mint(string $userId): array
{
    $base = getenv('COWORKKIT_CLOUD_URL') ?: 'https://api.coworkkit.ai';
    $apiKey = getenv('COWORKKIT_API_KEY') ?: '';

    $ch = curl_init("{$base}/session");
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 5, // a stalled upstream must not pin this worker forever
        CURLOPT_TIMEOUT => 15,
        CURLOPT_HTTPHEADER => ['content-type: application/json', "x-api-key: {$apiKey}"],
        CURLOPT_POSTFIELDS => json_encode(['user' => ['id' => $userId]]),
    ]);
    $text = curl_exec($ch);
    $curlErr = $text === false ? curl_error($ch) : null;
    $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    // (No curl_close: the CurlHandle frees itself when it goes out of scope; the call
    // is a deprecated no-op since PHP 8.0.)

    $body = json_decode((string) $text, true);
    $ok = is_array($body);
    if ($status < 200 || $status >= 300 || !$ok) {
        // Transport failure or non-JSON (HTML error/placeholder) fails clearly —
        // never an unhandled parse crash.
        $detail = $ok && isset($body['error'])
            ? (string) $body['error']
            : ($curlErr !== null
                ? "unreachable: {$curlErr} — is the service deployed/reachable?"
                : 'non-JSON response — is the service deployed/reachable?');
        $reason = $ok && isset($body['reason']) && is_string($body['reason']) ? $body['reason'] : null;
        throw new CoworkkitException("Coworkkit /session failed (HTTP {$status}): {$detail}", $status, $reason);
    }
    return $body; // relay unchanged — the contract grows additively
}
```

### Python recipe — `backends/python/session.py`

```python
"""Coworkkit — mint a voice session from Python (bring-your-own-backend).

The whole server side of the closed loop: hold the secret key, POST /session,
relay the JSON. Stdlib only (urllib), Python 3.8+ — no pip dependency.
See backends/README.md.
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

class CoworkkitError(Exception):
    """Raised when /session returns a non-2xx status or a non-JSON body."""

    def __init__(self, message: str, status: int | None = None, reason: str | None = None):
        super().__init__(message)
        self.status = status
        self.reason = reason

def mint_session(user_id: str) -> dict:
    """Mint a session. Derive user_id from YOUR OWN auth, server-side (KB-0001).

    Returns the decoded body unchanged, so unknown fields survive.
    """
    base = os.environ.get("COWORKKIT_CLOUD_URL") or "https://api.coworkkit.ai"
    req = urllib.request.Request(
        f"{base}/session",
        data=json.dumps({"user": {"id": user_id}}).encode(),
        headers={
            "content-type": "application/json",
            "x-api-key": os.environ.get("COWORKKIT_API_KEY", ""),
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:  # noqa: S310 (fixed https scheme)
            status, text = resp.status, resp.read().decode()
    except urllib.error.HTTPError as exc:  # 4xx/5xx still carry a body
        status, text = exc.code, exc.read().decode()
    except urllib.error.URLError as exc:  # unreachable/timeout — typed error, never a raw traceback
        raise CoworkkitError(f"Coworkkit /session unreachable: {exc.reason} — is the service deployed/reachable?") from exc

    try:
        body = json.loads(text)
        ok = isinstance(body, dict)
    except ValueError:  # non-JSON (HTML error/placeholder) — never crash on parse
        body, ok = None, False

    if not 200 <= status < 300 or not ok:
        detail = str(body["error"]) if ok and "error" in body else "non-JSON response — is the service deployed/reachable?"
        reason = body.get("reason") if ok and isinstance(body.get("reason"), str) else None
        raise CoworkkitError(f"Coworkkit /session failed (HTTP {status}): {detail}", status, reason)
    return body  # relay unchanged — the contract grows additively
```

### Ruby recipe — `backends/ruby/session.rb`

```ruby
# Coworkkit — mint a voice session from Ruby (bring-your-own-backend).
# The whole server side of the closed loop: hold the secret key, POST /session,
# relay the JSON. Stdlib only (net/http). See backends/README.md.

require 'net/http'
require 'json'
require 'openssl' # referenced in the transport rescue even on plain-http runs
require 'uri'

# Raised when /session returns a non-2xx status or a non-JSON body.
class CoworkkitError < StandardError
  attr_reader :status, :reason

  def initialize(message, status = nil, reason = nil)
    super(message)
    @status = status
    @reason = reason
  end
end

# Mint a session. Derive user_id from YOUR OWN auth, server-side (KB-0001).
# Returns the parsed body unchanged, so unknown fields survive.
def coworkkit_mint(user_id)
  base = ENV['COWORKKIT_CLOUD_URL']
  base = 'https://api.coworkkit.ai' if base.nil? || base.empty?
  uri = URI("#{base}/session")

  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = uri.scheme == 'https'
  http.open_timeout = 5  # a stalled upstream must not pin this thread forever
  http.read_timeout = 15
  req = Net::HTTP::Post.new(uri)
  req['content-type'] = 'application/json'
  req['x-api-key'] = ENV['COWORKKIT_API_KEY'] || ''
  req.body = JSON.generate('user' => { 'id' => user_id })
  begin
    res = http.request(req)
  rescue SocketError, SystemCallError, Net::OpenTimeout, Net::ReadTimeout, OpenSSL::SSL::SSLError, EOFError => e
    # Unreachable/timeout — typed error, never a raw exception out of the recipe.
    raise CoworkkitError, "Coworkkit /session unreachable: #{e.message} — is the service deployed/reachable?"
  end

  status = res.code.to_i
  begin
    body = JSON.parse(res.body)
    ok = body.is_a?(Hash)
  rescue JSON::ParserError # non-JSON (HTML error/placeholder) — never crash on parse
    body = nil
    ok = false
  end

  if status < 200 || status >= 300 || !ok
    detail = ok && body.key?('error') ? body['error'].to_s : 'non-JSON response — is the service deployed/reachable?'
    reason = ok && body['reason'].is_a?(String) ? body['reason'] : nil
    raise CoworkkitError.new("Coworkkit /session failed (HTTP #{status}): #{detail}", status, reason)
  end
  body # relay unchanged — the contract grows additively
end
```

### Go recipe — `backends/go/session.go`

```go
// Package coworkkitmint mints Coworkkit voice sessions from Go
// (bring-your-own-backend). The whole server side of the closed loop: hold the
// secret key, POST /session, relay the JSON. Stdlib only. See backends/README.md.
package coworkkitmint

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

// http.DefaultClient never times out; a stalled upstream must not pin a goroutine forever.
var httpClient = &http.Client{Timeout: 15 * time.Second}

// CoworkkitError is returned when /session gives a non-2xx status or a non-JSON body.
type CoworkkitError struct {
	Status  int
	Reason  string
	Message string
}

func (e *CoworkkitError) Error() string { return e.Message }

// MintSession mints a session. Derive userID from YOUR OWN auth, server-side
// (KB-0001); apiKey is your secret tenant key. Returns the decoded body unchanged,
// so unknown fields survive.
func MintSession(apiKey, userID string) (map[string]any, error) {
	base := os.Getenv("COWORKKIT_CLOUD_URL")
	if base == "" {
		base = "https://api.coworkkit.ai"
	}
	payload, _ := json.Marshal(map[string]any{"user": map[string]string{"id": userID}})
	req, err := http.NewRequest(http.MethodPost, base+"/session", bytes.NewReader(payload))
	if err != nil {
		return nil, &CoworkkitError{Message: err.Error()}
	}
	req.Header.Set("content-type", "application/json")
	req.Header.Set("x-api-key", apiKey)

	res, err := httpClient.Do(req)
	if err != nil {
		return nil, &CoworkkitError{Message: fmt.Sprintf("Coworkkit /session unreachable: %v — is the service deployed/reachable?", err)}
	}
	defer res.Body.Close()
	text, _ := io.ReadAll(res.Body)

	var body map[string]any
	ok := json.Unmarshal(text, &body) == nil // non-JSON (HTML) → ok=false, never a crash

	if res.StatusCode < 200 || res.StatusCode >= 300 || !ok {
		detail := "non-JSON response — is the service deployed/reachable?"
		reason := ""
		if ok {
			if e, isStr := body["error"].(string); isStr {
				detail = e
			}
			if r, isStr := body["reason"].(string); isStr {
				reason = r
			}
		}
		return nil, &CoworkkitError{
			Status:  res.StatusCode,
			Reason:  reason,
			Message: fmt.Sprintf("Coworkkit /session failed (HTTP %d): %s", res.StatusCode, detail),
		}
	}
	return body, nil // relay unchanged — the contract grows additively
}
```
