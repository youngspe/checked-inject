import { Container } from './Container'
import { InjectError, DependencyNotSyncError } from './InjectError'
import { Target, DependencyKey, IsSyncDepsOf, DepsOf } from './DependencyKey'
import { BaseComputedKey, ComputedKey } from './ComputedKey'
import { Initializer, maybePromiseThen } from './_internal'
import { ChildGraph, FlatGraph } from './ProvideGraph'
import { TypeKey, FactoryKey } from './TypeKey'
import { Injectable } from './InjectableClass'

/**
 * Implementations of {@link ComputedKey} for customizing resource injections.
 */
export namespace Inject {
    /** @see {@link value} */
    export abstract class Value<T> extends BaseComputedKey<T, void, never> {
        readonly instance: T
        private readonly _init: Initializer.Sync<T>

        constructor(value: T) {
            super()
            this.instance = value
            const ref = { value }
            this._init = () => ref
        }

        init(): Initializer.Sync<T> {
            return this._init
        }
    }

    class _Value<T> extends Value<T> { }

    /** @returns A {@link ComputedKey} that always resolves to {@link value} */
    export function value<T>(value: T): Value<T> {
        return new _Value(value)
    }

    /** @see {@link map} */
    export abstract class Map<T, K extends DependencyKey, G extends Container.Graph = never>
        extends BaseComputedKey<T, K, DepsOf<K>, IsSyncDepsOf<K>, G> {
        private readonly _transform: (deps: Target<K, G>) => T

        constructor(src: K, transform: (deps: Target<K, G>) => T) {
            super(src)
            this._transform = transform
        }

        init(deps: InjectError | Initializer<Target<K, G>>): InjectError | Initializer<T> {
            if (deps instanceof InjectError) return deps
            return Initializer.chain(deps, x => ({ value: this._transform(x) }))
        }
    }

    class _Map<T, K extends DependencyKey, G extends Container.Graph> extends Map<T, K, G> { }

    /**
     * Creates a {@link ComputedKey} to provide a resource based on other dependencies.
     *
     * @param src - The dependency to which {@link transform} will be applied
     * @param transform - A function that will be called when the {@link ComputedKey} is requested.
     *  {@link src} will resolved first to provide the input to the function
     * @returns A {@link ComputedKey} that resolves to the result of applying {@link src} to {@link transform}
     *
     * @example Providing a default injection for a class:
     *
     * ```ts
     * class User {
     *   name: string; id: number
     *   constructor(name: string, id: number) {
     *     this.name = name; this.id = id
     *   }
     *
     *   static inject = Inject.map({
     *     name: NameKey,
     *     id: IdKey,
     *   }, ({ name, id }) => new User(name, id))
     * }
     * ```
     *
     * @see
     *  {@link TypeKey.Map | TypeKey.Map},
     *  {@link ComputedKey.Map | ComputedKey.Map},
     *  {@link Injectable.Map | Injectable.Map}
     */
    export function map<
        T,
        K extends DependencyKey,
        G extends Container.Graph = never,
    >(src: K, transform: (deps: Target<K, G>) => T): Map<T, K, G> {
        return new _Map(src, transform)
    }

    /** @see {@link from} */
    export abstract class From<K extends DependencyKey> extends BaseComputedKey<Target<K>, K> {
        init(deps: InjectError | Initializer<Target<K>>): InjectError | Initializer<Target<K>> {
            return deps
        }
    }

    class _From<K extends DependencyKey> extends From<K> { }

    /**
     * If {@link src} is a {@link ComputedKey}, returns {@link src}.
     * Otherwise, returns a {@link ComputedKey} that resolves to the value provided for {@link src}.
     * Essentially, converts any {@link DependencyKey} into an equivalent {@link ComputedKey}.
     */
    export function from<K extends DependencyKey>(src: K):
        K extends ComputedKey<Target<K>, infer _Src, DepsOf<K>, IsSyncDepsOf<K>, infer _G> ? K : From<K> {
        return (src instanceof ComputedKey ? src : new _From(src)) as any
    }

    /**
     * Equivalent to `Inject.map([...deps], args => new ctor(...args))`.
     *
     * @param ctor - A constructor that produces the desired resource
     * @param deps - A list of dependencies that resolve to {@link ctor}'s arguments
     * @example Providing a default injection for a class:
     *
     * ```ts
     * class User {
     *   name: string; id: number
     *   constructor(name: string, id: number) {
     *     this.name = name; this.id = id
     *   }
     *
     *   static inject = Inject.construct(this, NameKey, IdKey)
     * }
     * ```
     */
    export function construct<
        T, K extends DependencyKey[], G extends Container.Graph = never,
    >(ctor: new (...args: Target<K, G>) => T, ...deps: K) {
        return map<T, K, G>(deps, deps => new ctor(...deps))
    }

