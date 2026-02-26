import { Flows, SupportedHooks } from '../src/index'

// @ts-ignore
global.console = { warn: jest.fn() }

describe('flow test', () => {
  it('should register flow', () => {
    const flows = new Flows()

    flows.register('test_flow', [])
    const flowsMap = (flows as any).flows

    expect(flowsMap.has('test_flow')).toBeTruthy()
    expect(flowsMap.get('test_flow')).toHaveLength(0)
  })

  it('should return initial data on empty flow', async () => {
    const flows = new Flows()
    flows.register('test_flow', [])

    const response = await flows.execute<{}>('test_flow', { initial: true })
    expect(response).toMatchObject({ initial: true })
  })

  it('should execute flow', async () => {
    const flows = new Flows()
    flows.register('test_flow', [(data) => ({ ...data, other: true })])

    const response = await flows.execute<{}>('test_flow', { initial: true })
    expect(response).toMatchObject({ initial: true, other: true })
  })

  it('should wait on async action', async () => {
    const flows = new Flows()
    flows.register('test_flow', [
      (data) => Promise.resolve({ ...data, other: true }),
    ])

    const response = await flows.execute<{}>('test_flow', { initial: true })
    expect(response).toMatchObject({ initial: true, other: true })
  })

  it('should jump to other flow on change metadata', async () => {
    const flows = new Flows()
    flows.register('test_flow', [
      (data) => ({ ...data, $$: { jump: 'other_flow' } }),
    ])
    flows.register('other_flow', [(data) => ({ ...data, other: true })])

    const response = await flows.execute<{}>('test_flow', { initial: true })
    expect(response).toMatchObject({ initial: true, other: true })
  })

  it('should finish flow on done', async () => {
    const action = jest.fn((data) => ({ ...data, other2: true }))
    const flows = new Flows()

    flows.register('test_flow', [
      (data) => ({ ...data, other: true, $$: { done: true } }),
      action,
    ])

    const response = await flows.execute<{}>('test_flow', { initial: true })
    expect(response).not.toMatchObject({ other2: true })
    expect(action).not.toHaveBeenCalled()
  })

  describe('hooks', () => {
    it('should run pre_flow hook only once before the flow start', async () => {
      const hook = jest.fn(() => {})
      const flows = new Flows()

      flows.register('test_flow', [
        (data) => ({ ...data, other: true }),
        (data) => ({ ...data, other2: true }),
      ])
      flows.hook(SupportedHooks.PRE_FLOW, hook)

      await flows.execute<{}>('test_flow', { initial: true })
      expect(hook).toHaveBeenCalledTimes(1)
    })

    it('should run post_flow hook only once after the flow ends', async () => {
      const hook = jest.fn(() => {})
      const flows = new Flows()

      flows.register('test_flow', [
        (data) => ({ ...data, other: true }),
        (data) => ({ ...data, other2: true }),
      ])
      flows.hook(SupportedHooks.POST_FLOW, hook)

      await flows.execute<{}>('test_flow', { initial: true })
      expect(hook).toHaveBeenCalledTimes(1)
    })

    it('should run pre_action hook before each action', async () => {
      const hook = jest.fn(() => {})
      const flows = new Flows()

      const flowToTest = [
        (data: {}) => ({ ...data, other: true }),
        (data: { other?: boolean }) => ({ ...data, other2: true }),
      ] as const
      flows.register('test_flow', flowToTest)
      flows.hook(SupportedHooks.PRE_ACTION, hook)

      await flows.execute<{}>('test_flow', { initial: true })
      expect(hook).toHaveBeenCalledTimes(flowToTest.length)
    })

    it('should run post_action hook after each action', async () => {
      const hook = jest.fn(() => {})
      const flows = new Flows()

      const flowToTest = [
        (data: {}) => ({ ...data, other: true }),
        (data: { other?: boolean }) => ({ ...data, other2: true }),
      ] as const
      flows.register('test_flow', flowToTest)
      flows.hook(SupportedHooks.POST_ACTION, hook)

      await flows.execute<{}>('test_flow', { initial: true })
      expect(hook).toHaveBeenCalledTimes(flowToTest.length)
    })

    it('should run exception hook when function throws and resolve gracefully', async () => {
      const hook = jest.fn(() => {})
      const flows = new Flows()

      flows.register('test_flow', [
        (data) => {
          throw new Error('test exception')
        },
        // action1 always throws → TypeScript infers R1=never; annotate so spread is valid
        (data: {}) => ({ ...data, other2: true }),
      ])
      flows.hook(SupportedHooks.EXCEPTION, hook)

      const result = await flows.execute<{}>('test_flow', { initial: true })
      expect(result).toMatchObject({ initial: true })
      expect(hook).toHaveBeenCalledTimes(1)
      expect(hook).toHaveBeenCalledWith(expect.objectContaining({ error: new Error('test exception') }))
    })

    it('should pass the error to post_flow hook on exception', async () => {
      const postFlow = jest.fn(() => {})
      const flows = new Flows()

      flows.register('test_flow', [
        (data) => { throw new Error('boom') },
      ])
      flows.hook(SupportedHooks.POST_FLOW, postFlow)

      await flows.execute<{}>('test_flow', { initial: true })

      expect(postFlow).toHaveBeenCalledWith(expect.objectContaining({
        error: new Error('boom'),
      }))
    })
  })

  it('should throw on cyclic flow', async () => {
    const flows = new Flows()
    flows.register('test_flow', [
      (data) => ({ ...data, $$: { jump: 'other_flow' } }),
    ])
    flows.register('other_flow', [
      (data) => ({ ...data, $$: { jump: 'test_flow' } }),
    ])

    await expect(
      flows.execute<{}>('test_flow', { initial: true })
    ).rejects.toEqual(
      new Error('cyclic flow!!, [test_flow, other_flow, test_flow]')
    )
  })

  it('should keep the requestId to the end of the flow', async () => {
    const flows = new Flows()
    flows.register('test_flow', [
      (data) => ({ ...data, other: true }),
      () => ({ somethingElse: 1 }),
    ])

    const response = await flows.execute<{}>('test_flow', {
      initial: true,
      $$: { requestId: '123' },
    })
    expect(response).toMatchObject({
      somethingElse: 1,
      $$: { requestId: '123' },
    })
  })

  it('should call exception hook and resolve if action does not return an object', async () => {
    const onException = jest.fn()
    const flows = new Flows()
    // @ts-ignore
    flows.register('test_flow', [
      (data) => ({ ...data, other: true }),
      () => 'throw me',
    ])
    flows.hook(SupportedHooks.EXCEPTION, onException)

    const result = await flows.execute<{}>('test_flow', { initial: true })

    // resolves with the last good data (output of action 0)
    expect(result).toMatchObject({ initial: true, other: true })
    expect(onException).toHaveBeenCalledWith(expect.objectContaining({
      error: new Error('in flow test_flow action number 1 return "throw me" instead of object!\nactions must return object'),
    }))
  })

  it('should throw error when using unknown hook', () => {
    const flows = new Flows()

    function unknownHook() {
      // @ts-ignore
      flows.hook('unknown', () => {})
    }

    expect(unknownHook).toThrow(
      'Hook unknown is not a known hook, please read the docs regarding acceptable hooks'
    )
  })

  it('should resolve and warn if unknown flow', async () => {
    const flows = new Flows()
    const res = await flows.execute<{}>('unknown', { someData: 1 })

    expect(res).toMatchObject({ someData: 1 })
    expect(console.warn).toHaveBeenCalledWith('unknown flow does not exists! Skipped')
  })

  describe('unregister', () => {
    it('should remove a registered flow', async () => {
      const flows = new Flows()
      flows.register('test_flow', [(data) => ({ ...data, other: true })])
      flows.unregister('test_flow')

      const res = await flows.execute<{}>('test_flow', { initial: true })
      expect(res).toMatchObject({ initial: true })
      expect(console.warn).toHaveBeenCalledWith('test_flow flow does not exists! Skipped')
    })
  })

  describe('unhook', () => {
    it('should stop calling a removed hook', async () => {
      const hook = jest.fn(() => {})
      const flows = new Flows()

      flows.register('test_flow', [(data) => ({ ...data, other: true })])
      flows.hook(SupportedHooks.PRE_ACTION, hook)
      flows.unhook(SupportedHooks.PRE_ACTION, hook)

      await flows.execute<{}>('test_flow', { initial: true })
      expect(hook).not.toHaveBeenCalled()
    })
  })

  describe('type chain', () => {
    it('infers each action parameter type from the previous action return type', async () => {
      const flows = new Flows()

      flows.register('typed_flow', [
        (data: { name: string }) => ({ name: data.name, age: 42 }),
        // TypeScript infers `data` here as `{ name: string; age: number }`.
        // The assignment below would be a compile error if inference were wrong.
        (data) => {
          const name: string = data.name
          const age: number = data.age
          return { greeting: `${name} is ${age}` }
        },
      ])

      const result = await flows.execute('typed_flow', { name: 'Alice' })
      expect(result).toMatchObject({ greeting: 'Alice is 42' })
    })

    it('works with async actions in the chain', async () => {
      const flows = new Flows()

      flows.register('async_chain', [
        async (data: { x: number }) => ({ x: data.x, y: data.x * 2 }),
        // `data` is inferred as `{ x: number; y: number }`
        async (data) => {
          const sum: number = data.x + data.y
          return { sum }
        },
      ])

      const result = await flows.execute('async_chain', { x: 3 })
      expect(result).toMatchObject({ sum: 9 })
    })

    it('reports a type error when accessing a property absent from the chain', () => {
      const flows = new Flows()

      flows.register('typed_flow', [
        (data: { name: string }) => ({ name: data.name, age: 42 }),
        (data) => {
          // `data` is `{ name: string; age: number }` — 'noProp' does not exist.
          // @ts-expect-error
          void data.noProp
          return { greeting: data.name }
        },
      ])

      // The runtime assertion is intentionally absent:
      // if TypeScript *didn't* infer the type correctly (e.g. `data` were `any`),
      // the @ts-expect-error above would become an "unused directive" compile error,
      // causing ts-jest to fail this entire test suite.
    })
  })

  describe('async hooks', () => {
    it('should await async hooks before continuing', async () => {
      const order: string[] = []
      const flows = new Flows()

      flows.register('test_flow', [
        (data) => {
          order.push('action')
          return { ...data, other: true }
        },
      ])

      flows.hook(SupportedHooks.PRE_ACTION, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push('async-hook')
      })

      await flows.execute<{}>('test_flow', {})
      expect(order).toEqual(['async-hook', 'action'])
    })
  })
})
