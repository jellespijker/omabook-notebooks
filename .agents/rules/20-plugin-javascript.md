# The plugin's JavaScript

Notebooks runs in Omabook's script engine (`omabook plugin api` has the whole
API). Its rules are not style: code that breaks them doesn't run, or runs
somewhere it shouldn't. Enforced by `rules/js/*.yml` on the lines a change adds.

## The script language

- **No `async`/`await`, modules or timers.** Slow things are promises chained
  with `.then`; files are joined with `omabook.include`; later work is
  `omabook.after`. (`no-async-await`, `no-modules`, `no-timers`)
- **Every call returns within five seconds** of its own running time: nothing
  loops over anything big.
- **Running the top level changes nothing.** Omabook loads a script more than
  once; effects happen in a command, an event or a function.
- **The world only through `omabook`**: the network through `omabook.http`,
  files through `omabook.files`, never `fetch` or `XMLHttpRequest`
  (`no-host-network`). Never `eval` or `new Function` (`no-eval`).

## The plugin's design

- **Live data is operations in the change log** (`omabook.log`, Omabook's
  ADR 0002), through `Store`. A field written on two computers keeps the later
  one, a set keeps what both added: so a page's order is a number of its own,
  never a list in its notebook, and what a page holds is a set of the page
  (strokes, recordings) or a thing of its own that names its page (text
  blocks, pictures: moved on one computer and typed in on another, both
  hold). The notebook file is a snapshot
  written from the log, never read back into it.
- **Private by default.** A notebook is private until the person shares it;
  handwriting and recordings go only to the person's own servers unless a
  notebook says otherwise.
- **The model only through `Ai`**, when there is one, which checks every
  answer; `omabook.ai.available()` may be asked anywhere. (`ai-through-ai`)
  Every word sent to a model is in `Prompts` (`prompts-in-prompts`).
- **Errors are `Error`s whose message the person can act on**:
  `throw new Error("There is no such notebook.")`. Omabook shows the message; a
  thrown string loses where it came from. (`no-throw-literal`)

## Style

- `===` and `!==`, never `==` and `!=`. (`no-loose-equality`)
- `const` for what doesn't change, `let` for what does; `var` only for the one
  global a part makes.
- Comments say *why*. The words a person sees are plain English: a plugin has
  no translation catalog.
