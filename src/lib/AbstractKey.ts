import { Inject } from './Inject'
import { DependencyKey, SimpleKey, Target } from './DependencyKey'
import { Container } from './Container'

import ProvideGraph = Container.Graph

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
     * @see {@link Inject.provider}
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
     * Resolves to a {@link Promise} of the target value, allowing a synchronous resource
     * to depend on an asynchronous one.
     *
     * @see {@link Inject.async}
     * @group DependencyKey Operators
     */
    Async<Th extends DependencyKey>(this: Th): Inject.Async<Th> {
        return Inject.async(this)
    }

    /**
     * Applicable when `this` is a key that resolves to a function, for example
     * a {@link SubcomponentDefinition} or a {@link FactoryKey}.
     * Resolves to the output of the function when called with {@link args}.
     *
     * ```ts
     * class UserFactory extends FactoryKey(
     *   (name: string, id: number) => new User(name, id),
     * ) { private _: any }
     *
     * container.inject({ user: UserFactory.Build(name, id) }, ({ user }) => {
     *   console.log(user.name, user.id)
     * })
     * ```
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
     * Applies the given {@link transform} to the resolved value of this {@link DependencyKey}.
     *
     * @example
     *
     * ```ts
     * class IdNum extends TypeKey<number>() { private _: any }
     * class IdStr extends TypeKey({
     *   default: IdNum.Map(id => id.toString()),
     * }) { private _: any }
     * ```
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
