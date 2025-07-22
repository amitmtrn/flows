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
export declare class Flows {
    private hooks;
    private flows;
    constructor();
    private getHook;
    private getAction;
    /**
     * register flow
     */
    register<T = any>(name: string, flow: Array<(data: T, unsafe?: unknown) => T | Promise<T>> | []): void;
    /**
     * register all flows in a folder
     */
    registerFolder(folder: string): void;
    /**
     *  add hook
     */
    hook<T extends SupportedHooks>(name: T, fn: (v: HookInput[T]) => void): void;
    private isActionExists;
    /**
     * this method run recursively the flow in order to allow async based function and jump between flows.
     */
    private executeRepeat;
    /**
     * start the execution process on a registered flow.
     */
    execute<T extends {
        $$?: {
            done?: boolean;
            jump?: string;
        };
    } = {}, S extends {
        $$?: {
            done?: boolean;
            jump?: string;
        };
    } = {}, U = {}>(flowName: string, input: T, unsafe?: U): Promise<S>;
}
export {};
