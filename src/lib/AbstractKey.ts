import { ProvideGraph } from './Container'
import { Inject } from './Inject'
import { DependencyKey, SimpleKey, ProvidedActual } from './DependencyKey'

// Use this to prevent library consumers from generating types equivalent to `AbstractKey`.
const _abstractKeySymbol: unique symbol = Symbol()

export interface HasAbstractKeySymbol<out T> {
    readonly [_abstractKeySymbol]: readonly [T] | null
}

/** Implementation detail--extend `BaseKey` instead. */
export abstract class AbstractKey<out T> implements HasAbstractKeySymbol<T> {
    readonly [_abstractKeySymbol]: readonly [T] | null = null
    /** Requests a function returning a lazily-computed value of `T`. */
    Lazy = function <Th extends DependencyKey>(this: Th): Inject.GetLazy<Th> {
        return Inject.lazy<Th>(this)
    }

    /** Requests a function returning a value of `T`. */
    Provider = function <Th extends DependencyKey>(this: Th): Inject.GetProvider<Th> {
        return Inject.provider(this)
    }

    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    Optional = function <Th extends DependencyKey>(this: Th): Inject.Optional<Th> {
        return Inject.optional(this)
    }

    Async = function <Th extends DependencyKey>(this: Th): Inject.Async<Th> {
        return Inject.async(this)
    }

    Build = function <
        Th extends SimpleKey<(...args: Args) => Out>,
        Args extends any[],
        Out = Th extends SimpleKey<(...args: Args) => infer O> ? O : never
    >(this: Th, ...args: Args): Inject.Build<Th, Args, Out> {
        return Inject.build(this, ...args)
    }

    Map = function <
        Th extends DependencyKey,
        U,
        P extends ProvideGraph = never
    >(this: Th, transform: (x: ProvidedActual<Th, P>) => U): Inject.Map<U, Th, P> {
        return Inject.map(this, transform)
    }
}
