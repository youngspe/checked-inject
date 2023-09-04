import { Container } from './Container'
import { InjectError } from './InjectError'
import { DependencyKey, DepsOf, Target, IsSyncDepsOf } from './DependencyKey'
import { AbstractKey } from './AbstractKey'
import { Initializer } from './_internal'

declare const _computedKeySymbol: unique symbol

/** @ignore */
export interface HasComputedKeySymbol<out T, D = any, Sync = any> {
    /** @ignore */
    readonly [_computedKeySymbol]: readonly [T, D, Sync] | null
}

/**
 * A key that transforms a provider for {@link K} into a provider of {@link T}.
 *
 * Not meant to be extended by library consumers.
 * Instead, use the implementations provided in {@link Inject}.
 *
 * @group Dependencies
 * @category ComputedKey
 */
export abstract class ComputedKey<
    T = any,
    K extends DependencyKey = any,
    D = any,
    Sync = any,
    P extends Container.Graph = any,
> extends AbstractKey implements HasComputedKeySymbol<T, D, Sync> {
    /** @ignore */
    readonly [_computedKeySymbol]!: readonly [T, D, Sync] | null
    /** This key determines the dependencies that will be passed to `this.init()`. */
    abstract readonly inner: K

    /** Given a provider of {@link K} or an error, return a provider of {@link T} or an error. */
    abstract init(deps: Initializer<Target<K, P>> | InjectError): Initializer<T> | InjectError
}

/**
 * @ignore
 * @internal
 */
export abstract class BaseComputedKey<
    out T,
    out K extends DependencyKey,
    D = DepsOf<K>,
    Sync = IsSyncDepsOf<K>,
    P extends Container.Graph = never,
> extends ComputedKey<T, K, D, Sync, P> {
    readonly inner: K

    /**
     * @ignore
     * @internal
     */
    constructor(inner: K) {
        super()
        this.inner = inner
    }
}

/**
 * @ignore
 * @group Dependencies
 * @category ComputedKey
 */
export namespace ComputedKey {
    /** @ignore */
    export type WithDepsOf<T, K extends DependencyKey> = ComputedKey<T, any, DepsOf<K>, IsSyncDepsOf<K>>
}

class _LazyKey<K extends DependencyKey> extends ComputedKey<
    Target<K>,
    K,
    DepsOf<K>,
    IsSyncDepsOf<K>,
    never
> {
    private _f: (() => K) | null
    private _inner: K | null = null

    override get inner() {
        if (this._f) {
            this._inner = this._f()
            this._f = null
        }
        return this._inner!
    }

    constructor(f: () => K) {
        super()
        this._f = f
    }

    init(deps: InjectError | Initializer<Target<K>>): InjectError | Initializer<Target<K>> {
        return deps
    }
}

/**
 * Resolves the dependencies specified by the return value of {@link src}.
 * Useful when depending on a class or TypeKey that hasn't yet been declared.
 *
 * @example
 *
 * In this example, `LazyKey(() => NameKey)`
 * is necessary because `MyFactory` is declared before `NameKey`:
 *
 * ```ts
 * class MyFactory extends FactoryKey(
 *   LazyKey(() => NameKey), (name, id: string) => name + id,
 * ) { private _: any }
 *
 * class NameKey extends TypeKey<string>() { private _: any }
 * ```
 */
export function LazyKey<K extends DependencyKey>(src: () => K): LazyKey<K> {
    return new _LazyKey(src)
}

/** @see {@link LazyKey} */
export type LazyKey<K extends DependencyKey> = _LazyKey<K>
