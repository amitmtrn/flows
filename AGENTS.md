# AGENTS.md — @codeinkit/flows

This file is written for AI coding agents (Claude, Copilot, Cursor, etc.).
It describes how to correctly generate, modify, and reason about code that uses `@codeinkit/flows`.

---

## Mental model

A **flow** is a named pipeline of functions called **actions**. When executed, the library runs the actions in order, passing each action's return value to the next one as its first argument.

```
execute('my-flow', initialData)
  → action1(initialData)      → result1
  → action2(result1)          → result2
  → action3(result2)          → finalResult
```

The caller receives the final result as a Promise.

Data is deep-cloned between actions using `structuredClone`, so mutations inside an action do not leak.

---

## Importing

```ts
import { Flows, SupportedHooks } from '@codeinkit/flows';
```

There is a single export: the `Flows` class and the `SupportedHooks` enum.

---

## Creating an instance

```ts
const flows = new Flows();
```

One instance per application is typical. Register all flows once at startup.

---

## Registering a flow

```ts
flows.register('flow-name', [action1, action2, action3]);
```

- The first argument is a unique string name used later in `execute`.
- The second argument is an array of action functions. The array is executed in order.
- The name `'init'` is special: calling `register('init', [...])` multiple times **appends** to the existing `init` flow instead of replacing it. Every other name replaces the previous registration.

### Action function signature

```ts
(data: InputType, unsafe: Deps) => OutputType | Promise<OutputType>
```

- `data` — the return value of the previous action (or `initialData` for the first action).
- `unsafe` — an optional second argument forwarded from `execute`. Use it for non-serializable dependencies (logger, DB client, etc.). The library types this as `unknown` internally because it is generic, but **every action function should declare its own concrete type** — no casting required at the call site.
- Must return a plain object or a Promise that resolves to one. Primitives, arrays, and `null` are not allowed.

### TypeScript type chain

TypeScript automatically infers each action's `data` parameter type from the previous action's return type. The typed overloads cover up to 8 chained actions.

```ts
flows.register('pipeline', [
  (data: { userId: number }) => ({ userId: data.userId, raw: 'fetched' }),
  (data) => ({ userId: data.userId, parsed: data.raw.trim() }),  // data typed correctly
  (data) => ({ result: data.parsed }),                           // data typed correctly
]);
```

For more than 8 actions, or when passing a dynamically-built array, TypeScript falls back to `any`. Annotate the first action explicitly to anchor the chain.

---

## Executing a flow

```ts
const result = await flows.execute('flow-name', initialData);
// with type annotations:
const result = await flows.execute<InputType, OutputType>('flow-name', initialData);
// with dependency injection:
const result = await flows.execute('flow-name', initialData, { db, logger });
```

- Returns a Promise with the final action's return value.
- If the named flow does not exist, `execute` resolves with `initialData` and logs a warning — it does **not** throw.
- `initialData` is deep-cloned before being passed to the first action.

---

## The `$$` control object

Any action can include a `$$` key in its return object to send instructions to the executor.

### `done` — stop the flow early

```ts
function guard(data: { isValid: boolean }) {
  if (!data.isValid) return { ...data, $$: { done: true } };
  return data;
}
```

Remaining actions are skipped. The data at the time `done` is set becomes the final result.

### `jump` — hand off to another flow

```ts
function router(data: { role: string }) {
  if (data.role === 'admin') return { ...data, $$: { jump: 'admin-flow' } };
  return data;
}
```

- Cyclic jumps (A → B → A) throw an error.
- The jumped-to flow continues from index 0 by default. Set `$$.i` to start at a different index.

### Persistent metadata

Extra fields on `$$` survive the entire flow even when later actions do not include `$$` in their return:

```ts
// Pass tracing metadata at call time
flows.execute('flow-name', { $$: { requestId: 'xyz' }, userId: 1 });
// data.$$.requestId is available in every action and hook
```

**Do not use `$$` for domain data.** It is reserved for execution control and metadata.

---

## Hooks

