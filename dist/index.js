"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Flows = exports.SupportedHooks = void 0;
const fs = require("fs");
const path = require("path");
const debuglib = require("debug");
const debug = debuglib('flows');
var SupportedHooks;
(function (SupportedHooks) {
    SupportedHooks["PRE_ACTION"] = "PRE_ACTION";
    SupportedHooks["POST_ACTION"] = "POST_ACTION";
    SupportedHooks["PRE_FLOW"] = "PRE_FLOW";
    SupportedHooks["POST_FLOW"] = "POST_FLOW";
    SupportedHooks["EXCEPTION"] = "EXCEPTION";
})(SupportedHooks = exports.SupportedHooks || (exports.SupportedHooks = {}));
class Flows {
    constructor() {
        this.hooks = {
            [SupportedHooks.PRE_ACTION]: [],
            [SupportedHooks.POST_ACTION]: [],
            [SupportedHooks.PRE_FLOW]: [],
            [SupportedHooks.POST_FLOW]: [],
            [SupportedHooks.EXCEPTION]: [],
        };
        this.flows = new Map();
    }
    getHook(hookName) {
        const hook = this.hooks[hookName];
        if (!Array.isArray(hook)) {
            throw new Error(`Hook ${hookName} is not a known hook, please read the docs regarding acceptable hooks`);
        }
        return hook;
    }
    getAction(flowName, i) {
        const flow = this.flows.get(flowName);
        if (!Array.isArray(flow) || !flow[i]) {
            throw new Error('flow does not exists!');
        }
        return flow[i];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    register(name, flow) {
        debug('register', name);
        // Exact match — "initialize" or "reinitialize" are separate flows
        if (name === 'init' && this.flows.has('init')) {
            const currentInit = this.flows.get('init');
            const newInit = [...currentInit, ...flow];
            this.flows.set('init', newInit);
            return;
        }
        this.flows.set(name, flow);
    }
    /**
     * unregister a previously registered flow
     */
    unregister(name) {
        this.flows.delete(name);
    }
    /**
     * register all flows in a folder
     */
    async registerFolder(folder) {
        await this._registerFolder(folder, folder);
    }
    async _registerFolder(folder, originFolder) {
        const files = await fs.promises.readdir(folder);
        await Promise.all(files.map(async (file) => {
            var _a;
            const filePath = path.join(folder, file);
            const stats = await fs.promises.stat(filePath);
            if (stats.isDirectory()) {
                await this._registerFolder(filePath, originFolder);
            }
            else {
                const relativeFilePath = path.relative(originFolder, filePath);
                // Use path.parse so multi-dot filenames (e.g. "create.user.ts") are handled correctly
                const { dir, name } = path.parse(relativeFilePath);
                const flowName = dir ? `${dir}/${name}` : name;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.register(flowName, await (_a = filePath, Promise.resolve().then(() => require(_a))).then((m) => m.default));
            }
        }));
    }
    /**
     * add hook — callback may be sync or async
     */
    hook(name, fn) {
        const hook = this.getHook(name);
        hook.push(fn);
    }
    /**
     * remove a previously registered hook
     */
    unhook(name, fn) {
        const hook = this.getHook(name);
        const index = hook.indexOf(fn);
        if (index !== -1) {
            hook.splice(index, 1);
        }
    }
    isActionExists(flowName, i) {
        const flow = this.flows.get(flowName);
        return Array.isArray(flow) && typeof flow[i] === 'function';
    }
    /**
     * Executes a flow iteratively (no recursion) so arbitrarily long flows
     * and deep jump chains never overflow the call stack.
     */
    async executeRepeat(flowName, initialData, unsafe, startI, meta = { activated: [] }) {
        let currentFlowName = flowName;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let data = initialData;
        let i = startI;
        while (true) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const stepData = structuredClone(data);
            const action = this.isActionExists(currentFlowName, i)
                ? this.getAction(currentFlowName, i)
                : null;
            // Cycle detection: track which flows have been entered via jumps
            const lastFlow = meta.activated.length > 0 ? meta.activated[meta.activated.length - 1] : null;
            if (currentFlowName !== lastFlow && !meta.activated.includes(currentFlowName)) {
                meta.activated.push(currentFlowName);
            }
            else if (currentFlowName !== lastFlow) {
                throw new Error(`cyclic flow!!, [${meta.activated.join(', ')}, ${currentFlowName}]`);
            }
            // End of flow: no more actions or done flag set
            if (!action || stepData.$$?.done) {
                if (!stepData.$$)
                    stepData.$$ = {};
                await Promise.all(this.getHook(SupportedHooks.POST_FLOW).map((fn) => fn({ flowName: currentFlowName, output: stepData })));
                return structuredClone(stepData);
            }
            /** PRE_ACTION hook */
            await Promise.all(this.getHook(SupportedHooks.PRE_ACTION).map((fn) => fn({ flowName: currentFlowName, i, actionFn: action, input: stepData })));
            let result;
            try {
                result = await action(stepData, unsafe);
                if (typeof result !== 'object' || result === null) {
                    throw new Error(`in flow ${currentFlowName} action number ${i} return "${result}" instead of object!\nactions must return object`);
                }
            }
            catch (error) {
                /** EXCEPTION hook */
                await Promise.all(this.getHook(SupportedHooks.EXCEPTION).map((fn) => fn({
                    flowName: currentFlowName,
                    i,
                    actionFn: action,
                    input: stepData,
                    error: error,
                })));
                throw error;
            }
            // Preserve $$ metadata from current step, then merge action result on top
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const nextData = { $$: stepData.$$ };
            Object.assign(nextData, result);
            /** POST_ACTION hook */
            await Promise.all(this.getHook(SupportedHooks.POST_ACTION).map((fn) => fn({
                flowName: currentFlowName,
                i,
                actionFn: action,
                input: stepData,
                output: nextData,
            })));
            // Jump to another flow or advance to next action
            if (nextData.$$?.jump) {
                const jumpTo = nextData.$$.jump;
                delete nextData.$$.jump;
                currentFlowName = jumpTo;
                i = nextData.$$.i ?? 0;
            }
            else {
                i++;
            }
            data = nextData;
        }
    }
    /**
     * Start the execution process on a registered flow.
     * Use the T and S type parameters to annotate the input and output shapes.
     */
    async execute(flowName, input, unsafe) {
        const data = structuredClone(input);
        if (!this.flows.has(flowName)) {
            console.warn(`${flowName} flow does not exists! Skipped`);
            return data;
        }
        /** PRE_FLOW hook */
        await Promise.all(this.getHook(SupportedHooks.PRE_FLOW).map((fn) => fn({ flowName, input: data })));
        return this.executeRepeat(flowName, data, unsafe ?? {}, 0);
    }
}
exports.Flows = Flows;
