#!/usr/bin/env node
// verify.mjs — Coworkkit integration verifier (SPEC-0113 crit 18-23; V2 per SPEC-0116 crit 32).
//
// Runs in a customer repository with Node 18+ and NOTHING beyond Node built-ins.
// It reports each check as PASS / WARN / FAIL / SKIP and exits:
//   0  no FAIL and the live mint ran (or wasn't asked for and nothing else failed)
//   1  at least one FAIL
//   2  no FAIL, but the live mint was SKIPPED (start the dev server and re-run with --url)
//
// It NEVER prints the value of COWORKKIT_API_KEY, a minted token, or a serverUrl —
// in either the human or the --json output. The key is read for presence only.
//
// Usage:
//   node verify.mjs [--url http://localhost:PORT] [--json]
//   node verify.mjs --write-rules        # persist the rules block into AGENTS.md / CLAUDE.md

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CWD = process.cwd();
const ESC = String.fromCharCode(27);

const SOURCE_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
// `.claude` / `.agents` hold installed agent-skill files (this skill's own, or any other's, when
// added with `--copy`). They are never the customer's source, and this skill's test fixtures carry
// deliberate anti-patterns (a key prop, a NEXT_PUBLIC_ key, sample useSurface/useAction); scanning
// them would raise false V3/V5 FAILs and inflate the V7 counts. Never walk into them.
const SKIP_DIRS = new Set([
  "node_modules",
  ".next",
  "dist",
  "build",
  ".git",
  ".turbo",
  "coverage",
  ".claude",
  ".agents",
]);
const BROWSER_PREFIXES = ["NEXT_PUBLIC_", "VITE_", "PUBLIC_"];
// V8 live-mint fetch budget. A dev server that accepts the socket but never replies would otherwise
// block on undici's ~300s default; abort after a few seconds and treat it as SKIP (same path as a
// refused connection). Overridable for tests via COWORKKIT_VERIFY_TIMEOUT_MS.
const LIVE_MINT_TIMEOUT_MS = Number(process.env.COWORKKIT_VERIFY_TIMEOUT_MS) || 5000;
// The default token-route path (SPEC-0116 §D11): namespaced, so it can never collide with an app's
// own /api/session login endpoint. Any path works — the Provider's tokenUrl names the real one.
const DEFAULT_ROUTE_PATH = "/api/coworkkit/session";

// ── args ──────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { url: undefined, json: false, writeRules: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--write-rules") args.writeRules = true;
    else if (a === "--url") args.url = argv[i + 1];
    else if (a.startsWith("--url=")) args.url = a.slice("--url=".length);
  }
  return args;
}

// ── small fs helpers ────────────────────────────────────────────────────────────
function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

function readJsonFile(path) {
  const raw = readText(path);
  if (raw === undefined) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.isFile()) {
        const dot = entry.name.lastIndexOf(".");
        if (dot >= 0 && SOURCE_EXT.has(entry.name.slice(dot))) out.push(full);
      }
    }
  };
  walk(root);
  return out;
}

function readAllSource(root) {
  return listSourceFiles(root).map((file) => ({ file, text: readText(file) ?? "" }));
}

// ── semver (x.y.z with optional -rc.N / -beta.N prerelease) ──────────────────────
function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/.exec(String(v).trim());
  if (!m) return undefined;
  return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] ?? "" };
}