Hooks observe the lifecycle. They run for every flow executed on the instance.

```ts
flows.hook(SupportedHooks.PRE_FLOW,    ({ flowName, input })                     => {});
flows.hook(SupportedHooks.POST_FLOW,   ({ flowName, output })                    => {});
flows.hook(SupportedHooks.PRE_ACTION,  ({ flowName, i, actionFn, input })        => {});
flows.hook(SupportedHooks.POST_ACTION, ({ flowName, i, actionFn, input, output })=> {});
flows.hook(SupportedHooks.EXCEPTION,   ({ flowName, i, actionFn, input, error }) => {});
```

- Hooks may be async — the executor awaits all hooks before proceeding.
- The `EXCEPTION` hook fires when an action throws. The error is re-thrown after the hook completes.
- Remove a hook by passing the same function reference to `unhook`:

```ts
const myHook = ({ flowName }) => console.log(flowName);
flows.hook(SupportedHooks.PRE_FLOW, myHook);
flows.unhook(SupportedHooks.PRE_FLOW, myHook);
```

---

## Registering a folder

```ts
await flows.registerFolder(path.join(__dirname, 'flows'));
```

Every file found recursively under the folder is imported and registered. The flow name is the file's path relative to the folder, without the extension. Subdirectory separators use `/`.

```
flows/
  users/create.ts   → registered as 'users/create'
  users/delete.ts   → registered as 'users/delete'
  health.ts         → registered as 'health'
```

Each file must have a **default export** that is an array of action functions:

```ts
// flows/users/create.ts
export default [
  validateInput,
  saveToDatabase,
  sendWelcomeEmail,
];
```

---

## Common patterns

### Accumulating data across actions

Each action receives the full accumulated object, so use spread to preserve prior fields:

```ts
flows.register('onboard-user', [
  (data: { email: string }) => ({ ...data, normalized: data.email.toLowerCase() }),
  (data) => ({ ...data, exists: checkExists(data.normalized) }),
  (data) => {
    if (data.exists) return { ...data, $$: { done: true } };
    return { ...data, created: true };
  },
]);
```

### Dependency injection with `unsafe`

Pass non-serializable dependencies as the third argument to `execute`. Define a shared `Deps` type and use it directly in every action — the library accepts `unknown` internally, but your functions should be concretely typed:

```ts
// Define once, share across all actions in the app
type Deps = { db: Database; logger: Logger };

// Type unsafe concretely — no `as` cast needed
const findUser = async (data: { id: number }, unsafe: Deps) => {
  return { ...data, user: await unsafe.db.users.findById(data.id) };
};

const logResult = (data: { user: User }, unsafe: Deps) => {
  unsafe.logger.info('found user', data.user.id);
  return data;
};

flows.register('get-user', [findUser, logResult]);
await flows.execute('get-user', { id: 42 }, { db, logger } satisfies Deps);
```

### Centralised error handling via hook

```ts
flows.hook(SupportedHooks.EXCEPTION, ({ flowName, i, error }) => {
  logger.error(`[${flowName}] action ${i} failed`, error);
  metrics.increment('flow.error', { flow: flowName });
});
```

### Observability

```ts
flows.hook(SupportedHooks.PRE_FLOW,  ({ flowName }) => metrics.startTimer(flowName));
flows.hook(SupportedHooks.POST_FLOW, ({ flowName }) => metrics.stopTimer(flowName));
```

---

## Rules and constraints — never violate these

| Rule | Why |
|------|-----|
| Actions must return a plain object | The library throws at runtime if the return is not an object |
| Action return values must be cloneable with `structuredClone` | Data is deep-cloned between every action |
| Do not put functions, class instances, or circular references in action data | `structuredClone` will throw |
| Do not mutate `data` directly | Changes will not propagate; always return a new object |
| Actions must be isolated — no imports or module-level variables used inside them | Makes each action independently testable and movable |
| `unsafe` is the correct place for non-serializable dependencies | Use it for DB clients, loggers, fs, etc. |
| Type `unsafe` concretely in each action function | The library uses `unknown` internally; your code should not |
| Use `$$` only for `done`, `jump`, `i`, and metadata fields | Never use it for domain data |
| Do not jump to a flow that directly or indirectly jumps back to the origin | The cyclic detection will throw |
| `register('init', [...])` appends; all other names replace | This is the only special-cased flow name |

