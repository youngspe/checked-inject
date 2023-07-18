
/** Represents a scope for which certain dependencies are provided. */

const MISSING_SCOPE_TAG = 'add `static readonly [scopeTag] = Symbol()` to ScopeClass implementation' as const

export function Scope() {
    abstract class _Scope {
        constructor(..._args: never) { }
        static readonly scopeTag: symbol | typeof MISSING_SCOPE_TAG = MISSING_SCOPE_TAG
        static readonly inject: null
    }
    return _Scope
}

export interface Scope {
    readonly scopeTag: symbol
    readonly name?: string
    readonly inject: null
}

export namespace Scope {
    export function isScope(target: any): target is Scope {
        return 'scopeTag' in target && typeof target.scopeTag == 'symbol'
    }
}

/** The default scope for top-level containers. */
export class Singleton extends Scope() { static readonly scopeTag = Symbol(); }

export type ScopeList<Scp extends Scope = Scope> = Scp | readonly ScopeList<Scp>[]

export namespace ScopeList {
    export function flatten<Scp extends Scope>(scopes: ScopeList<Scp>): Scp[] {
        return scopes instanceof Array ? scopes.flatMap(flatten) as Scp[] : [scopes]
    }

    export function isScopeList(target: any): target is ScopeList {
        if ('scopeTag' in target && typeof target.scopeTag == 'symbol') return true
        if (target instanceof Array) return target.every(isScopeList)
        return false
    }
}