function comparePre(a, b) {
  if (a === b) return 0;
  if (a === "") return 1; // no prerelease outranks a prerelease
  if (b === "") return -1;
  const pa = a.split(".");
  const pb = b.split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      const d = Number(x) - Number(y);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function compareSemver(a, b) {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return undefined;
  for (const k of ["major", "minor", "patch"]) {
    if (pa[k] !== pb[k]) return pa[k] < pb[k] ? -1 : 1;
  }
  return comparePre(pa.pre, pb.pre);
}

function skillSdkVersion() {
  const skill = readText(join(SCRIPT_DIR, "..", "SKILL.md")) ?? "";
  const m = /^\s*sdk:\s*["']?([0-9][^"'\s]*)["']?\s*$/m.exec(skill);
  return m ? m[1] : undefined;
}

function installedVersion(pkg) {
  const meta = readJsonFile(join(CWD, "node_modules", ...pkg.split("/"), "package.json"));
  return meta && typeof meta.version === "string" ? meta.version : undefined;
}

// ── Provider opening-tag extraction (brace-aware) ────────────────────────────────
function providerTags(source) {
  const tags = [];
  for (const { text } of source) {
    let idx = text.indexOf("<CoworkkitProvider");
    while (idx !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = idx; i < text.length; i += 1) {
        const c = text[i];
        if (c === "{") depth += 1;
        else if (c === "}") depth -= 1;
        else if (c === ">" && depth === 0) {
          end = i;
          break;
        }
      }
      tags.push(end === -1 ? text.slice(idx) : text.slice(idx, end + 1));
      idx = text.indexOf("<CoworkkitProvider", end === -1 ? text.length : end + 1);
    }
  }
  return tags;
}

// ── checks ───────────────────────────────────────────────────────────────────────
function checkVersions() {
  const react = installedVersion("@coworkkit/react");
  const server = installedVersion("@coworkkit/server");
  if (!react || !server) {
    const missing = [!react && "@coworkkit/react", !server && "@coworkkit/server"]
      .filter(Boolean)
      .join(", ");
    return {
      code: "V1",
      status: "FAIL",
      message: `not installed: ${missing} (run the install step)`,
    };
  }
  if (react !== server) {
    return {
      code: "V1",
      status: "FAIL",
      message: `versions differ — react ${react}, server ${server}. Install both at the same version.`,
    };
  }
  const min = skillSdkVersion();
  if (min) {
    const cmp = compareSemver(react, min);
    if (cmp !== undefined && cmp < 0) {
      return {
        code: "V1",
        status: "FAIL",
        message: `installed ${react} is below the version this skill targets (${min}). Upgrade both packages.`,
      };
    }
  }
  return {
    code: "V1",
    status: "PASS",
    message: `@coworkkit/react + @coworkkit/server both ${react}`,
  };
}

// The tag's own attribute list: every `{…}` expression container (an arrow-function body, a JSX
// comment, a spread) collapses to `{}`, so a prop only matches where JSX puts attribute names —
// a getToken body that happens to mention `tokenUrl = …` is not a second prop.
function tagAttributes(tag) {
  let out = "";
  let depth = 0;
  for (const c of tag) {
    if (c === "{") {
      if (depth === 0) out += c;
      depth += 1;
    } else if (c === "}") {
      depth = Math.max(0, depth - 1);
      if (depth === 0) out += c;
    } else if (depth === 0) {
      out += c;
    }
  }
  return out;
}

function hasProp(tag, name) {
  return new RegExp(`\\s${name}\\s*=`).test(tagAttributes(tag));
}

// V2 — the Provider's session source (SPEC-0116 crit 32). It takes exactly one of `tokenUrl` (the
// path of the app's own token route; the SDK posts to it) or `getToken` (a custom fetch — extra
// headers, a cross-origin route). Either one passes, neither fails, both on one tag warns.
function checkProvider(source) {
  const tags = providerTags(source);
  if (tags.length === 0) {
    return {
      code: "V2",
      status: "FAIL",
      message: "no <CoworkkitProvider> found — mount it high in the signed-in tree",
    };
  }
  const props = tags.map((t) => ({
    tokenUrl: hasProp(t, "tokenUrl"),
    getToken: hasProp(t, "getToken"),
  }));
  if (props.some((p) => p.tokenUrl && p.getToken)) {
    return {
      code: "V2",
      status: "WARN",
      message:
        "<CoworkkitProvider> has both tokenUrl and getToken — the Provider takes one or the other: keep tokenUrl (the path of your token route) and remove getToken, or keep only getToken if you need custom headers or a cross-origin route",
    };
  }
  const withTokenUrl = props.some((p) => p.tokenUrl);
  const withGetToken = props.some((p) => p.getToken);
  if (withTokenUrl && withGetToken) {
    return {
      code: "V2",
      status: "PASS",
      message: "<CoworkkitProvider> found — tokenUrl on one mount, getToken on another",
    };
  }
  if (withTokenUrl) {
    return { code: "V2", status: "PASS", message: '<CoworkkitProvider tokenUrl="…"> found' };
  }
  if (withGetToken) {
    return { code: "V2", status: "PASS", message: "<CoworkkitProvider getToken={…}> found" };
  }
  return {
    code: "V2",
    status: "FAIL",
    message: `<CoworkkitProvider> has no tokenUrl or getToken prop — it needs one to mint sessions: tokenUrl="${DEFAULT_ROUTE_PATH}" (the path of your token route), or getToken for a custom fetch`,
  };
}

