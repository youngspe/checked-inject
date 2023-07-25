import { DependencyKey, Target } from './DependencyKey'
import { Container } from './Container'
import { Merge } from './ProvideGraph'
import { unresolved, CanRequest } from './CanRequest'

import DefaultGraph = Container.DefaultGraph
import ProvideGraph = Container.Graph
import FlatGraph = ProvideGraph.Flat
import EmptyGraph = ProvideGraph.Empty

function requestForModule<P extends ProvideGraph, K extends DependencyKey>(
    mod: Module.ApplyTo<P>,
    deps: K,
): ModuleActual<K, P> {
    return Container.create().apply(mod).requestUnchecked(deps)
}

function requestAsyncForModule<P extends ProvideGraph, K extends DependencyKey>(
    mod: Module.ApplyTo<P>,
    deps: K,
): Promise<ModuleActual<K, P>> {
    return Container.create().apply(mod).requestAsyncUnchecked(deps)
}

type ModuleActual<K extends DependencyKey, P extends ProvideGraph> = Target<K, Merge<DefaultGraph, P>>

/**
 * An object used to provide definitions to a {@link Container}
 */
export abstract class BaseModule<P extends ProvideGraph = any> implements Module.ApplyTo<P> {
    /** @ignore */
    readonly [unresolved]!: [null]

    abstract applyTo(ct: Container.Builder<any>): Container<P>

    /**
     * {@inheritDoc Container.request}
     * @see {@link Container.request}
     */
    request<K extends DependencyKey, Th extends CanRequest<Merge<DefaultGraph, P>, K>>(
        this: this & Th,
        deps: K,
    ): ModuleActual<K, P> {
        return requestForModule(this, deps)
    }

    /**
     * {@inheritDoc Container.requestAsync}
     * @see {@link Container.requestAsync}
     */
    requestAsync<K extends DependencyKey, Th extends CanRequest<Merge<DefaultGraph, P>, K, never>>(
        this: this & Th,
        deps: K,
    ): Promise<ModuleActual<K, P>> {
        return requestAsyncForModule(this, deps)
    }

    /**
     * {@inheritDoc Container.inject}
     * @see {@link Container.inject}
     */
    inject<K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K>>(
        this: this & Th,
        deps: K,
        f: (deps: ModuleActual<K, P>) => R
    ): R {
        return f(requestForModule(this, deps))
    }

    /**
     * {@inheritDoc Container.injectAsync}
     * @see {@link Container.injectAsync}
     */
    injectAsync<K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K, never>>(
        this: this & Th,
        deps: K,
        f: (deps: ModuleActual<K, P>) => R | Promise<R>
    ): Promise<R> {
        return requestAsyncForModule(this, deps).then(f)
    }

    /**
     * {@inheritDoc Container.build}
     * @see {@link Container.build}
     */
    build<
        K extends DependencyKey,
        Th extends CanRequest<Merge<DefaultGraph, P>, K>,
        Args extends ModuleActual<K, P> extends (...args: infer A) => Out ? A : never,
        Out = ModuleActual<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(this: this & Th, fac: K, ...args: Args): Out {
        return requestForModule(this, fac)(...args)
    }

    /**
     * {@inheritDoc Container.buildAsync}
     * @see {@link Container.buildAsync}
     */
    buildAsync<
        K extends DependencyKey,
        Th extends CanRequest<Merge<DefaultGraph, P>, K, never>,
        Args extends ModuleActual<K, P> extends (...args: infer A) => Out ? A : never,
        Out = ModuleActual<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(this: this & Th, fac: K, ...args: Args): Promise<Out> {
        return requestAsyncForModule(this, fac).then(f => f(...args))
    }

    /** Returns a {@link Container} with `this` applied to it. */
    container(this: Module.ApplyTo<P>) {
        return Container.create().apply(this)
    }
}
class ListModule<P extends ProvideGraph> extends BaseModule<P> {
    private readonly _items: Module.Item[]

    constructor(items: Module.Item[]) {
        super()
        this._items = items
    }

    override applyTo(ct: Container.Builder<any>) {
        for (let item of this._items) {
            if (item instanceof Array) {
                for (let x of item) { ct.apply(x); }
            } else if (typeof item == 'function') {
                item(ct)
            } else {
                item.applyTo(ct)
            }
        }
        return ct as Container<P>
    }
}

/**
 * A pre-defined set of resource providers and scopes that can be applied to any {@link Container}.
 * @see The {@link Module} function
 *
 * @group Injection
 * @category Module
 */
export interface Module<P extends ProvideGraph = any> extends BaseModule<P> { }

/**
 * Defines a {@link Module:type | Module} given a list of:
 * * Modules, which will be applied in the given order when applying the return module
 * * Functions that take a {@link Container.Builder} and provide resources and scopes
 * * Arbitrarily-nested lists of the above
 *
 * @example Providing resources and scopes:
 *
 * ```ts
 * const UserModule = Module(ct => ct
 *   .addScope(UserScope)
 *   .provideInstance(NameKey, 'Alice')
 *   .provideInstance(IdKey, 123)
 *   .provide(User, Inject.construct(User, NameKey, IdKey))
 * )
 * ```
 *
 * @example Combining Modules:
 *
 * ```ts
 * const AppModule = Module(UserModule, DataModule, FooModule)
 * ```
 *
 * @group Injection
 * @category Module
 */
export function Module<M extends Module.Item[]>(...m: M): Module<Module.Provides<M>> {
    return new ListModule(m)
}

/**
 * @group Injection
 * @category Module
 */
export namespace Module {
    /** Implementation of a module that performs operations on a given {@link Container}. */
    export interface FunctionItem<P extends FlatGraph = any> {
        (ct: Container.Builder): Container.Builder<P>
    }

    /** An argument for the {@link Module} function */
    export type Item = FunctionItem | ApplyTo | readonly Item[]

    /** {@link Container.Graph} produced by a module of type {@link M} */
    export type Provides<M> =
        M extends ApplyTo<infer P> | FunctionItem<infer P> ? P :
        M extends readonly [infer A] ? Provides<A> :
        M extends readonly [infer A, ...infer B] ? Merge<Provides<A>, Provides<B>> :
        M extends [] ? EmptyGraph :
        never

    /** Supertype of {@link Module:type | Module} that can apply itself to a {@link Container}. */
    export interface ApplyTo<P extends ProvideGraph = any> {
        applyTo(ct: Container.Builder<any>): Container<P>
    }
}
