# Testing flows with Jest

Flow-based architecture is unusually easy to test because of two properties:

1. **Actions are plain functions.** No framework, no class, no lifecycle — call one and assert on what it returns.
2. **Dependencies are injected through `unsafe`.** There is nothing to import or mock at the module level. A mock is just an object you pass in.

This guide covers unit tests for individual actions and integration tests for whole flows.

---

## Example domain

All examples in this guide use a user-registration domain. The flow has three actions:

```
validateEmail → hashPassword → saveUser
```

```ts
// src/flows/register-user.ts
import type { Deps } from '../deps';

type Input = { email: string; password: string };

export async function validateEmail(data: Input, unsafe: Deps) {
  const taken = await unsafe.db.users.exists(data.email);
  if (taken) {
    return { ...data, $$: { done: true }, error: 'Email already in use' };
  }
  return { ...data, emailValid: true };
}

export async function hashPassword(data: Input & { emailValid: boolean }, unsafe: Deps) {
  const hash = await unsafe.crypto.hash(data.password);
  return { ...data, passwordHash: hash };
}

export async function saveUser(
  data: Input & { emailValid: boolean; passwordHash: string },
  unsafe: Deps,
) {
  const user = await unsafe.db.users.insert({
    email: data.email,
    passwordHash: data.passwordHash,
  });
  return { userId: user.id };
}

export default [validateEmail, hashPassword, saveUser];
```

```ts
// src/deps.ts
export type Deps = {
  db: {
    users: {
      exists(email: string): Promise<boolean>;
      insert(data: { email: string; passwordHash: string }): Promise<{ id: number }>;
    };
  };
  crypto: {
    hash(plain: string): Promise<string>;
  };
};
```

---

## Unit tests — testing a single action

An action is a function. Call it, pass mock data and a mock `unsafe`, assert on the return value. No `Flows` instance needed.

```ts
// test/actions/validateEmail.test.ts
import { validateEmail } from '../../src/flows/register-user';
import type { Deps } from '../../src/deps';

function makeUnsafe(overrides?: Partial<Deps>): Deps {
  return {
    db: {
      users: {
        exists: jest.fn().mockResolvedValue(false),
        insert: jest.fn(),
      },
    },
    crypto: {
      hash: jest.fn(),
    },
    ...overrides,
  };
}

describe('validateEmail', () => {
  it('returns emailValid: true when the email is available', async () => {
    const unsafe = makeUnsafe();
    const result = await validateEmail({ email: 'new@example.com', password: 'pw' }, unsafe);

    expect(result).toMatchObject({ emailValid: true });
  });

  it('sets done and returns an error message when the email is taken', async () => {
    const unsafe = makeUnsafe({
      db: { users: { exists: jest.fn().mockResolvedValue(true), insert: jest.fn() } },
    });

    const result = await validateEmail({ email: 'taken@example.com', password: 'pw' }, unsafe);

    expect(result.$$?.done).toBe(true);
    expect(result).toMatchObject({ error: 'Email already in use' });
  });

  it('checks existence against the provided email', async () => {
    const exists = jest.fn().mockResolvedValue(false);
    const unsafe = makeUnsafe({ db: { users: { exists, insert: jest.fn() } } });

    await validateEmail({ email: 'alice@example.com', password: 'pw' }, unsafe);

    expect(exists).toHaveBeenCalledWith('alice@example.com');
  });
});
```

### Why unit tests are this clean

- The action has **no imports to mock**. All dependencies come in through `unsafe`.
- `unsafe` is just a plain object — build a minimal one for each test case.
- A helper like `makeUnsafe()` gives you a full valid mock with sensible defaults, letting individual tests override only what they care about.

---

## Integration tests — testing a whole flow

Integration tests run the complete pipeline through a real `Flows` instance. They verify that actions compose correctly and that data flows from start to finish in the expected shape.