function checkKeyProp(source) {
  const tags = providerTags(source);
  // `apiKey` is the Provider's one forbidden prop — the secret belongs in the token route, never
  // the browser bundle. Only match it word-anchored to an assignment (`apiKey=`). A bare `key=` /
  // `token=` is NOT a leak: the Provider has no `key` or `token` prop, and `key` is React's reserved
  // remount prop (`<CoworkkitProvider key={locale}>`), so matching them bare is all-false-positive
  // on legitimate code — a false FAIL that misleads the agent into "fixing" correct wiring.
  for (const t of tags) {
    if (/\bapiKey\b\s*=/.test(t)) {
      return {
        code: "V3",
        status: "FAIL",
        message:
          "an apiKey prop is on <CoworkkitProvider> — remove it. The Provider takes no key; the secret lives only in the token route.",
      };
    }
  }
  return { code: "V3", status: "PASS", message: "no key prop on the Provider" };
}

function checkRoute(source) {
  const found = source.some(({ text }) => /\b(mintSession|coworkkitSessionRoute)\b/.test(text));
  if (!found) {
    return {
      code: "V4",
      status: "FAIL",
      message:
        "no token route found — add a server route using mintSession or coworkkitSessionRoute from @coworkkit/server",
    };
  }
  return {
    code: "V4",
    status: "PASS",
    message: "token route (mintSession / coworkkitSessionRoute) found",
  };
}

// The dirs V5 scans for env files: the repo root plus a shallow, well-known set of server dirs.
// The Vite+Express quickstart keeps COWORKKIT_API_KEY in the Express server's own dir (e.g.
// server/.env), not the repo root; a root-only scan false-FAILs that split layout and can push the
// skill to write the key to the wrong .env. This is a bounded set — never a deep recursive walk.
const ENV_SCAN_SUBDIRS = ["server", "api", "backend"];

function envFileDirs(root) {
  const dirs = [root, ...ENV_SCAN_SUBDIRS.map((d) => join(root, d))];
  // Plus each immediate child of a monorepo apps/ dir (a Next.js/Remix app package's own .env.local).
  try {
    for (const e of readdirSync(join(root, "apps"), { withFileTypes: true })) {
      if (e.isDirectory()) dirs.push(join(root, "apps", e.name));
    }
  } catch {
    // no apps/ dir — fine.
  }
  return dirs;
}

function envFiles(root) {
  const out = [];
  for (const dir of envFileDirs(root)) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (
        e.isFile() &&
        /^\.env(\.[A-Za-z0-9_.-]+)?$/.test(e.name) &&
        !e.name.endsWith(".example")
      ) {
        out.push(join(dir, e.name));
      }
    }
  }
  return out;
}

function gitIgnored(path) {
  const res = spawnSync("git", ["check-ignore", "-q", path], { cwd: CWD });
  if (res.error) return undefined; // git binary missing — caller falls back
  if (res.status === 128) return undefined; // not a git repo / fatal — caller falls back
  return res.status === 0; // 0 = ignored, 1 = not ignored
}

