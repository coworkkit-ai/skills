# Actions, surfaces & elements

> The four primitives: declare what the agent can do, where the user is, what it can see and operate, and how to steer it.

Once the agent can talk (see [Getting started](/docs/getting-started)), give it something to do. This is the half you write: four small primitives, **actions**, **surfaces**, **elements**, and **cue**, that describe your app to the agent. They're hand-written and app-specific, and they live wherever the relevant React state already lives. The SDK never touches your routes or components for you. Reach for whichever ones fit; you rarely need all four on one page.

## Actions: what it can do

`useAction` declares a function the agent can call: a `name`, a clear `description` it reads to decide when to call it, optional JSON-Schema `parameters`, and a `run` handler.

```tsx
useAction({
  name: "addTask",
  description: "Add a task to the user's list. Use when the user asks to add or create a task.",
  kind: "write",
  parameters: {
    type: "object",
    properties: { title: { type: "string", description: "The text of the task." } },
    required: ["title"],
  },
  run: (args: { title: string }) => addTask(args.title),
});
```

Mark reads vs. writes with `kind`, and gate how firmly a call is confirmed with `control`: `open` fires immediately, `soft` asks the agent to confirm out loud, `hard` raises an on-screen Confirm / Cancel card the agent can't click itself. [Control & confirmation](/docs/control) covers the levels and the card in full. No React state to hang the hook off? `defineAction` is the same shape at module scope; it registers when its module is imported, so make sure that module is imported somewhere in your app.

Three smaller fields, for when you need them. `parameters` is plain JSON Schema (if you already have a Zod schema, pass it through `zodToJsonSchema`). `kind: "read" | "write"` tells the agent whether a call changes anything. `silent: true` turns off the button's little activity pulse for a high-frequency read the user shouldn't see flashing.

## Surfaces: where the user is

`useSurface` tells the agent what page the user is on. Pass a human `label` (the only identity you write, and the one the agent says aloud) plus whatever ambient `data` your page already has:

```tsx
useSurface({
  label: "Tasks board",
  data: { total: tasks.length, remaining },
  cue: "The user is managing their to-do list; answer 'what's left' from this data.",
});
```

The SDK derives a stable internal id from the label, so there's no `type` to invent or keep unique yourself. One surface is active at a time; it is the frame the agent reasons in until the user moves.

## Elements: what it can see and operate

`useElement` declares one named thing on the page: a filter, a toggle, a selection (not a DOM element). Give it `state` when the agent needs to read the current value, and `actions` when it should operate it. Read-only vs. interactive is simply whether `actions` is present:

```tsx
// Operate-only, no state needed:
useElement({
  name: "view-mode",
  actions: {
    setKanban: () => setViewMode("kanban"),
    setList: () => setViewMode("list"),
  },
});

// See-only:
useElement({ name: "next-task", state: { nextUp: nextTask?.title ?? "all done" } });
```

Element actions are a UI touch by definition, so they're gated behind [Hand mode](/docs/hand-mode): the user has to arm the agent before it can operate the page. See-only elements (a `state`, no `actions`) are never gated; they only expose a value for the agent to read.

An element action can be a bare function, as above, or the full action shape minus its name, `{ description, control, run }`, when it deserves a better description or a confirmation of its own:

```tsx
useElement({
  name: "bulk-select",
  state: { selected: selectedIds.length },
  actions: {
    clear: () => setSelectedIds([]),
    deleteSelected: {
      description: "Delete every selected row. Use only when the user asks to delete them.",
      control: "hard",
      run: () => deleteRows(selectedIds),
    },
  },
});
```

## Cue: steering, not commands

Both `useSurface` and `useElement` take an optional `cue`: a short line of builder guidance on what matters here. The agent reads it as **data**, never as a command it must obey. Use it to point at what to foreground, not to script behavior.

## Chime-in: let the agent speak first

By default the agent waits for the user to talk. Set `chimeIn` on a surface to let it open with one short line the first time the user lands on something new: a record they just opened, a page they haven't seen this session.

```tsx
useSurface({
  label: "Invoice #1042",
  data: { status, total, dueDate },
  chimeIn: true,
});
```

It fires at most once per thing per session, and never after the agent's own navigation, so moving the user around doesn't trigger it. Leave it off (the default) wherever an unprompted remark would just be noise.

## Which one do I reach for?

The split is by what you're describing, not by layer:

- A **capability** the agent should invoke (add a task, send the email, run the search) → an **action**.
- **Where the user is** and what's on the page in aggregate (the view, its title, live counts) → a **surface**.
- **One named control or value** it should read or operate (a filter, a toggle, the current selection) → an **element**.
- **How it should behave here**, in a sentence (what to foreground, what to leave alone) → a **cue** on the surface or element.

That's the vocabulary. Where to *mount* each of these so they're available when the user asks, how to write a description the agent picks correctly, and how to wire a flow that crosses pages are the next page: [Patterns & best practices](/docs/patterns).
