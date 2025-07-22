import * as fs from 'fs';
import * as path from 'path';
import * as debuglib from 'debug';

const debug = debuglib('flows');

interface HookInput {
  [SupportedHooks.PRE_ACTION]: {
    flowName: string;
    i: number;
    actionFn: Action<{}, {}>;
    input: unknown;
  },
  [SupportedHooks.POST_ACTION]: {
    flowName: string;
    i: number;
    actionFn: Action<{}, {}>;
    input: unknown;
    output: unknown;
  },
  [SupportedHooks.PRE_FLOW]: {
    flowName: string;
    input: unknown;
  },
  [SupportedHooks.POST_FLOW]: {
    flowName: string;
    output: unknown;
  },
  [SupportedHooks.EXCEPTION]: {
    flowName: string;
    i: number;
    actionFn: Action<{}, {}>;
    input: unknown;
    error: Error;
  }
}

export enum SupportedHooks {
  PRE_ACTION = 'PRE_ACTION',
  POST_ACTION = 'POST_ACTION',
  PRE_FLOW = 'PRE_FLOW',
  POST_FLOW = 'POST_FLOW',
  EXCEPTION = 'EXCEPTION'
}

export type Action<ValueType, ReturnType> = (
	previousValue: Partial<ValueType>,
  unsafe: unknown
) => ReturnType | PromiseLike<ReturnType>;

export class Flows {
  private hooks: Record<SupportedHooks, Array<(v: HookInput[SupportedHooks]) => void>> = {
    [SupportedHooks.PRE_ACTION]: [],
    [SupportedHooks.POST_ACTION]: [],
    [SupportedHooks.PRE_FLOW]: [],
    [SupportedHooks.POST_FLOW]: [],
    [SupportedHooks.EXCEPTION]: [],
  };
  private flows: Map<string, Iterable<Action<unknown, unknown>>> = new Map();

  constructor() {
    this.executeRepeat = this.executeRepeat.bind(this);
  }

  private getHook<T extends SupportedHooks>(hookName: T):((v: HookInput[T]) => void)[] {
    const hook: ((v: HookInput[T]) => void)[] | undefined = this.hooks[hookName];
    
    if(!Array.isArray(hook)) {
      throw new Error(`Hook ${hookName} is not a known hook, please read the docs regarding acceptable hooks`);
    }

    return hook;
  }

  private getAction(flowName: string, i: number): Action<{}, {}> {
    const flow = this.flows.get(flowName);
    
    if(!Array.isArray(flow) || !flow[i]) {
      throw new Error('flow does not exists!');
    }

    return flow[i]; 
  }

  /**
   * register flow
   */
  register<T = any>(name: string, flow: Array<(data: T, unsafe?: unknown) => T | Promise<T>> | []): void {
    debug('register', name, flow.map(f => f.name).join(', '));

    if(name.includes('init') && this.flows.has('init')) {
      const currentInit = this.flows.get('init') as Array<Action<unknown, unknown>>;
      const newInit = [...currentInit, ...flow];

      this.flows.set('init', newInit as Iterable<Action<unknown, unknown>>);
      return;
    }

    this.flows.set(name, flow);
  }

  /**
   * register all flows in a folder
   */
  registerFolder(folder: string) {
    const files = fs.readdirSync(folder);

    files.forEach(file => {
      const filePath = path.join(folder, file);
      const stats = fs.statSync(filePath);

      if(stats.isDirectory()) {
        this.registerFolder(filePath);
      } else {
        const relativeFilePath = path.relative(folder, filePath);
        this.register(relativeFilePath.split('.')[0], require(filePath));
      }
    });
  }

  /**
   *  add hook
   */
  hook<T extends SupportedHooks>(name: T, fn: (v: HookInput[T]) => void): void {
    const hook = this.getHook(name);

    hook.push(fn);
  }


  private isActionExists(flowName: string, i: number): boolean {
    const flow = this.flows.get(flowName);
    
    return Array.isArray(flow) 
      && (({}).toString.call(flow[i]) === '[object Function]' || ({}).toString.call(flow[i]) === '[object AsyncFunction]');
  }

  /**
   * this method run recursively the flow in order to allow async based function and jump between flows.
   */
  private async executeRepeat<T extends {$$?: {done?: boolean; jump?: string; i?: number; }}, S extends {$$?: {done?: boolean; jump?: string; i?: number; }}, U>(flowName: string, data: T, unsafe: U, i: number, meta: {activated: string[]} = {activated: []}): Promise<S> {
    const action = this.isActionExists(flowName, i) ? this.getAction(flowName, i) : null;
    const actionData: T = JSON.parse(JSON.stringify(data));
    let nextActionData: S = {$$: actionData.$$} as S;
    let lastFlow = meta.activated.length > 0 ? meta.activated[meta.activated.length - 1] : null;
    
    if(flowName !== lastFlow && meta.activated.indexOf(flowName) === -1) {
      meta.activated.push(flowName);
    } else if(flowName !== lastFlow) {
      throw new Error(`cyclic flow!!, [${meta.activated.join(', ')}, ${flowName}]`);
    }

    /** POST_FLOW hook */
    if(!action || (actionData.$$ && actionData.$$.done)) {
      if(!actionData.$$) actionData.$$ = {};
      
      this.getHook(SupportedHooks.POST_FLOW).forEach(fn => fn({flowName, output: actionData}));

      return JSON.parse(JSON.stringify(actionData));
    }

    /** PRE_ACTION hook */
    this.getHook(SupportedHooks.PRE_ACTION).forEach(fn => fn({flowName, i, actionFn: this.getAction(flowName, i), input: actionData}));

    try {
      /** execution */
      const result = await (this.getAction(flowName, i)(actionData, unsafe));

      if(typeof result !== 'object') {
        throw new Error(`in flow ${flowName} action number ${i} return "${result}" instead of object!\nactions must return object`);
      }
      
      Object.assign(nextActionData, result);

      /** EXCEPTION hook */
    } catch(error) {
      this.getHook(SupportedHooks.EXCEPTION).forEach(fn => fn({flowName, i, actionFn: this.getAction(flowName, i), input: actionData, error: error as Error}));
      
      throw error;
    }

    /** POST_ACTION hook */
    this.getHook(SupportedHooks.POST_ACTION).forEach(fn => fn({flowName, i, actionFn: this.getAction(flowName, i), input: actionData, output: nextActionData}));

    /** next action */
    if(nextActionData.$$ && nextActionData.$$.jump ) {
      const jumpTo = nextActionData.$$.jump;
      delete nextActionData.$$.jump;
      return await this.executeRepeat(jumpTo, nextActionData, unsafe, nextActionData.$$.i || 0, meta);
    }
    
    return await this.executeRepeat(flowName, nextActionData, unsafe, i + 1, meta);
  }

  /**
   * start the execution process on a registered flow.
   */
  execute<T extends {$$?: {done?: boolean; jump?: string; }} = {}, S extends {$$?: {done?: boolean; jump?: string; }} = {}, U = {}>(flowName: string, input: T, unsafe?: U): Promise<S>  {
    // We make sure that data is serializable
    const data = JSON.parse(JSON.stringify(input));

    if(!this.flows.has(flowName)) {
      console.warn(`${flowName} flow does not exists! Skipped`);
      return Promise.resolve(data);
    }

    /** PRE_FLOW hook */
    this.getHook(SupportedHooks.PRE_FLOW).forEach(fn => fn({flowName: flowName, input: data as T}));

    return this.executeRepeat<T, S, unknown>(flowName, data as T, unsafe || {}, 0);    
  }
}
