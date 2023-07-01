
/** Represents a scope for which certain dependencies are provided. */


const MISSING_SCOPE_TAG = 'add `static readonly [scopeTag] = Symbol()` to ScopeClass implementation' as const

interface ScopeClass {

}

export function Scope() {
    abstract class _Scope {
        constructor(..._args: never) { }
        static readonly scopeTag: symbol | typeof MISSING_SCOPE_TAG = MISSING_SCOPE_TAG
    }
    return _Scope
}

export interface Scope {
    readonly scopeTag: symbol
    readonly name?: string
}

/** The default scope for top-level containers. */
export class Singleton extends Scope() { static readonly scopeTag = Symbol(); }