function checkKeyHygiene(source) {
  // Browser-exposed key variable — the worst leak.
  for (const { text } of source) {
    for (const prefix of BROWSER_PREFIXES) {
      if (text.includes(`${prefix}COWORKKIT_API_KEY`)) {
        return {
          code: "V5",
          status: "FAIL",
          message: `COWORKKIT_API_KEY is exposed under ${prefix} — that inlines the secret into the browser bundle. Read it server-side only.`,
        };
      }
    }
  }
  // An env file must define it (presence only — the value is never read).
  const files = envFiles(CWD);
  const defining = files.filter((f) => /^\s*COWORKKIT_API_KEY\s*=/m.test(readText(f) ?? ""));
  if (defining.length === 0) {
    return {
      code: "V5",
      status: "FAIL",
      message:
        "no env file defines COWORKKIT_API_KEY — add it to a git-ignored env file (e.g. .env.local)",
    };
  }
  // Each defining env file must be git-ignored.
  const exposed = [];
  let checkedByGit = false;
  for (const f of defining) {
    const ig = gitIgnored(f);
    if (ig === undefined) break; // git unavailable — fall through to .gitignore heuristic
    checkedByGit = true;
    if (!ig) exposed.push(relative(CWD, f));
  }
  if (!checkedByGit) {
    const gi = readText(join(CWD, ".gitignore")) ?? "";
    const covers = /(^|\n)\s*\.env(\*|\.local)?\s*(\n|$)/.test(gi);
    if (!covers) {
      return {
        code: "V5",
        status: "FAIL",
        message:
          "the env file with COWORKKIT_API_KEY is not covered by .gitignore — add .env*.local (or .env.local) so the key is never committed",
      };
    }
  } else if (exposed.length > 0) {
    return {
      code: "V5",
      status: "FAIL",
      message: `env file(s) with COWORKKIT_API_KEY are not git-ignored: ${exposed.join(", ")} — they must never be committed`,
    };
  }
  return {
    code: "V5",
    status: "PASS",
    message: "COWORKKIT_API_KEY defined server-side in a git-ignored env file, no browser prefix",
  };
}