---

## What NOT to generate

```ts
// BAD — action reaches outside itself via a module-level import
import fs from 'fs';
async function readConfig(data: { path: string }) {
  return { ...data, config: await fs.promises.readFile(data.path, 'utf8') };
}

// GOOD — dependency comes through unsafe, typed concretely
type Deps = { fs: typeof import('fs') };
async function readConfig(data: { path: string }, unsafe: Deps) {
  return { ...data, config: await unsafe.fs.promises.readFile(data.path, 'utf8') };
}

// BAD — unsafe left as unknown, requiring a cast at every use
async function saveUser(data: { name: string }, unsafe: unknown) {
  const { db } = unsafe as { db: Database }; // unnecessary cast
  return data;
}

// GOOD — type unsafe once, use without casting
type Deps = { db: Database };
async function saveUser(data: { name: string }, unsafe: Deps) {
  await unsafe.db.users.insert({ name: data.name });
  return data;
}

// BAD — returning a string instead of an object
(data) => 'done'

// BAD — returning null
(data) => null

// BAD — mutating data without returning
(data) => { data.x = 1; }

// BAD — putting a class instance in data (not cloneable)
(data) => ({ ...data, conn: new DatabaseConnection() })

// BAD — using $$ for domain data
(data) => ({ ...data, $$: { userId: 42 } })

// BAD — cyclic jump
flows.register('a', [(data) => ({ $$: { jump: 'b' } })]);
flows.register('b', [(data) => ({ $$: { jump: 'a' } })]);
```

---

## File layout convention

```
src/
  flows.ts           ← create and export the Flows instance
  flows/
    init.ts          ← startup actions (appended via 'init' special behaviour)
    users/
      create.ts
      delete.ts
    payments/
      charge.ts
```

```ts
// src/flows.ts
import { Flows } from '@codeinkit/flows';
import path from 'path';

export const flows = new Flows();
await flows.registerFolder(path.join(__dirname, 'flows'));
```

---

## Testing

See **[TESTING.md](./TESTING.md)** for a full guide. The short version:

- **Unit-test actions by calling them as plain functions.** No `Flows` instance needed. Build a mock `unsafe` object with `jest.fn()` methods and pass it directly.
- **Integration-test whole flows** by creating a `Flows` instance, registering the real actions, and calling `execute` with a mock `unsafe`.
- Because all dependencies come through `unsafe`, there is nothing to mock at the module level — no `jest.mock()`, no import patching.

```ts
// Unit test — no Flows instance
const unsafe = { db: { users: { exists: jest.fn().mockResolvedValue(false) } } };
const result = await validateEmail({ email: 'a@b.com', password: 'pw' }, unsafe);
expect(result).toMatchObject({ emailValid: true });

// Integration test
const flows = new Flows();
flows.register('register-user', [validateEmail, hashPassword, saveUser]);
const result = await flows.execute('register-user', { email: 'a@b.com', password: 'pw' }, unsafe);
expect(result).toMatchObject({ userId: expect.any(Number) });
```

---

## Quick reference

```ts
flows.register('name', [fn1, fn2, ...])       // register
flows.unregister('name')                       // remove
await flows.registerFolder('/path/to/dir')     // bulk register from folder
await flows.execute('name', input, unsafe?)    // run a flow
flows.hook(SupportedHooks.X, fn)               // add lifecycle hook
flows.unhook(SupportedHooks.X, fn)             // remove lifecycle hook
```

Hook names: `PRE_FLOW`, `POST_FLOW`, `PRE_ACTION`, `POST_ACTION`, `EXCEPTION`

`$$` fields: `done` (boolean), `jump` (string flow name), `i` (number, jump start index)
