export const scopeTag: unique symbol = Symbol('scopeTag')

/** Represents a scope for which certain dependencies are provided. */
class _Scope {
    readonly [scopeTag]: symbol
    readonly name?: string
    constructor(name?: string) {
        this.name = name
        this[scopeTag] = Symbol(name)
    }
}

const MISSING_SCOPE_TAG = 'add `static readonly [scopeTag] = Symbol()` to ScopeClass implementation' as const

export abstract class ScopeClass {
    constructor(..._args: never) { }
    static readonly [scopeTag]: symbol | typeof MISSING_SCOPE_TAG = MISSING_SCOPE_TAG
}


export interface Scope {
    readonly [scopeTag]: symbol
    readonly name?: string

}

export const Scope = _Scope

/** The default scope for top-level containers. */
export class Singleton extends ScopeClass { static readonly [scopeTag] = Symbol(); }
