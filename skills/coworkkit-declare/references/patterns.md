# Patterns & best practices

> Where to mount actions, how to pick the gate, the cross-page recipe, descriptions the agent picks correctly, and the mistakes worth skipping.

The vocabulary is small: four primitives, two gates. The craft is in *where* each declaration lives, *which* gate it gets, and *what* you tell the agent about it. These are the habits that separate an integration that feels like a co-worker from one that feels like a list of voice commands. If a coding agent is doing the wiring, point it here (or at the [MCP](/docs/coding-agent), which serves this page).

## 1 · Mount declarations where they need to be available

A declaration exists only while the component that made it is mounted. That single rule decides everything else: the agent can only call what is mounted *right now*, on the page the user is on. So before wiring anything, ask where the real function comes from.

- **App-wide function** (a context, a store, a global mutation available on every page): declare it in a component that is always mounted, such as your nav, your shell, or a small client component in the signed-in layout. It then works from anywhere, with no navigation. This is the common case, and the most robust wiring.
- **Genuinely page-local function** (it exists only while one page is open): declare it on that page, next to the state it changes, and let the agent navigate there first. That is the recipe in section 3.

In Next.js, layouts are Server Components and hooks need a client component, so give the layout one small client child that holds the app-wide declarations:

**`app/(app)/GlobalActions.tsx`**

```tsx
"use client";

import { useAction } from "@coworkkit/react";
import { useAppState } from "@/lib/app-state";

export function GlobalActions() {
  const { setDisplayName } = useAppState();

  // Available on every page of the signed-in area. No navigation needed.
  useAction({
    name: "changeDisplayName",
    description: "Change the signed-in user's display name. Use when they ask to be called something else.",
    kind: "write",
    parameters: {
      type: "object",
      properties: { name: { type: "string", description: "The new display name." } },
      required: ["name"],
    },
    run: (args: { name: string }) => setDisplayName(args.name),
  });

  return null;
}

// app/(app)/layout.tsx is a Server Component; just render it next to the children, inside the
// Provider and your own state provider (Coworkkit's on the outside):
//   <CoworkkitProvider tokenUrl="/api/coworkkit/session">
//     <AppStateProvider><GlobalActions />{children}</AppStateProvider>
//   </CoworkkitProvider>
```

Page-level things (the surface, the counts on screen, the controls that only exist there) stay on the page. The [Watch panel](/docs/watch)'s Catalogue tab shows exactly what is mounted at any moment. If an action you expect isn't listed, it's on a component that isn't there.

## 2 · Choose the gate by asking two questions

Hand mode and `control` are separate axes, and mixing them up is the single most common wiring mistake. For every capability ask:

1. **Does it operate what is on screen the way a hand would?** Navigate, click, toggle, select, open a panel. If yes, declare it as a `useElement` action. It is Hand-gated automatically, so the user stays in charge of the agent touching the page. A plain data write (add a task, change a name) is *not* a UI touch; declare it with `useAction` and leave it ungated.
2. **Is it costly to get wrong?** Reads and reversible writes stay `open`. Meaningful but recoverable: `soft`, the agent confirms out loud. Destructive, irreversible, or spends money: `hard`, an on-screen click the agent cannot fake. The SDK defaults a `delete…`/`remove…`-named action to `soft` if you forget, but choose explicitly; the backstop is not a design.

| The capability | Declare it as | control |
| --- | --- | --- |
| Read the current filter / selection / totals | `surface data or element state` | `—` |
| Add a task, rename the user, save a draft | `useAction` | `open (default)` |
| Archive a thread, send an email, change a plan | `useAction` | `soft` |
| Delete a project, pay an invoice, revoke access | `useAction` | `hard` |
| Navigate, open a panel, toggle a view, pick a tab | `useElement action (Hand-gated)` | `open` |
| Click a destructive on-screen control | `useElement action (Hand-gated)` | `hard` |

The two compose: a `hard` element action needs Hand mode armed *and* a click on the card. [Hand mode](/docs/hand-mode) and [Control & confirmation](/docs/control) cover each axis in full.

