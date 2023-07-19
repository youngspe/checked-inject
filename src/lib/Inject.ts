import { Container } from './Container'
import { InjectError, DependencyNotSyncError } from './InjectError'
import { Target, DependencyKey, IsSyncDepsOf, DepsOf } from './DependencyKey'
import { ComputedKey } from './ComputedKey'
import { Initializer, maybePromiseThen } from './_internal'
import { ProvideGraph, ChildGraph, FlatGraph } from './ProvideGraph'

export namespace Inject {
    export abstract class Value<T> extends ComputedKey<T, void, never> {
        readonly instance: T
        private readonly _init: Initializer.Sync<T>

        constructor(value: T) {
            super()
            this.instance = value
            this._init = { sync: true, init: () => value }
        }

        init(): Initializer.Sync<T> {
            return this._init
        }
    }

    class _Value<T> extends Value<T> { }

    export function value<T>(value: T): Value<T> {
        return new _Value(value)
    }

    export abstract class Map<T, K extends DependencyKey, P extends ProvideGraph = never> extends ComputedKey<T, K, DepsOf<K>, P> {
        private readonly _transform: (deps: Target<K, P>) => T

        constructor(src: K, transform: (deps: Target<K, P>) => T) {
            super(src)
            this._transform = transform
        }

        init(deps: InjectError | Initializer<Target<K, P>>): InjectError | Initializer<T> {
            if (deps instanceof InjectError) return deps
            if (deps.sync) return {
                sync: true,
                init: () => this._transform(deps.init()),
            }
            return {
                sync: deps.sync,
                init: () => maybePromiseThen(deps.init(), this._transform),
            }
        }
    }

    class _Map<T, K extends DependencyKey, P extends ProvideGraph> extends Map<T, K, P> { }

    export function map<
        T,
        K extends DependencyKey,
        P extends ProvideGraph = never,
    >(src: K, transform: (deps: Target<K, P>) => T): Map<T, K, P> {
        return new _Map(src, transform)
    }

    export abstract class From<K extends DependencyKey> extends ComputedKey<Target<K>, K> {
        init(deps: InjectError | Initializer<Target<K>>): InjectError | Initializer<Target<K>> {
            return deps
        }
    }

    class _From<K extends DependencyKey> extends From<K> { }

    export function from<K extends DependencyKey>(src: K): From<K> {
        return new _From(src)
    }

    export function construct<
        T, K extends DependencyKey[], P extends ProvideGraph = never,
    >(ctor: new (...args: Target<K, P>) => T, ...deps: K) {
        return map<T, K, P>(deps, deps => new ctor(...deps))
    }

    export function call<
        T, K extends DependencyKey[], P extends ProvideGraph = never,
    >(init: (...args: Target<K, P>) => T, ...deps: K) {
        return map<T, K, P>(deps, deps => init(...deps))
    }

    export abstract class GetLazy<K extends DependencyKey> extends ComputedKey<() => Target<K>, K, DepsOf<K> | IsSyncDepsOf<K>> {
        override init(deps: Initializer<Target<K>> | InjectError): Initializer<() => Target<K>> | InjectError {
            if (deps instanceof InjectError) return deps
            if (!deps.sync) return new DependencyNotSyncError()
            let d: Initializer.Sync<Target<K>> | null = deps
            let value: Target<K> | null = null


            const f = () => {
                if (d?.sync) {
                    value = d.init()
                    d = null
                }
                return value as Target<K>
            }
            return { sync: true, init: () => f }
        }
    }

    class _GetLazy<K extends DependencyKey> extends GetLazy<K> { }

    /** Requests a function returning a lazily-computed value of `T`. */
    export function lazy<K extends DependencyKey>(src: K): GetLazy<K> {
        return new _GetLazy(src)
    }

    export abstract class GetProvider<K extends DependencyKey> extends ComputedKey<() => Target<K>, K, DepsOf<K> | IsSyncDepsOf<K>> {
        override init(deps: Initializer<Target<K>> | InjectError): Initializer<() => Target<K>> | InjectError {
            if (deps instanceof InjectError) return deps
            if (!deps.sync) return new DependencyNotSyncError()
            const f = () => deps.init()
            return { sync: true, init: () => f }
        }
    }

    class _GetProvider<K extends DependencyKey> extends GetProvider<K> { }

    /** Requests a function returning a value of `T`. */
    export function provider<K extends DependencyKey>(src: K): GetProvider<K> {
        return new _GetProvider(src)
    }

    export abstract class Optional<K extends DependencyKey> extends ComputedKey<Target<K> | undefined, K, never, never, IsSyncDepsOf<K>> {
        override init(deps: Initializer<Target<K>> | InjectError): Initializer<Target<K> | undefined> {
            if (deps instanceof InjectError) return { sync: true, init: () => undefined }
            return deps
        }
    }

    class _Optional<K extends DependencyKey> extends Optional<K> { }

    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    export function optional<K extends DependencyKey>(src: K): Optional<K> {
        return new _Optional(src)
    }

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

    export function build<
        K extends DependencyKey.Of<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Target<K>>,
    >(src: K, ...args: Args): Build<K, Args, Out> {
        return new _Build(src, ...args)
    }

    export abstract class Async<K extends DependencyKey> extends ComputedKey<Promise<Target<K>>, K, DepsOf<K>, never, never> {
        override init(deps: InjectError | Initializer<Target<K>>): InjectError | Initializer.Sync<Promise<Target<K>>> {
            if (deps instanceof InjectError) return deps
            return { sync: true, init: () => Promise.resolve(deps.init()) }
        }
    }

    class _Async<K extends DependencyKey> extends Async<K> { }

    export function async<K extends DependencyKey>(inner: K): Async<K> {
        return new _Async(inner)
    }

    export abstract class SubcomponentDefinition<
        Args extends any[],
        P extends ProvideGraph,
    > extends Map<(...args: Args) => Container<P>, typeof Container.Key> {
        constructor(f: (ct: Container<ChildGraph<FlatGraph<never>, never>>, ...args: Args) => Container<P>) {
            super(Container.Key, ct => (...args) => f(ct.createChild(), ...args))
        }
    }

    class _SubcomponentDefinition<
        Args extends any[],
        P extends ProvideGraph,
    > extends SubcomponentDefinition<Args, P> { }


    export function subcomponent<
        Args extends any[],
        P extends ProvideGraph,
    >(f: (ct: Container<ChildGraph<FlatGraph<never>, never>>, ...args: Args) => Container<P>): SubcomponentDefinition<Args, P> {
        return new _SubcomponentDefinition(f)
    }
}
