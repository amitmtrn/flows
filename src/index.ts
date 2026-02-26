import * as fs from 'fs';
import * as path from 'path';
import * as debuglib from 'debug';

const debug = debuglib('flows');

type FlowMeta = { done?: boolean; jump?: string; i?: number };

interface HookInput {
  [SupportedHooks.PRE_ACTION]: {
    flowName: string;
    i: number;
    actionFn: Action<{}, {}>;
    input: unknown;
  };
  [SupportedHooks.POST_ACTION]: {
    flowName: string;
    i: number;
    actionFn: Action<{}, {}>;
    input: unknown;
    output: unknown;
  };
  [SupportedHooks.PRE_FLOW]: {
    flowName: string;
    input: unknown;
  };
  [SupportedHooks.POST_FLOW]: {
    flowName: string;
    output: unknown;
    error?: Error;
  };
  [SupportedHooks.EXCEPTION]: {
    flowName: string;
    i: number;
    actionFn: Action<{}, {}>;
    input: unknown;
    error: Error;
  };
}

export enum SupportedHooks {
  PRE_ACTION = 'PRE_ACTION',
  POST_ACTION = 'POST_ACTION',
  PRE_FLOW = 'PRE_FLOW',
  POST_FLOW = 'POST_FLOW',
  EXCEPTION = 'EXCEPTION',
}

export type Action<ValueType, ReturnType> = (
  previousValue: Partial<ValueType>,
  unsafe: unknown
) => ReturnType | PromiseLike<ReturnType>;

type HookFn<T extends SupportedHooks> = (v: HookInput[T]) => void | Promise<void>;

/** Sync or async action return value */
type MaybePromise<T> = T | Promise<T>;

export class Flows {
  private hooks: Record<SupportedHooks, Array<HookFn<SupportedHooks>>> = {
    [SupportedHooks.PRE_ACTION]: [],
    [SupportedHooks.POST_ACTION]: [],
    [SupportedHooks.PRE_FLOW]: [],
    [SupportedHooks.POST_FLOW]: [],
    [SupportedHooks.EXCEPTION]: [],
  };
  private flows: Map<string, Array<Action<unknown, unknown>>> = new Map();

  private getHook<T extends SupportedHooks>(hookName: T): HookFn<T>[] {
    const hook = this.hooks[hookName] as HookFn<T>[] | undefined;

    if (!Array.isArray(hook)) {
      throw new Error(
        `Hook ${hookName} is not a known hook, please read the docs regarding acceptable hooks`
      );
    }

    return hook;
  }

  private getAction(flowName: string, i: number): Action<{}, {}> {
    const flow = this.flows.get(flowName);

    if (!Array.isArray(flow) || !flow[i]) {
      throw new Error('flow does not exists!');
    }

    return flow[i] as Action<{}, {}>;
  }

