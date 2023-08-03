
/** Represents a scope for which certain dependencies are provided. */

import { AbstractClass, isObject } from './_internal'

const _scopeSymbol = Symbol()

/**
 * Generates a base class for a class object that extends {@link Scope:type}.
 * Classes that extend the returned base class should have a
 * `private _: any` property (or any other private member) to ensure the scope has its own unique type.
 *
 * @group Scoping
 */
export function Scope({ name }: { name?: string } = {}): Scope.ScopeClass {
    abstract class _ScopeClass {
        /** @ignore */
        static readonly [_scopeSymbol] = null
        /** @ignore */
        static readonly scopeTag?: symbol
        static readonly inject: null
        static get fullName() { return this.name + (name ? `(${name})` : '') }
    }
    return _ScopeClass
}

/**
 * Used to define the lifetime of a resolved resource.
 * An resource can be bound to a Scope, which allows the provided instance to be reused as long as the Scope is valid.
 *
 * A Scope can be added to a {@link Container}, often a child container, to indicate that the Scope is valid whenever requesting
 * resources from that container.
 *
 * @see The {@link Scope | Scope()} function for implementing Scope.
 *
 * @group Scoping
 */
export interface Scope {
    /** @ignore */
    readonly [_scopeSymbol]: null
    /** @ignore */
    readonly scopeTag?: symbol
    readonly fullName: string
    /** @ignore prevent a Scope from being an InjectableClass */
    readonly inject: null
}

/**
 * @group Scoping
 */
export namespace Scope {
    export function isScope(target: any): target is Scope {
        return isObject(target) && _scopeSymbol in target
    }

    /** Class returned by {@link Scope}. Extend this to implement {@link Scope:type}. */
    export interface ScopeClass extends AbstractClass<any, never>, Scope { }

    /**
     * If a resource is bound to this scope, its instance will be retained only withinh the container that requested it.
     *
     * All containers include the Local scope.
     */
    export class Local extends Scope() { private _: any }
}

/**
 * The default scope for top-level containers.
 * Any instances provided for a resource bound to Singleton will live as long as the container they are provided to,
 * or the root container if they are using a default injection.
 *
 * @group Scoping
 */
export class Singleton extends Scope() { private _: any }

/**
 * A {@link Scope:type | Scope} or an arbitrarily-nested list of Scopes.
 *
 * @group Scoping
 */
export type ScopeList<Scp extends Scope = Scope> = Scp | readonly ScopeList<Scp>[]

export type NonEmptyScopeList<Scp extends Scope = Scope> = Scp | readonly [ScopeList<Scp>, ...readonly ScopeList<Scp>[]]

/**
 * @group Scoping
 */
export namespace ScopeList {
    /** Converts a {@link ScopeList} into a flat list of {@link Scope:type | Scope}[] */
    export function flatten<Scp extends Scope>(scopes: ScopeList<Scp> | (() => ScopeList<Scp>) | null | undefined): Scp[] {
        return (scopes == null) ? [] :
            (isObject(scopes) && _scopeSymbol in scopes) ? [scopes] :
                (typeof scopes == 'function') ? flatten(scopes()) :
                    scopes.flatMap(flatten) as Scp[]
    }

    export function isScopeList(target: any): target is ScopeList {
        if (isObject(target) && _scopeSymbol in target) return true
        if (target instanceof Array) return target.every(isScopeList)
        return false
    }
}