    /**
     *
     * Equivalent to `Inject.map([...deps], args => init(...args))`.
     *
     * @param init - A function that returns the desired resource
     * @param deps - A list of dependencies that resolve to {@link init}'s arguments
     */
    export function call<
        T, K extends DependencyKey[], G extends Container.Graph = never,
    >(init: (...args: Target<K, G>) => T, ...deps: K) {
        return map<T, K, G>(deps, deps => init(...deps))
    }

    /** @see {@link lazy} */
    export abstract class GetLazy<K extends DependencyKey>
        extends BaseComputedKey<() => Target<K>, K, DepsOf<K> | IsSyncDepsOf<K>, never> {
        override init(deps: Initializer<Target<K>> | InjectError): Initializer.Sync<() => Target<K>> | InjectError {
            if (deps instanceof InjectError) return deps
            let d: Initializer<Target<K>> | null = deps
            let value: Target<K> | null = null

            const out = {
                value: () => {
                    if (d) {
                        const ref = d()
                        if ('value' in ref) {
                            value = ref.value
                            d = null
                        } else {
                            throw new DependencyNotSyncError()
                        }
                    }
                    return value as Target<K>
                }
            }
            return () => out
        }
    }

    class _GetLazy<K extends DependencyKey> extends GetLazy<K> { }

    /**
     * Requests a function returning a lazily-computed value for {@link src}.
     * It must be possible to request {@link src} synchronously.
     * If {@link src} identifies an asynchronous resource, wrap it in {@link async} first to resolve to an async function.
     *
     * @see
     *  {@link TypeKey.Lazy | TypeKey.Lazy},
     *  {@link ComputedKey.Lazy | ComputedKey.Lazy},
     *  {@link Injectable.Lazy | Injectable.Lazy}
     */
    export function lazy<K extends DependencyKey>(src: K): GetLazy<K> {
        return new _GetLazy(src)
    }

    /** @see {@link provider} */
    export abstract class GetProvider<K extends DependencyKey>
        extends BaseComputedKey<() => Target<K>, K, DepsOf<K> | IsSyncDepsOf<K>, never> {
        override init(deps: Initializer<Target<K>> | InjectError): Initializer.Sync<() => Target<K>> | InjectError {
            if (deps instanceof InjectError) return deps
            const out = {
                value: () => {
                    const ref = deps()
                    if ('value' in ref) {
                        return ref.value
                    } else {
                        throw new DependencyNotSyncError()
                    }
                }
            }
            return () => out
        }
    }

    class _GetProvider<K extends DependencyKey> extends GetProvider<K> { }

    /**
     * Requests a function returning the target value of {@link src}.
     *
     * It must be possible to request {@link src} synchronously.
     * If {@link src} identifies an asynchronous resource, wrap it in {@link async} first to resolve to an async function.
     *
     * @see
     *  {@link TypeKey.Provider | TypeKey.Provider},
     *  {@link ComputedKey.Provider | ComputedKey.Provider},
     *  {@link Injectable.Provider | Injectable.Provider}
     */
    export function provider<K extends DependencyKey>(src: K): GetProvider<K> {
        return new _GetProvider(src)
    }

    const undefinedRef = { value: undefined }
    const undefinedInit = () => undefinedRef

    /** @see {@link optional} */
    export abstract class Optional<K extends DependencyKey> extends BaseComputedKey<Target<K> | undefined, K, never, IsSyncDepsOf<K>> {

        override init(deps: Initializer<Target<K>> | InjectError): Initializer<Target<K> | undefined> {
            if (deps instanceof InjectError) return undefinedInit
            return deps
        }
    }

    class _Optional<K extends DependencyKey> extends Optional<K> { }

    /**
     * Requests a value for {@link src} if provided, otherwise `undefined`.
     * Allows for opt-out of the static checks that {@link src} can be resolved.
     *
     * @see
     *  {@link TypeKey.Optional | TypeKey.Optional},
     *  {@link ComputedKey.Optional | ComputedKey.Optional},
     *  {@link Injectable.Optional | Injectable.Optional}
     */
    export function optional<K extends DependencyKey>(src: K): Optional<K> {
        return new _Optional(src)
    }