  /**
   * register flow — each action's parameter type is inferred from the previous action's return type.
   * Overloads cover chains of up to 8 actions; longer flows fall back to untyped `any`.
   */
  // prettier-ignore-start
  register(name: string, flow: readonly []): void;
  register<D1 extends {}, R1 extends {}>(
    name: string,
    flow: readonly [(data: D1, unsafe?: unknown) => MaybePromise<R1>]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
    ]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
      (data: R2, unsafe?: unknown) => MaybePromise<R3>,
    ]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
      (data: R2, unsafe?: unknown) => MaybePromise<R3>,
      (data: R3, unsafe?: unknown) => MaybePromise<R4>,
    ]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
      (data: R2, unsafe?: unknown) => MaybePromise<R3>,
      (data: R3, unsafe?: unknown) => MaybePromise<R4>,
      (data: R4, unsafe?: unknown) => MaybePromise<R5>,
    ]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}, R6 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
      (data: R2, unsafe?: unknown) => MaybePromise<R3>,
      (data: R3, unsafe?: unknown) => MaybePromise<R4>,
      (data: R4, unsafe?: unknown) => MaybePromise<R5>,
      (data: R5, unsafe?: unknown) => MaybePromise<R6>,
    ]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}, R6 extends {}, R7 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
      (data: R2, unsafe?: unknown) => MaybePromise<R3>,
      (data: R3, unsafe?: unknown) => MaybePromise<R4>,
      (data: R4, unsafe?: unknown) => MaybePromise<R5>,
      (data: R5, unsafe?: unknown) => MaybePromise<R6>,
      (data: R6, unsafe?: unknown) => MaybePromise<R7>,
    ]
  ): void;
  register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}, R6 extends {}, R7 extends {}, R8 extends {}>(
    name: string,
    flow: readonly [
      (data: D1, unsafe?: unknown) => MaybePromise<R1>,
      (data: R1, unsafe?: unknown) => MaybePromise<R2>,
      (data: R2, unsafe?: unknown) => MaybePromise<R3>,
      (data: R3, unsafe?: unknown) => MaybePromise<R4>,
      (data: R4, unsafe?: unknown) => MaybePromise<R5>,
      (data: R5, unsafe?: unknown) => MaybePromise<R6>,
      (data: R6, unsafe?: unknown) => MaybePromise<R7>,
      (data: R7, unsafe?: unknown) => MaybePromise<R8>,
    ]
  ): void;
  // prettier-ignore-end
  // Fallback for flows longer than 8 actions or dynamically-typed arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(name: string, flow: ReadonlyArray<(data: any, unsafe?: unknown) => any>): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(name: string, flow: ReadonlyArray<(data: any, unsafe?: unknown) => any>): void {
    debug('register', name);

    // Exact match — "initialize" or "reinitialize" are separate flows
    if (name === 'init' && this.flows.has('init')) {
      const currentInit = this.flows.get('init') as Array<Action<unknown, unknown>>;
      const newInit = [...currentInit, ...(flow as Array<Action<unknown, unknown>>)];
      this.flows.set('init', newInit);
      return;
    }

    this.flows.set(name, flow as Array<Action<unknown, unknown>>);
  }

  /**
   * unregister a previously registered flow
   */
  unregister(name: string): void {
    this.flows.delete(name);
  }

  /**
   * register all flows in a folder
   */
  public async registerFolder(folder: string): Promise<void> {
    await this._registerFolder(folder, folder);
  }

  private async _registerFolder(folder: string, originFolder: string): Promise<void> {
    const files = await fs.promises.readdir(folder);

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(folder, file);
        const stats = await fs.promises.stat(filePath);

        if (stats.isDirectory()) {
          await this._registerFolder(filePath, originFolder);
        } else {
          const relativeFilePath = path.relative(originFolder, filePath);
          // Use path.parse so multi-dot filenames (e.g. "create.user.ts") are handled correctly
          const { dir, name } = path.parse(relativeFilePath);
          const flowName = dir ? `${dir}/${name}` : name;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          this.register(flowName, await import(filePath).then((m: any) => m.default));
        }
      })
    );
  }

  /**
   * add hook — callback may be sync or async
   */
  hook<T extends SupportedHooks>(name: T, fn: HookFn<T>): void {
    const hook = this.getHook(name);
    hook.push(fn);
  }

  /**
   * remove a previously registered hook
   */
  unhook<T extends SupportedHooks>(name: T, fn: HookFn<T>): void {
    const hook = this.getHook(name);
    const index = hook.indexOf(fn);
    if (index !== -1) {
      hook.splice(index, 1);
    }
  }

  private isActionExists(flowName: string, i: number): boolean {
    const flow = this.flows.get(flowName);
    return Array.isArray(flow) && typeof flow[i] === 'function';
  }

  /**
   * Executes a flow iteratively (no recursion) so arbitrarily long flows
   * and deep jump chains never overflow the call stack.
   */
  private async executeRepeat<
    T extends { $$?: FlowMeta },
    S extends { $$?: FlowMeta },
    U,
  >(
    flowName: string,
    initialData: T,
    unsafe: U,
    startI: number,
    meta: { activated: string[] } = { activated: [] }
  ): Promise<S> {
    let currentFlowName = flowName;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any = initialData;
    let i = startI;

    while (true) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const stepData: any = structuredClone(data);
      const action = this.isActionExists(currentFlowName, i)
        ? this.getAction(currentFlowName, i)
        : null;

      // Cycle detection: track which flows have been entered via jumps
      const lastFlow =
        meta.activated.length > 0 ? meta.activated[meta.activated.length - 1] : null;

      if (currentFlowName !== lastFlow && !meta.activated.includes(currentFlowName)) {
        meta.activated.push(currentFlowName);
      } else if (currentFlowName !== lastFlow) {
        throw new Error(`cyclic flow!!, [${meta.activated.join(', ')}, ${currentFlowName}]`);
      }

      // End of flow: no more actions or done flag set
      if (!action || stepData.$$?.done) {
        if (!stepData.$$) stepData.$$ = {};
        await Promise.all(
          this.getHook(SupportedHooks.POST_FLOW).map((fn) =>
            fn({ flowName: currentFlowName, output: stepData })
          )
        );
        return structuredClone(stepData) as S;
      }

      /** PRE_ACTION hook */
      await Promise.all(
        this.getHook(SupportedHooks.PRE_ACTION).map((fn) =>
          fn({ flowName: currentFlowName, i, actionFn: action, input: stepData })
        )
      );

      let result: unknown;
      try {
        result = await action(stepData, unsafe);

        if (typeof result !== 'object' || result === null) {
          throw new Error(
            `in flow ${currentFlowName} action number ${i} return "${result}" instead of object!\nactions must return object`
          );
        }
      } catch (error) {
        /** EXCEPTION hook */
        await Promise.all(
          this.getHook(SupportedHooks.EXCEPTION).map((fn) =>
            fn({
              flowName: currentFlowName,
              i,
              actionFn: action,
              input: stepData,
              error: error as Error,
            })
          )
        );

        // End the flow gracefully — never re-throw. The EXCEPTION hook is the
        // caller's only notification. Return the data as it was before the
        // failing action (last known good state) and fire POST_FLOW with the error.
        if (!stepData.$$) stepData.$$ = {};
        await Promise.all(
          this.getHook(SupportedHooks.POST_FLOW).map((fn) =>
            fn({ flowName: currentFlowName, output: stepData, error: error as Error })
          )
        );
        return structuredClone(stepData) as S;
      }

      // Preserve $$ metadata from current step, then merge action result on top
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextData: any = { $$: stepData.$$ };
      Object.assign(nextData, result);

      /** POST_ACTION hook */
      await Promise.all(
        this.getHook(SupportedHooks.POST_ACTION).map((fn) =>
          fn({
            flowName: currentFlowName,
            i,
            actionFn: action,
            input: stepData,
            output: nextData,
          })
        )
      );

      // Jump to another flow or advance to next action
      if (nextData.$$?.jump) {
        const jumpTo: string = nextData.$$.jump;
        delete nextData.$$.jump;
        currentFlowName = jumpTo;
        i = nextData.$$.i ?? 0;
      } else {
        i++;
      }

      data = nextData;
    }
  }

  /**
   * Start the execution process on a registered flow.
   * Use the T and S type parameters to annotate the input and output shapes.
   */
  async execute<T extends {} = {}, S extends {} = {}, U = {}>(
    flowName: string,
    input: T,
    unsafe?: U
  ): Promise<S> {
    const data = structuredClone(input);

    if (!this.flows.has(flowName)) {
      console.warn(`${flowName} flow does not exists! Skipped`);
      return data as unknown as S;
    }

    /** PRE_FLOW hook */
    await Promise.all(
      this.getHook(SupportedHooks.PRE_FLOW).map((fn) => fn({ flowName, input: data }))
    );

    return this.executeRepeat<T, S, unknown>(flowName, data, unsafe ?? {}, 0);
  }
}
