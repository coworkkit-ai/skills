# Network requirements

> What a Coworkkit-enabled app connects to and from where: the hosts, ports and protocols to allow in a Content-Security-Policy or firewall, and why CORS, a proxy and your WAF need no work.

Coworkkit is a closed loop: your browser asks **your own backend** for a session, and your backend asks Coworkkit for it with your secret key. From then on the user's browser talks to Coworkkit directly for the voice connection. This page lists exactly what that involves, so a strict Content-Security-Policy, a corporate firewall, or a security review has the facts, and it answers the three questions that usually come with them: do I need CORS, do I need a proxy, and does my WAF matter.

## What connects where

Four connections, in the order they happen. Only the first three are load-bearing:

| From | To | How | What for |
| --- | --- | --- | --- |
| Your backend | `https://api.coworkkit.ai` | HTTPS · TCP 443 | Mints the session (POST /session) with your secret key. Server-to-server: the browser never sees this call or the key. |
| The user's browser | `wss://*.transport.coworkkit.ai` | WebSocket over TLS · TCP 443 | Sets up the voice session. |
| The user's browser | the same transport host | WebRTC media · UDP 7882, falling back to TCP 7881 | Carries the audio both ways and the agent's actions on the page. This is the connection that does the work. |
| The user's browser | `https://api.coworkkit.ai` | HTTPS · TCP 443 | Cosmetics (a remembered look code) and the optional dev tools. Voice works without it. |

Everything else, speech recognition, the language model, the voice, runs on our side behind those hosts. Your app never connects to a provider, and nothing on this page changes when we change one.

**Where your users are matters more than where your servers are.** The voice connection runs from the user's browser to Coworkkit. Your servers, and anything in front of them, are not in that path: a WAF inspects traffic to *your* domain, and none of these connections go there, so it neither sees nor blocks them. A user on a home or mobile network has everything above open. A user inside a corporate network may not; see the firewall section.

## Content-Security-Policy

If your app ships a CSP, add the two Coworkkit hosts to `connect-src`:

```text
connect-src 'self' https://api.coworkkit.ai wss://*.transport.coworkkit.ai;
```

Two notes. The wildcard matters: the transport host a session lands on depends on the region, so allow the pattern, not one host. And the SDK injects its styles as a single inline `<style>` element when the Provider mounts, so a `style-src` without `'unsafe-inline'` leaves the button unstyled. A nonce option for that element isn't available yet; if your policy can't allow inline styles, tell us.

WebRTC media isn't governed by `connect-src` (only the signalling WebSocket is), so nothing else in the policy needs to change.

## Firewalls and corporate networks

For a network that filters outbound traffic, allow:

- `api.coworkkit.ai`: TCP 443
- `*.transport.coworkkit.ai`: TCP 443, UDP 7882, and TCP 7881

Allow by hostname; we don't publish static IP ranges yet. UDP 7882 is the normal path for audio and TCP 7881 the fallback when UDP is blocked. On a network that blocks both, and some corporate networks only let TCP 443 out, the media connection never establishes and the session can't start. A relay over TLS on 443 for exactly that case is on the roadmap; if your users sit on such a network, email [ebi@coworkkit.ai](mailto:ebi@coworkkit.ai) so we know.

## CORS

You don't configure anything. CORS is the browser asking the server *it calls* whether it accepts calls from your page's origin, and `api.coworkkit.ai` answers yes to any origin on the routes a browser may call (the cosmetics and the dev tools above). The voice connection is a WebSocket, which CORS doesn't govern. And `POST /session`, the route that takes your secret key, accepts no browser calls at all: it sends no CORS headers, so a browser refuses the response. That's deliberate. It makes a key that leaked into browser code fail immediately instead of quietly working.

The one CORS error you might ever see is between your page and your own token route, if they live on different origins (say `www.example.com` and `api.example.com`). That's your API's header to send for your page; Coworkkit isn't in that picture.

## Do I need a proxy?

No, and there's nothing to proxy. The pattern a proxy usually provides, the browser talks only to your domain and your server talks to the third party, is already how the session is minted: the key lives on your server and the mint call is server-to-server. The voice connection can't go through an HTTP proxy at all: it's WebRTC, negotiated between the user's browser and our transport, and no reverse proxy can carry it. If your policy is that the browser may only ever connect to your own domain, that's a conversation about running the transport under your domain, not a proxy setting; get in touch.

If your backend reaches the internet through an egress proxy, note that Node's built-in `fetch`, which `mintSession` uses, doesn't read `HTTPS_PROXY` on its own. Set an undici `ProxyAgent` as the global dispatcher, or mint from your own HTTP client: the PHP, Python, Ruby and Go recipes in [Backends](/docs/backends) use clients that honour the proxy variables.

Related: [Browser & framework support](/docs/compatibility) for the browser side, and [Troubleshooting & FAQ](/docs/troubleshooting) if a session won't start.