    /** @see {@link build} */
    export abstract class Build<
        K extends DependencyKey.Of<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Target<K>>,
    > extends Map<Out, K> {
        constructor(inner: K, ...args: Args) {
            super(inner, fac => fac(...args))
        }
    }
    class _Build<
        K extends DependencyKey.Of<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Target<K>>,
    > extends Build<K, Args, Out> { }

    /**
     * Applicable when {@link src} is a key that resolves to a function, for example
     * a {@link SubcomponentDefinition} or a {@link FactoryKey}.
     * Resolves to the output of the function when called with {@link args}.
     *
     * @see
     *  {@link TypeKey.Build | TypeKey.Build},
     *  {@link ComputedKey.Build | ComputedKey.Build},
     *  {@link Injectable.Build | Injectable.Build}
     */
    export function build<
        K extends DependencyKey.Of<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Target<K>>,
    >(src: K, ...args: Args): Build<K, Args, Out> {
        return new _Build(src, ...args)
    }

    /** @see {@link async} */
    export abstract class Async<K extends DependencyKey> extends BaseComputedKey<Promise<Target<K>>, K, DepsOf<K>, never> {
        override init(deps: InjectError | Initializer<Target<K>>): InjectError | Initializer<Promise<Target<K>>> {
            if (deps instanceof InjectError) return deps
            return () => ({ value: Promise.resolve(deps()).then(({ value }) => value) })
        }
    }

    class _Async<K extends DependencyKey> extends Async<K> { }

    /**
     * Resolves to a {@link Promise}\<{@link Target}\<typeof {@link src}>>.
     * This is useful for requesting asynchronous dependencies when the dependent resource doesn't need the resolved value right away.
     *
     * @see
     *  {@link TypeKey.Async | TypeKey.Async},
     *  {@link ComputedKey.Async | ComputedKey.Async},
     *  {@link Injectable.Async | Injectable.Async}
     */
    export function async<K extends DependencyKey>(src: K): Async<K> {
        return new _Async(src)
    }

    /**
     * A {@link ComputedKey} that resolves to a {@link Container.Subcomponent},
     * i.e. a function returning a component.
     *
     * @see {@link subcomponent}
     */
    export abstract class SubcomponentDefinition<
        Args extends any[],
        G extends Container.Graph,
    > extends Map<(...args: Args) => Container<G>, typeof Container.Key> {
        constructor(f: (ct: Container<ChildGraph<FlatGraph<never>, never>>, ...args: Args) => Container<G>) {
            super(Container.Key, ct => (...args) => f(ct.createChild(), ...args))
        }
    }

    class _SubcomponentDefinition<
        Args extends any[],
        P extends Container.Graph,
    > extends SubcomponentDefinition<Args, P> { }

    /**
     * Defines a subcomponent that applies the scopes and dependencies provided in {@link setup} to a new child container.
     *
     * @typeParam Args - The arguments that the resolved {@link Container.Subcomponent} will accept to produce the child container.
     * @param setup - A function that adds {@link Scope | Scopes} and provides dependencies to a new child container.
     * @returns A {@link SubcomponentDefinition} producing a {@link Container.Subcomponent} that transforms
     *  {@link Args} into a container with the dependencies and scopes provided by {@link setup}
     *
     * @example Defining a subcomponent:
     *
     * ```ts
     * const UserSubcomponent = Inject.subcomponent(
     *   (ct, name: string, id: number) => ct
     *     .addScope(UserScope)
     *     .provideInstance(NameKey, name)
     *     .provideInstance(IdKey, id)
     * )
     * ```
     *
     * @example Using a subcomponent:
     *
     * ### Requesting and calling the subcomponent:
     *
     * ```ts
     * const child = parent.request(UserSubcomponent)('Alice', 123)
     * ```
     *
     * ### {@link Container.build}:
     *
     * ```ts
     * const child = parent.build(UserSubcomponent, 'Alice', 123)
     * ```
     *
     * ### {@link ComputedKey.Build}:
     *
     * ```ts
     * parent.inject({ child: UserSubcomponent.Build('Alice', 123) }, ({ child }) => {
     *   // ...
     * })
     * ```
     */
    export function subcomponent<
        Args extends any[],
        G extends Container.Graph,
    >(
        setup: (ct: Container<ChildGraph<FlatGraph<never>, never>>, ...args: Args) => Container<G>,
    ): SubcomponentDefinition<Args, G> {
        return new _SubcomponentDefinition(setup)
    }
}
