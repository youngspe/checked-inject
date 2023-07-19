import { Inject } from './Inject'
import { DependencyKey, SimpleKey, Target } from './DependencyKey'
import { Container } from './Container'

import ProvideGraph = Container.Graph

/** @internal */
export abstract class AbstractKey {
    /**
     * Requests a function returning a lazily-computed value for this key.
     *
     * @see {@link Inject.lazy}
     * @group DependencyKey Operators
     */
    Lazy<Th extends DependencyKey>(this: Th): Inject.GetLazy<Th> {
        return Inject.lazy<Th>(this)
    }

    /**
     * Requests a function returning this key's output type.
     *
     * @see {@link Inject.provide}
     * @group DependencyKey Operators
     */
    Provider<Th extends DependencyKey>(this: Th): Inject.GetProvider<Th> {
        return Inject.provider(this)
    }

    /**
     * Requests a value for this key if provided, otherwise `undefined`.
     *
     * @see {@link Inject.optional}
     * @group DependencyKey Operators
     */
    Optional<Th extends DependencyKey>(this: Th): Inject.Optional<Th> {
        return Inject.optional(this)
    }

    /**
     *
     * @returns
     *
     * @see {@link Inject.async}
     * @group DependencyKey Operators
     */
    Async<Th extends DependencyKey>(this: Th): Inject.Async<Th> {
        return Inject.async(this)
    }

    /**
     *
     * @param args
     * @returns
     *
     * @see {@link Inject.build}
     * @group DependencyKey Operators
     */
    Build<
        Th extends SimpleKey<(...args: Args) => Out>,
        Args extends any[],
        Out = Th extends SimpleKey<(...args: Args) => infer O> ? O : never
    >(this: Th, ...args: Args): Inject.Build<Th, Args, Out> {
        return Inject.build(this, ...args)
    }

    /**
     *
     * @param transform
     * @returns
     *
     * @see {@link Inject.map}
     * @group DependencyKey Operators
     */
    Map<
        Th extends DependencyKey,
        U,
        P extends ProvideGraph = never
    >(this: Th, transform: (x: Target<Th, P>) => U): Inject.Map<U, Th, P> {
        return Inject.map(this, transform)
    }
}