```ts
// test/flows/register-user.test.ts
import { Flows } from '@codeinkit/flows';
import actions from '../../src/flows/register-user';
import type { Deps } from '../../src/deps';

function makeUnsafe(overrides?: Partial<Deps>): Deps {
  return {
    db: {
      users: {
        exists: jest.fn().mockResolvedValue(false),
        insert: jest.fn().mockResolvedValue({ id: 99 }),
      },
    },
    crypto: {
      hash: jest.fn().mockResolvedValue('hashed-password'),
    },
    ...overrides,
  };
}

describe('register-user flow', () => {
  let flows: Flows;

  beforeEach(() => {
    flows = new Flows();
    flows.register('register-user', actions);
  });

  it('produces a userId on success', async () => {
    const result = await flows.execute(
      'register-user',
      { email: 'alice@example.com', password: 'secret' },
      makeUnsafe(),
    );

    expect(result).toMatchObject({ userId: 99 });
  });

  it('stops early and returns an error when the email is taken', async () => {
    const unsafe = makeUnsafe({
      db: { users: { exists: jest.fn().mockResolvedValue(true), insert: jest.fn() } },
    });

    const result = await flows.execute(
      'register-user',
      { email: 'taken@example.com', password: 'secret' },
      unsafe,
    );

    expect(result).toMatchObject({ error: 'Email already in use' });
    expect(unsafe.db.users.insert).not.toHaveBeenCalled();
  });

  it('hashes the password before saving', async () => {
    const unsafe = makeUnsafe();

    await flows.execute(
      'register-user',
      { email: 'alice@example.com', password: 'plaintext' },
      unsafe,
    );

    expect(unsafe.crypto.hash).toHaveBeenCalledWith('plaintext');
    expect(unsafe.db.users.insert).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'hashed-password' }),
    );
  });
});
```

---

## Capturing intermediate state with hooks

Hooks let you observe every step of a flow without changing actions. This is useful for asserting that the pipeline reached a specific state mid-flight, or for debugging a failing integration test.

```ts
it('passes the hashed password into saveUser', async () => {
  const snapshots: unknown[] = [];

  flows.hook(SupportedHooks.POST_ACTION, ({ i, output }) => {
    snapshots[i] = structuredClone(output);
  });

  await flows.execute(
    'register-user',
    { email: 'alice@example.com', password: 'secret' },
    makeUnsafe(),
  );

  // After hashPassword (index 1), passwordHash must be present
  expect(snapshots[1]).toMatchObject({ passwordHash: 'hashed-password' });
});
```

You can also count how many actions ran — useful for asserting that `done` short-circuited at the right point:

```ts
it('runs only the first action when the email is taken', async () => {
  let actionsRun = 0;
  flows.hook(SupportedHooks.POST_ACTION, () => { actionsRun++; });

  const unsafe = makeUnsafe({
    db: { users: { exists: jest.fn().mockResolvedValue(true), insert: jest.fn() } },
  });

  await flows.execute('register-user', { email: 'taken@example.com', password: 'pw' }, unsafe);

  expect(actionsRun).toBe(1);
});
```

---

## Testing error handling

Actions that throw cause the flow to reject the returned Promise. The `EXCEPTION` hook fires before the error propagates.

```ts
it('rejects when saveUser throws a database error', async () => {
  const dbError = new Error('connection lost');
  const unsafe = makeUnsafe({
    db: {
      users: {
        exists: jest.fn().mockResolvedValue(false),
        insert: jest.fn().mockRejectedValue(dbError),
      },
    },
  });

  await expect(
    flows.execute('register-user', { email: 'alice@example.com', password: 'pw' }, unsafe),
  ).rejects.toThrow('connection lost');
});

it('calls the EXCEPTION hook with the failing action details', async () => {
  const onError = jest.fn();
  flows.hook(SupportedHooks.EXCEPTION, onError);

  const unsafe = makeUnsafe({
    db: {
      users: {
        exists: jest.fn().mockResolvedValue(false),
        insert: jest.fn().mockRejectedValue(new Error('db down')),
      },
    },
  });

  await flows.execute(
    'register-user',
    { email: 'alice@example.com', password: 'pw' },
    unsafe,
  ).catch(() => {});

  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({
      flowName: 'register-user',
      error: expect.objectContaining({ message: 'db down' }),
    }),
  );
});
```

---

## Recommended file layout

Keep unit tests next to the action files, and integration tests in a separate folder:

```
src/
  deps.ts
  flows/
    register-user.ts     ← actions + default export
    send-email.ts

test/
  actions/
    validateEmail.test.ts   ← unit: one file per action
    hashPassword.test.ts
    saveUser.test.ts
  flows/
    register-user.test.ts   ← integration: one file per flow
    send-email.test.ts
```

### Rule of thumb

| What you want to verify | Use |
|-------------------------|-----|
| One action's logic, branching, or return shape | Unit test — call the function directly |
| Two or more actions compose correctly | Integration test — use a `Flows` instance |
| Side effects per step (logging, metrics) | Hook in an integration test |
| An action rejects / throws correctly | Unit test — `await expect(action(...)).rejects.toThrow(...)` |
| The flow rejects and fires the EXCEPTION hook | Integration test |
