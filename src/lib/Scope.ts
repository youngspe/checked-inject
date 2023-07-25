
/** Represents a scope for which certain dependencies are provided. */

import { AbstractClass } from "./_internal"

const _scopeSymbol = Symbol()

/**
 * Generates a base class for a class object that extends {@link !Scope:FOO}.
 * classes
 *
 * @group Scoping
 */
export function Scope(): Scope.ScopeClass {
    abstract class _ScopeClass {
        /** @ignore */
        static readonly [_scopeSymbol] = null
        /** @ignore */
        static readonly scopeTag?: symbol
        static readonly inject: null
    }
    return _ScopeClass
}

/**
 * @group Scoping
 */
export interface Scope {
    /** @ignore */
    readonly [_scopeSymbol]: null
    /** @ignore */
    readonly scopeTag?: symbol
    readonly name?: string
    readonly inject: null
}

/**
 * @group Scoping
 */
export namespace Scope {
    export function isScope(target: any): target is Scope {
        return _scopeSymbol in target
    }

    export interface ScopeClass extends AbstractClass<any, never>, Scope { }
}

/**
 * The default scope for top-level containers.
 *
 * @group Scoping
 */
export class Singleton extends Scope() { private _: any; }

/**
 * @group Scoping
 */
export type ScopeList<Scp extends Scope = Scope> = Scp | readonly ScopeList<Scp>[]

/**
 * @group Scoping
 */
export namespace ScopeList {
    export function flatten<Scp extends Scope>(scopes: ScopeList<Scp>): Scp[] {
        return scopes instanceof Array ? scopes.flatMap(flatten) as Scp[] : [scopes]
    }

    export function isScopeList(target: any): target is ScopeList {
        if (_scopeSymbol in target) return true
        if (target instanceof Array) return target.every(isScopeList)
        return false
    }
}
