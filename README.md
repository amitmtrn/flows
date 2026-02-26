# @codeinkit/flows

[![Status](https://img.shields.io/badge/status-active-success.svg)]()
[![GitHub Issues](https://img.shields.io/github/issues/codeinkit/flows.svg)](https://github.com/codeinkit/flows/issues)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](https://choosealicense.com/licenses/mit/)

A lightweight TypeScript library for flow-based programming. Organize logic as a pipeline of small, focused functions — each one receives the output of the previous.

---

## Table of Contents

- [Why flow-based?](#why-flow-based)
- [Install](#install)
- [Quick start](#quick-start)
- [Core concepts](#core-concepts)
  - [Actions](#actions)
  - [Registering flows](#registering-flows)
  - [Executing flows](#executing-flows)
  - [The `$$` control object](#the--control-object)
  - [Hooks](#hooks)
- [API reference](#api-reference)
- [Testing](./TESTING.md)
- [Contributing](#contributing)

---

## Why flow-based?

MVC and similar architectures work well at small scale, but business logic tends to accumulate in controllers and services, making individual pieces hard to test or reuse.

Flow-based programming breaks logic into small, stateless functions (actions). Each action does one thing, returns an object, and passes it on. This makes every step independently testable and composable.

---

## Install

```sh
npm install @codeinkit/flows
```

Requires Node.js 17+ (uses `structuredClone`).

---

## Quick start

```ts
import { Flows, SupportedHooks } from '@codeinkit/flows';

const flows = new Flows();

// Register a named flow — each action receives the previous action's return value
flows.register('greet', [
  (data: { name: string }) => ({ ...data, greeting: `Hello, ${data.name}!` }),
  (data) => ({ message: data.greeting.toUpperCase() }),
]);

// Add a hook to log every action's input
flows.hook(SupportedHooks.PRE_ACTION, ({ flowName, i, input }) => {
  console.log(`[${flowName}] action ${i}`, input);
});

// Execute the flow and get the final result
const result = await flows.execute('greet', { name: 'Alice' });
console.log(result.message); // "HELLO, ALICE!"
```

---

## Core concepts

### Actions

An action is a plain function — sync or async — that:

1. Receives the data object from the previous action (or the initial input for the first action)
2. Returns a new object that is passed to the next action

```ts
// Sync action
function addTimestamp(data: { userId: string }) {
  return { ...data, createdAt: new Date().toISOString() };
}

// Async action — dependencies come from `unsafe`, not from module scope.
// The library types `unsafe` as `unknown` because it doesn't know your app's
// dependencies — but YOU do, so type it concretely in your action.
type Deps = { db: Database };

async function fetchUser(data: { userId: string }, unsafe: Deps) {
  const user = await unsafe.db.users.findById(data.userId);
  return { ...data, user };
}
```

**Rules:**
- An action must return a plain object (not a primitive, array, or `null`).
- The returned object must be serializable via `structuredClone` (no functions, no circular references).
- All state lives in the data object — actions should be stateless.
- **Actions must be isolated.** An action must not close over or import external dependencies directly. Everything it needs — file system, database clients, loggers, config — must come through `unsafe`. This keeps actions pure, portable, and independently testable.

```ts
// BAD — action reaches outside itself via a module-level import
import fs from 'fs';
async function readConfig(data: { path: string }) {
  const config = await fs.promises.readFile(data.path, 'utf8'); // external dep leaked in
  return { ...data, config };
}

// GOOD — dependency is injected through `unsafe`, typed concretely
type Deps = { fs: typeof import('fs') };

async function readConfig(data: { path: string }, unsafe: Deps) {
  const config = await unsafe.fs.promises.readFile(data.path, 'utf8');
  return { ...data, config };
}
```

### Registering flows

```ts
flows.register('flow-name', [action1, action2, action3]);
```

TypeScript infers each action's `data` parameter type from the previous action's return type — no extra annotations needed beyond the first action.

```ts
flows.register('pipeline', [
  (data: { id: number }) => ({ id: data.id, raw: fetchRaw(data.id) }),
  (data) => ({ id: data.id, parsed: parse(data.raw) }), // data.raw is typed
  (data) => ({ result: data.parsed }),                   // data.parsed is typed
]);
```

To auto-register every file in a directory as a flow (using the relative file path as the flow name):

```ts
await flows.registerFolder(path.join(__dirname, 'flows'));
```

To remove a flow:

```ts
flows.unregister('flow-name');
```

### Executing flows

```ts
const result = await flows.execute('flow-name', { initialKey: 'value' });
```

- If the flow is not registered, `execute` resolves with the input and logs a warning.
- Use the `T` and `S` type parameters to annotate input and output shapes:

```ts
const result = await flows.execute<{ id: number }, { user: User }>('get-user', { id: 42 });
```

The third argument, `unsafe`, is passed to every action as a second parameter. Use it to inject dependencies (loggers, DB clients, etc.) without putting them in the serializable data object.

The library types `unsafe` as `unknown` because it is generic — but your action functions should declare the concrete type they expect:

```ts
// Define your app's dependency type once
type Deps = { db: Database; logger: Logger };

// Use it directly in the action — no casting needed
async function saveUser(data: { name: string }, unsafe: Deps) {
  await unsafe.db.users.insert({ name: data.name });
  unsafe.logger.info('user saved');
  return data;
}

// Pass the real deps at call time
await flows.execute('flow-name', inputData, { db, logger } satisfies Deps);
```

### The `$$` control object

Any action can include a `$$` field in its return value to send control instructions to the executor. The `$$` object is preserved across the entire flow and is not visible to the user's domain data unless explicitly spread.

#### `done` — stop the flow early

```ts
function earlyExit(data: { isValid: boolean }) {
  if (!data.isValid) {
    return { ...data, $$: { done: true } };
  }
  return data;
}
```

#### `jump` — continue in a different flow

```ts
function routeRequest(data: { type: string }) {
  if (data.type === 'admin') {
    return { ...data, $$: { jump: 'admin-flow' } };
  }
  return data;
}
```

Cyclic jumps (A → B → A) are detected and throw an error.

#### `requestId` and custom metadata

Any extra fields placed on `$$` persist through the entire flow, even if later actions do not return `$$`. This is useful for tracing:

```ts
// Pass a requestId at execution time
flows.execute('flow-name', { $$: { requestId: 'abc-123' }, userId: 42 });

// Every hook and every action has access to data.$$.requestId throughout
```

### Hooks

Hooks observe the flow lifecycle. They can be sync or async.

```ts
flows.hook(SupportedHooks.PRE_FLOW,   ({ flowName, input })           => { ... });
flows.hook(SupportedHooks.POST_FLOW,  ({ flowName, output })          => { ... });
flows.hook(SupportedHooks.PRE_ACTION, ({ flowName, i, actionFn, input })          => { ... });
flows.hook(SupportedHooks.POST_ACTION,({ flowName, i, actionFn, input, output })  => { ... });
flows.hook(SupportedHooks.EXCEPTION,  ({ flowName, i, actionFn, input, error })   => { ... });
```

| Hook | When it fires |
|------|--------------|
| `PRE_FLOW` | Once, before the first action |
| `POST_FLOW` | Once, after the last action (or after `done`) |
| `PRE_ACTION` | Before each action |
| `POST_ACTION` | After each action |
| `EXCEPTION` | When an action throws; the flow ends gracefully after the hook runs — the error is never re-thrown |

Remove a hook with:

```ts
flows.unhook(SupportedHooks.PRE_ACTION, myHookFn);
```

---

## API reference

```ts
class Flows {
  // Register a named flow (typed overloads cover up to 8 chained actions)
  register(name: string, flow: Action[]): void

  // Remove a registered flow
  unregister(name: string): void

  // Auto-register every file in a folder; flow name = relative path without extension
  registerFolder(folder: string): Promise<void>

  // Execute a registered flow with an initial data object
  execute<T, S>(flowName: string, input: T, unsafe?: unknown): Promise<S>

  // Add a lifecycle hook
  hook(name: SupportedHooks, fn: HookFn): void

  // Remove a specific hook function
  unhook(name: SupportedHooks, fn: HookFn): void
}

enum SupportedHooks {
  PRE_FLOW    = 'PRE_FLOW',
  POST_FLOW   = 'POST_FLOW',
  PRE_ACTION  = 'PRE_ACTION',
  POST_ACTION = 'POST_ACTION',
  EXCEPTION   = 'EXCEPTION',
}
```

---

## Contributing

Pull requests are welcome. For major changes please open an issue first to discuss the approach.

Make sure to update tests as appropriate: `npm test`.

---

**Author:** [@amitmtrn](https://github.com/amitmtrn)
