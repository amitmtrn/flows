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
    };
    [SupportedHooks.EXCEPTION]: {
        flowName: string;
        i: number;
        actionFn: Action<{}, {}>;
        input: unknown;
        error: Error;
    };
}
export declare enum SupportedHooks {
    PRE_ACTION = "PRE_ACTION",
    POST_ACTION = "POST_ACTION",
    PRE_FLOW = "PRE_FLOW",
    POST_FLOW = "POST_FLOW",
    EXCEPTION = "EXCEPTION"
}
export type Action<ValueType, ReturnType> = (previousValue: Partial<ValueType>, unsafe: unknown) => ReturnType | PromiseLike<ReturnType>;
type HookFn<T extends SupportedHooks> = (v: HookInput[T]) => void | Promise<void>;
/** Sync or async action return value */
type MaybePromise<T> = T | Promise<T>;
export declare class Flows {
    private hooks;
    private flows;
    private getHook;
    private getAction;
    /**
     * register flow — each action's parameter type is inferred from the previous action's return type.
     * Overloads cover chains of up to 8 actions; longer flows fall back to untyped `any`.
     */
    register(name: string, flow: readonly []): void;
    register<D1 extends {}, R1 extends {}>(name: string, flow: readonly [(data: D1, unsafe?: unknown) => MaybePromise<R1>]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>
    ]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>,
        (data: R2, unsafe?: unknown) => MaybePromise<R3>
    ]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>,
        (data: R2, unsafe?: unknown) => MaybePromise<R3>,
        (data: R3, unsafe?: unknown) => MaybePromise<R4>
    ]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>,
        (data: R2, unsafe?: unknown) => MaybePromise<R3>,
        (data: R3, unsafe?: unknown) => MaybePromise<R4>,
        (data: R4, unsafe?: unknown) => MaybePromise<R5>
    ]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}, R6 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>,
        (data: R2, unsafe?: unknown) => MaybePromise<R3>,
        (data: R3, unsafe?: unknown) => MaybePromise<R4>,
        (data: R4, unsafe?: unknown) => MaybePromise<R5>,
        (data: R5, unsafe?: unknown) => MaybePromise<R6>
    ]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}, R6 extends {}, R7 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>,
        (data: R2, unsafe?: unknown) => MaybePromise<R3>,
        (data: R3, unsafe?: unknown) => MaybePromise<R4>,
        (data: R4, unsafe?: unknown) => MaybePromise<R5>,
        (data: R5, unsafe?: unknown) => MaybePromise<R6>,
        (data: R6, unsafe?: unknown) => MaybePromise<R7>
    ]): void;
    register<D1 extends {}, R1 extends {}, R2 extends {}, R3 extends {}, R4 extends {}, R5 extends {}, R6 extends {}, R7 extends {}, R8 extends {}>(name: string, flow: readonly [
        (data: D1, unsafe?: unknown) => MaybePromise<R1>,
        (data: R1, unsafe?: unknown) => MaybePromise<R2>,
        (data: R2, unsafe?: unknown) => MaybePromise<R3>,
        (data: R3, unsafe?: unknown) => MaybePromise<R4>,
        (data: R4, unsafe?: unknown) => MaybePromise<R5>,
        (data: R5, unsafe?: unknown) => MaybePromise<R6>,
        (data: R6, unsafe?: unknown) => MaybePromise<R7>,
        (data: R7, unsafe?: unknown) => MaybePromise<R8>
    ]): void;
    register(name: string, flow: ReadonlyArray<(data: any, unsafe?: unknown) => any>): void;
    /**
     * unregister a previously registered flow
     */
    unregister(name: string): void;
    /**
     * register all flows in a folder
     */
    registerFolder(folder: string): Promise<void>;
    private _registerFolder;
    /**
     * add hook — callback may be sync or async
     */
    hook<T extends SupportedHooks>(name: T, fn: HookFn<T>): void;
    /**
     * remove a previously registered hook
     */
    unhook<T extends SupportedHooks>(name: T, fn: HookFn<T>): void;
    private isActionExists;
    /**
     * Executes a flow iteratively (no recursion) so arbitrarily long flows
     * and deep jump chains never overflow the call stack.
     */
    private executeRepeat;
    /**
     * Start the execution process on a registered flow.
     * Use the T and S type parameters to annotate the input and output shapes.
     */
    execute<T extends {} = {}, S extends {} = {}, U = {}>(flowName: string, input: T, unsafe?: U): Promise<S>;
}
export {};
