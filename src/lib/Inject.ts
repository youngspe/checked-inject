import { DepsOf, InjectError } from "."
import { Scope } from "./Scope"
import { Container } from "./Container"
import { ContainerActual, BaseKey, DependencyKey, Actual, TypeKey, AnyKey, Dependency } from "./TypeKey"
import { Class } from "./_internal"

export namespace Inject {
    // abstract class _Binding<T, K, D extends Actual<K>> {
    //     protected abstract [_bindingKey]: null
    //     abstract readonly dependencies: K
    //     abstract resolve(deps: D): T
    // }


    interface _Binding<T, D extends Dependency> extends BaseKey<T, any, D> { }

    export abstract class Value<T> extends BaseKey<T, void, never> {
        readonly instance: T
        private readonly _f: () => T

        constructor(value: T) {
            super()
            this.instance = value
            this._f = () => value
        }

        init(): () => T {
            return this._f
        }
    }

    class _Value<T> extends Value<T> { }

    export function value<T>(value: T): Value<T> {
        return new _Value(value)
    }

    export abstract class Map<T, K extends AnyKey> extends BaseKey<T, K> {
        private readonly _transform: (deps: Actual<K>) => T

        constructor(src: K, transform: (deps: Actual<K>) => T) {
            super(src)
            this._transform = transform
        }

        init(deps: InjectError | (() => Actual<K>)): InjectError | (() => T) {
            if (deps instanceof InjectError) return deps
            return () => this._transform(deps())
        }
    }

    class _Map<T, K extends AnyKey> extends Map<T, K> { }

    export function map<
        T,
        K extends AnyKey,
    >(src: K, transform: (deps: Actual<K>) => T): Map<T, K> {
        return new _Map(src, transform)
    }

    class From<K extends AnyKey> extends BaseKey<Actual<K>, K> {
        init(deps: InjectError | (() => Actual<K>)): InjectError | (() => Actual<K>) {
            return deps
        }
    }

    export function from<K extends AnyKey>(src: K) {
        return new From(src)
    }

    export function construct<T, K extends AnyKey[]>(ctor: new (...args: Actual<K>) => T, ...deps: K) {
        return map(deps, deps => new ctor(...deps))
    }

    export function call<T, K extends AnyKey[]>(init: (...args: Actual<K>) => T, ...deps: K) {
        return map(deps, deps => init(...deps))
    }

    export abstract class GetLazy<K extends AnyKey> extends BaseKey<() => Actual<K>, K> {
        override init(deps: (() => Actual<K>) | InjectError): (() => () => Actual<K>) | InjectError {

            if (deps instanceof InjectError) return deps
            let d: (() => Actual<K>) | null = deps
            let value: Actual<K> | null = null

            const f = () => {
                if (d != null) {
                    value = d()
                    d = null
                }
                return value as Actual<K>
            }

            return () => f
        }
    }

    class _GetLazy<K extends AnyKey> extends GetLazy<K> { }

    /** Requests a function returning a lazily-computed value of `T`. */
    export function lazy<K extends AnyKey>(src: K): GetLazy<K> {
        return new _GetLazy(src)
    }

    export abstract class GetProvider<K extends AnyKey> extends BaseKey<() => Actual<K>, K> {
        override init(deps: (() => Actual<K>) | InjectError): (() => () => Actual<K>) | InjectError {
            if (deps instanceof InjectError) return deps
            return () => deps
        }
    }

    class _GetProvider<K extends AnyKey> extends GetProvider<K> { }

    /** Requests a function returning a value of `T`. */
    export function provider<K extends AnyKey>(src: K): GetProvider<K> {
        return new _GetProvider(src)
    }


    export abstract class Optional<K extends AnyKey> extends BaseKey<Actual<K> | undefined, K, never> {
        override init(deps: (() => Actual<K>) | InjectError): () => (Actual<K> | undefined) {
            if (deps instanceof InjectError) return () => undefined
            return deps
        }
    }

    class _Optional<K extends AnyKey> extends Optional<K> { }

    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    export function optional<K extends AnyKey>(src: K): Optional<K> {
        return new _Optional(src)
    }

    export abstract class Build<
        K extends DependencyKey<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Actual<K>>,
    > extends BaseKey<Out, K> {
        readonly args: Args
        override init(deps: (() => Actual<K>)): (() => Out) | InjectError {
            if (deps instanceof InjectError) return deps
            return () => deps()(...this.args)
        }

        constructor(inner: K, ...args: Args) {
            super(inner)
            this.args = args
        }
    }
    class _Build<
        K extends DependencyKey<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Actual<K>>,
    > extends Build<K, Args, Out> { }

    export function build<
        K extends DependencyKey<(...args: Args) => Out>,
        Args extends any[],
        Out = ReturnType<Actual<K>>,
    >(src: K, ...args: Args): Build<K, Args, Out> {
        return new _Build(src, ...args)
    }

    export abstract class SubcomponentDefinition<Args extends any[], P> extends BaseKey<(...args: Args) => Container<P>, typeof Container.Key> {
        private f: (ct: Container<never>, ...args: Args) => Container<P>

        constructor(f: (ct: Container<never>, ...args: Args) => Container<P>) {
            super(Container.Key)
            this.f = f
        }

        override init(deps: (() => Container<never>) | InjectError): (() => (...args: Args) => Container<P>) | InjectError {
            if (deps instanceof InjectError) return deps
            return () => (...args) => this.f(deps().createChild(), ...args)
        }
    }

    class _SubcomponentDefinition<Args extends any[], P> extends SubcomponentDefinition<Args, P> { }


    export function subcomponent<Args extends any[], P>(f: (ct: Container<never>, ...args: Args) => Container<P>): SubcomponentDefinition<Args, P> {
        return new _SubcomponentDefinition(f)
    }

    export type Binding<T, D extends Dependency> = _Binding<T, D> | (() => _Binding<T, D>)

}
