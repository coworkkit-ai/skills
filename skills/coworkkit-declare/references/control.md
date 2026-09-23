# Control & confirmation

> Gate an action by how much it costs to get wrong: open, a spoken confirm, or a hard on-screen click the agent can't fake.

Every action carries a `control` level: a per-action setting that decides how firmly a call is gated before it fires. Choose it by one question: **how costly is this to get wrong?** A read is free to retry; a delete is not. The level is the only knob, and it is declared right on the action, next to its `run` handler.

## The three levels

- `open` **(default)**: fires immediately, no gate. For reads and anything reversible. If you declare no `control`, this is what you get.
- `soft`: the agent must confirm out loud before firing (“Shall I archive this?”) and only proceeds on a yes. For actions that are meaningful but recoverable.
- `hard`: the SDK raises an on-screen confirmation card (a summary plus Confirm / Cancel) that a real person has to click. **The agent can never fire a `hard` action itself.** Only a human click resolves it. For destructive, irreversible, or costly actions.

```tsx
// hard: irreversible. Only a human click resolves it; the agent cannot fire it.
useAction({
  name: "deleteProject",
  description: "Permanently delete the current project and everything in it.",
  control: "hard",
  confirmationSummary: () => "Delete this project and all its tasks? This can't be undone.",
  run: () => deleteProject(project.id),
});

// soft: recoverable. The agent confirms out loud, then fires on a yes.
defineAction({
  name: "archiveThread",
  description: "Archive the open conversation. Use when the user asks to archive or file it.",
  control: "soft",
  run: () => archiveThread(),
});
```

## The hard confirmation card

The card is **SDK-rendered and SDK-authoritative**. The SDK draws it on the user's device from `confirmationSummary`, a function, so it never crosses the wire. If you omit it, the card falls back to the action's `description`. Supply it for custom phrasing or a live count (“Delete 12 tasks?”).

The agent only ever sees the *resolved outcome*: confirmed, cancelled, or timed out. It cannot render the card, pre-fill it, or click it. That is what makes `hard` a genuine human gate rather than a prompt the model could talk its way past. The decision physically happens in the browser, under the user's finger.

![The hard-confirmation card reading 'Delete invoice #1042?' with Cancel and Confirm buttons](/docs/confirm-card.png)
*A hard action raises this card. Only a real click resolves it; the agent can't.*

## A safety net for destructive names

If you ship an action whose name contains `delete`, `destroy`, `wipe`, `purge`, `erase` or `remove` (anywhere in the name, any casing) and declare no `control`, the SDK resolves it to `soft` rather than `open` and logs a one-line dev nudge telling you it did. It is a backstop for the case you forgot, not a substitute for choosing. Set `control` explicitly: `hard` for a real click, `open` to opt out. You can also move the app-wide baseline off `open` with the `defaultControl` prop on `CoworkkitProvider`.

## Control vs. Hand mode

`control` and [Hand mode](/docs/hand-mode) are different axes, and they compose. Hand mode answers *may the agent touch the UI at all*: the user-armed switch that gates every element action. `control` answers *how firmly is this one call confirmed* once it is allowed to run. A `hard`-controlled element action has to clear both gates: the user must have Hand mode armed, *and* then click Confirm on the card.

## Every call is on the record

Each settled call emits one record: *what* ran, the level it was gated at, the gate decision (`fired`, `needs_hand_mode`, `confirmed`, `cancelled`, or `timeout`), and the outcome. Two places consume it. The `onActionRecord` Provider callback, for routing into your own logging. And the [Watch panel](/docs/watch) timeline, for reading it live during a build.

```tsx
<CoworkkitProvider
  tokenUrl="/api/coworkkit/session"
  onActionRecord={(record) => {
    // e.g. "deleteProject" · "hard" · "confirmed"
    audit.log(record.action, record.control, record.gate);
  }}
>
```

The SDK **emits and never stores** these records. The audit trail is yours to keep wherever you keep the rest. `onActionRecord` is a function, and a function can't be passed from a Server Component, so a Provider that sets it lives in a client component (your own `Providers`, say) rather than straight in the layout.