## 3 · The cross-page recipe

"Change my name", asked from the Tasks page, when the name form only exists on Settings. The agent has to get there first, and getting there is a UI touch. The wiring that works everywhere:

- **Navigation is a `useElement` on the persistent nav.** Element actions are Hand-gated by definition and, because the nav is always mounted, the agent can navigate from any page.
- **The target action stays on its own page**, next to the state it changes.

**`components/Nav.tsx (always mounted)`**

```tsx
"use client";

import { useElement } from "@coworkkit/react";
import { usePathname, useRouter } from "next/navigation";

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();

  useElement({
    name: "navigation",
    state: { current: pathname },
    cue: "Move the user to the page that has the control they asked for, then act there.",
    actions: {
      goToTasks: () => router.push("/tasks"),
      goToSettings: () => router.push("/settings"),
    },
  });

  return <nav>{/* your links */}</nav>;
}
```

At runtime: the user arms Hand mode → the agent calls `navigation.goToSettings` → the Settings page mounts and its `changeName` action appears in the catalogue → the agent calls it. Two things to avoid. **Don't gate navigation through one page's `handActions`.** That list only applies while *that* surface is active, so the same `navigate` action is ungated on every other page. And don't reach for this recipe when the function is app-wide; section 1 makes the whole flow unnecessary.

## 4 · Write descriptions the agent will pick correctly

The `description` is the only thing the agent reads to decide *whether* to call an action; the `name` is a label. So:

- Say what it does *and* when to use it, in the words a user would say: *"Add a task to the list. Use when the user asks to add, create, or note something."*
- Describe every parameter, `{ description: "The text of the task." }`, so the agent fills it from speech instead of guessing.
- Prefer one action with a parameter over several near-duplicates: `setViewMode(mode)` beats `setKanban` + `setList` + `setCalendar` when the modes are data.
- Don't let two actions overlap ("update the task" and "edit the task"). If the agent picks the wrong one, the descriptions are the reason.
- Mark reads with `kind: "read"`. It tells the agent the call is free to make while it is figuring something out.

## 5 · Give it the state it needs, not everything

`useSurface`'s `data` is what the agent should know about the page in aggregate: counts, the current item, its status. `useElement`'s `state` is one control's live value. Both are re-sent whenever they change, so keep them small and meaningful: the id the agent will need to pass back into an action, not the whole record; the three numbers that answer "what's left?", not the array. And nothing you wouldn't want said aloud, because the agent may read it back to the user.

## 6 · Use cues to steer, not to script

A `cue` is one sentence about what matters here. The agent reads it as **data**, never as a command, so it can't be used to force behaviour, and it shouldn't be. *"The user is reviewing an overdue invoice; the due date is what matters"* is a cue. *"Always offer to send a reminder"* is a script, and it will disappoint. Persona-level behaviour (tone, what it never does) belongs in your coworker's boundaries in the portal, not in a cue.

## 7 · Working with a coding agent

The Quickstart prompt wires the two seams and then stops on purpose. From there, work in small beats: confirm voice works, then ask for *one* action at a time, naming the real function in your app it should call. A good agent surveys your code and proposes the two or three things a user would ask for by voice; wire one, say it aloud, check the Catalogue, then the next. If your agent speaks MCP, [connect it](/docs/coding-agent). It will pull these pages itself instead of guessing.

## Never do these

- Put your API key, or anything key-shaped, in the browser. There is no key prop; the secret lives only in your token route.
- Trust a client-supplied user id in the token route. Derive it from your own auth, server-side; the minted session *is* that user.
- Gate navigation through one page's `handActions`. Make it a `useElement` on the persistent nav.
- Declare an action on a component that unmounts when the user leaves the page it's meant to work from.
- Choose or configure a voice provider, model, or transport. There is nothing to configure; the runtime supplies all of it.
- Leave a delete on `open` because "the agent will ask first". Asking is what `soft` and `hard` are for, and only `hard` can't be talked past.
- Build keep-alive logic around the idle cut. It's there to protect your minutes.