function checkDevUser(source) {
  const hit = source.some(({ text }) => /["']dev-user["']/.test(text));
  if (hit) {
    return {
      code: "V6",
      status: "WARN",
      message:
        '"dev-user" placeholder found — before production, derive the real user id from your auth in the token route',
    };
  }
  return { code: "V6", status: "PASS", message: "no dev-user placeholder" };
}

function countMatches(source, re) {
  let n = 0;
  for (const { text } of source) {
    const matches = text.match(re);
    if (matches) n += matches.length;
  }
  return n;
}

function checkDeclarations(source) {
  const actions = countMatches(source, /\b(useAction|defineAction)\s*\(/g);
  const surfaces = countMatches(source, /\buseSurface\s*\(/g);
  const elements = countMatches(source, /\buseElement\s*\(/g);
  const detail = `actions ${actions}, surfaces ${surfaces}, elements ${elements}`;
  if (surfaces === 0) {
    return {
      code: "V7",
      status: "WARN",
      message: `no useSurface declared (${detail}) — declare one on the landing view so the first greeting is surface-aware`,
      counts: { actions, surfaces, elements },
    };
  }
  return { code: "V7", status: "PASS", message: detail, counts: { actions, surfaces, elements } };
}

function detectRoutePath(source) {
  // 1. The Provider's own tokenUrl="/…" — the exact path the browser posts to, so it wins over any
  //    other session-looking literal in the app (e.g. the app's own login /api/session).
  for (const tag of providerTags(source)) {
    const m = /\stokenUrl\s*=\s*["'](\/[^"']*)["']/.exec(tagAttributes(tag));
    if (m) return m[1];
  }
  // 2. Any quoted path containing "session" (a getToken fetch, a route constant).
  const re = /["'](\/[A-Za-z0-9/_-]*session[A-Za-z0-9/_-]*)["']/;
  for (const { text } of source) {
    const m = re.exec(text);
    if (m) return m[1];
  }
  // 3. No literal to read: go by the Next.js route file. A route at the pre-SPEC-0116 default
  //    (app/api/session) keeps its path unless the namespaced one sits beside it.
  const nextRoute = (...p) =>
    existsSync(join(CWD, "app", ...p)) || existsSync(join(CWD, "src", "app", ...p));
  if (nextRoute("api", "session") && !nextRoute("api", "coworkkit", "session")) {
    return "/api/session";
  }
  return DEFAULT_ROUTE_PATH;
}

function reasonHint(reason) {
  const map = {
    out_of_credit: "the coworker is out of credit — top it up in the portal",
    invalid_key: "the tenant key is wrong — check COWORKKIT_API_KEY in your env file",
    missing_key: "no key reached the route — check COWORKKIT_API_KEY is set server-side",
    unauthorized: "the key was rejected — confirm the coworker and its key in the portal",
    rate_limited: "too many requests — wait and retry",
    retired_field: "the mint payload shape is outdated — update @coworkkit/server and the route",
  };
  return map[reason] ?? "see error-codes.md for this reason";
}

async function checkLiveMint(url, source) {
  const rerun = "node <this skill's dir>/scripts/verify.mjs --url http://localhost:<dev-port>";
  if (!url) {
    return {
      code: "V8",
      status: "SKIP",
      message: `no --url given — start the dev server and re-run: ${rerun}`,
    };
  }
  const path = detectRoutePath(source);
  let target;
  try {
    target = /session/.test(new URL(url).pathname) ? url : new URL(path, url).toString();
  } catch {
    return { code: "V8", status: "FAIL", message: `--url is not a valid URL: ${url}` };
  }
  try {
    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ user: { id: "coworkkit-verify" } }),
      signal: AbortSignal.timeout(LIVE_MINT_TIMEOUT_MS),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = typeof body.reason === "string" ? body.reason : undefined;
      return {
        code: "V8",
        status: "FAIL",
        message: `token route returned ${res.status}${reason ? ` (${reason}: ${reasonHint(reason)})` : ""} — see error-codes.md`,
      };
    }
    const hasToken = typeof body.token === "string" && body.token.length > 0;
    const hasServer = typeof body.serverUrl === "string" && body.serverUrl.length > 0;
    if (hasToken && hasServer) {
      return {
        code: "V8",
        status: "PASS",
        message: `live mint through ${path} succeeded (token + serverUrl present)`,
      };
    }
    return {
      code: "V8",
      status: "FAIL",
      message: `token route responded 200 but the mint is malformed (missing ${!hasToken ? "token" : "serverUrl"})`,
    };
  } catch {
    // Connection refused OR the request aborted on the timeout (server accepted but never replied).
    // Both are SKIP with the same re-run guidance — the wiring is fine, the app just isn't answering.
    return {
      code: "V8",
      status: "SKIP",
      message: `dev server unreachable or unresponsive at ${target} — start it, then re-run: node <this skill's dir>/scripts/verify.mjs --url ${url}`,
    };
  }
}

// ── --write-rules (crit 26/27) ───────────────────────────────────────────────────
const RULES_START = "<!-- coworkkit:rules:start -->";
const RULES_END = "<!-- coworkkit:rules:end -->";

function rulesBullets() {
  const md = readText(join(SCRIPT_DIR, "..", "references", "rules.md"));
  if (md === undefined) return [];
  return md
    .split("\n")
    .filter((l) => /^-\s+/.test(l))
    .map((l) => l.trimEnd());
}

function buildRulesBlock() {
  const bullets = rulesBullets();
  // How to re-run the verifier, named in the persistent block. Separators normalised to `/`. When the
  // skill is installed INSIDE the repo (.claude/skills/… or .agents/skills/…), point at it by path.
  // When it sits OUTSIDE the repo — a global `npx skills add -g` install, where `rel` is empty, climbs
  // out with `..`, or is absolute — a machine-specific path must never be baked into the customer's
  // AGENTS.md, so name the skill's own script instead.
  const rel = relative(CWD, join(SCRIPT_DIR, "verify.mjs")).split(sep).join("/");
  const inRepo = rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  const runLine = inRepo
    ? `- Run \`node ${rel}\` after any change to actions, surfaces, the Provider or the token route.`
    : "- Run the coworkkit-setup skill's `scripts/verify.mjs` after any change to actions, surfaces, the Provider or the token route.";
  const lines = [RULES_START, "## Coworkkit", ...bullets, runLine, RULES_END];
  return lines.join("\n");
}

function writeRulesInto(root) {
  const block = buildRulesBlock();
  const agentsPath = join(root, "AGENTS.md");
  const existing = readText(agentsPath);
  let next;
  if (existing === undefined) {
    next = `${block}\n`;
  } else if (existing.includes(RULES_START) && existing.includes(RULES_END)) {
    next = existing.replace(new RegExp(`${RULES_START}[\\s\\S]*?${RULES_END}`), block);
  } else {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    next = `${existing}${sep}${block}\n`;
  }
  writeFileSync(agentsPath, next, "utf8");

  const claudePath = join(root, "CLAUDE.md");
  const claude = readText(claudePath);
  let claudeTouched = false;
  if (claude !== undefined && !/^@AGENTS\.md\s*$/m.test(claude)) {
    const sep = claude.endsWith("\n") ? "" : "\n";
    writeFileSync(claudePath, `${claude}${sep}@AGENTS.md\n`, "utf8");
    claudeTouched = true;
  }
  return { agentsPath, claudeTouched };
}

// ── main ────────────────────────────────────────────────────────────────────────
function statusColor(status) {
  const codes = { PASS: 32, WARN: 33, FAIL: 31, SKIP: 90 };
  return codes[status] ?? 0;
}

function printHuman(results) {
  for (const r of results) {
    const c = statusColor(r.status);
    // Keep "STATUS Vn" contiguous (colour span wraps both) so the line greps cleanly.
    process.stdout.write(`${ESC}[${c}m${r.status} ${r.code}${ESC}[0m  ${r.message}\n`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.writeRules) {
    const { agentsPath, claudeTouched } = writeRulesInto(CWD);
    const rel = relative(CWD, agentsPath) || "AGENTS.md";
    process.stdout.write(
      `wrote the Coworkkit rules block into ${rel}${claudeTouched ? " and added @AGENTS.md to CLAUDE.md" : ""}\n`,
    );
    return 0;
  }

  const source = readAllSource(CWD);
  const results = [];
  results.push(checkVersions());
  results.push(checkProvider(source));
  results.push(checkKeyProp(source));
  results.push(checkRoute(source));
  results.push(checkKeyHygiene(source));
  results.push(checkDevUser(source));
  results.push(checkDeclarations(source));
  results.push(await checkLiveMint(args.url, source));

  const hasFail = results.some((r) => r.status === "FAIL");
  const liveSkipped = results.some((r) => r.code === "V8" && r.status === "SKIP");
  const exitCode = hasFail ? 1 : liveSkipped ? 2 : 0;

  if (args.json) {
    // Redacted by construction: no result object ever carries a key, token, or serverUrl value.
    process.stdout.write(`${JSON.stringify({ checks: results, exitCode }, null, 2)}\n`);
  } else {
    printHuman(results);
    const summary = hasFail
      ? "one or more checks FAILED — fix them, then re-run"
      : liveSkipped
        ? "wiring looks good; the live mint was skipped — start the app and re-run with --url"
        : "all checks passed";
    process.stdout.write(`\n${summary}\n`);
  }
  return exitCode;
}

// Run only when invoked directly (`node verify.mjs`), not when imported by the test suite.
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) {
  main().then((code) => {
    process.exitCode = code;
  });
}

export { compareSemver, buildRulesBlock, providerTags, detectRoutePath };
