import { Container } from './Container'
import { InjectError } from './InjectError'
import { Dependency } from './Dependency'
import { DependencyKey, DepsOf, Target, IsSyncDepsOf } from './DependencyKey'
import { AbstractKey } from './AbstractKey'
import { Initializer as _Initializer } from './_internal'
import { Inject } from './Inject'

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
    out T = any,
    out K extends DependencyKey = any,
    D extends Dependency = any,
    Sync extends Dependency = any,
    P extends Container.Graph = any,
> extends AbstractKey implements HasComputedKeySymbol<T, D, Sync> {
    /** @ignore */
    readonly [_computedKeySymbol]!: readonly [T, D, Sync] | null
    /** This key determines the dependencies that will be passed to `this.init()`. */
    readonly inner: K

    /**
     * @ignore
     * @internal
     */
    constructor(inner: K) {
        super()
        this.inner = inner
    }

    /** Given a provider of {@link K} or an error, return a provider of {@link T} or an error. */
    abstract init(deps: ComputedKey.Initializer<Target<K, P>> | InjectError): ComputedKey.Initializer<T> | InjectError
}

/**
 * @ignore
 * @internal
 */
export abstract class BaseComputedKey<
    out T,
    out K extends DependencyKey,
    D extends Dependency = DepsOf<K>,
    Sync extends Dependency = IsSyncDepsOf<K>,
    P extends Container.Graph = never,
> extends ComputedKey<T, K, D, Sync, P> { }

/**
 * @group Dependencies
 * @category ComputedKey
 */
export namespace ComputedKey {
    /** @ignore */
    export import Initializer = _Initializer
    /** @ignore */
    export type WithDepsOf<T, K extends DependencyKey> = ComputedKey<T, any, DepsOf<K>, IsSyncDepsOf<K>>
}
