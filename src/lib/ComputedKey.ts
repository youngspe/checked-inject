import { Container } from './Container'
import { InjectError } from './InjectError'
import { Dependency } from './Dependency'
import { DependencyKey, DepsOf, Target, IsSyncDepsOf } from './DependencyKey'
import { AbstractKey } from './AbstractKey'
import { Initializer as _Initializer } from './_internal'

declare const _computedKeySymbol: unique symbol

/** @ignore */
export interface HasComputedKeySymbol<out T, D = any, Sync = any> {
    /** @ignore */
    readonly [_computedKeySymbol]: readonly [T, D, Sync] | null
}

/**
 * A key that, transforms a provider for {@link K} into a provider of {@link T}.
 */
export abstract class ComputedKey<
    out T = any,
    out K extends DependencyKey = any,
    D extends Dependency = DepsOf<K>,
    P extends Container.Graph = never,
    Sync extends Dependency = IsSyncDepsOf<K>,
> extends AbstractKey implements HasComputedKeySymbol<T, D, Sync> {
    /** @ignore */
    readonly [_computedKeySymbol]!: readonly [T, D, Sync] | null
    /** This key determines the dependencies that will be passed to `this.init()`. */
    readonly inner: K

    constructor(inner: K) {
        super()
        this.inner = inner
    }

    /** Given a provider of {@link K} or an error, return a provider of {@link T} or an error. */
    abstract init(deps: ComputedKey.Initializer<Target<K, P>> | InjectError): ComputedKey.Initializer<T> | InjectError
}

export namespace ComputedKey {
    /** @ignore */
    export interface Of<out T = any> extends ComputedKey<T, any, any, any, any> { }
    export import Initializer = _Initializer
}
