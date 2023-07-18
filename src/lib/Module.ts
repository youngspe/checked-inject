import { DependencyKey, ProvidedActual } from './DependencyKey'
import { Container } from './Container'
import { ProvideGraph, FlatGraph, Merge, DefaultGraph } from './ProvideGraph'
import { unresolved, CanRequest } from './CanRequest'

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

type ModuleActual<K extends DependencyKey, P extends ProvideGraph> = ProvidedActual<K, Merge<DefaultGraph, P>>

/** An object used to provide definitions to a `Container` */
export abstract class BaseModule<P extends ProvideGraph = any> implements Module.ApplyTo<P> {
    readonly [unresolved]?: ['missing dependencies:']

    abstract applyTo(ct: Container<any>): Container<P>

    request<K extends DependencyKey, Th extends CanRequest<Merge<DefaultGraph, P>, K>>(
        this: this & Th,
        deps: K,
    ): ModuleActual<K, P> {
        return requestForModule(this, deps)
    }

    requestAsync<K extends DependencyKey, Th extends CanRequest<Merge<DefaultGraph, P>, K, never>>(
        this: this & Th,
        deps: K,
    ): Promise<ModuleActual<K, P>> {
        return requestAsyncForModule(this, deps)
    }

    inject<K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K>>(
        this: this & Th,
        deps: K,
        f: (deps: ModuleActual<K, P>) => R
    ): R {
        return f(requestForModule(this, deps))
    }

    injectAsync<K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K, never>>(
        this: this & Th,
        deps: K,
        f: (deps: ModuleActual<K, P>) => R | Promise<R>
    ): Promise<R> {
        return requestAsyncForModule(this, deps).then(f)
    }

    build<
        K extends DependencyKey,
        Th extends CanRequest<Merge<DefaultGraph, P>, K>,
        Args extends ModuleActual<K, P> extends (...args: infer A) => Out ? A : never,
        Out = ModuleActual<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(this: this & Th, fac: K, ...args: Args): Out {
        return requestForModule(this, fac)(...args)
    }

    buildAsync<
        K extends DependencyKey,
        Th extends CanRequest<Merge<DefaultGraph, P>, K, never>,
        Args extends ModuleActual<K, P> extends (...args: infer A) => Out ? A : never,
        Out = ModuleActual<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(this: this & Th, fac: K, ...args: Args): Promise<Out> {
        return requestAsyncForModule(this, fac).then(f => f(...args))
    }

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

    override applyTo(ct: Container<any>) {
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

export interface Module<P extends ProvideGraph = any> extends BaseModule<P> { }

export function Module<M extends Module.Item[]>(...m: M): Module<Module.Provides<M>> {
    return new ListModule(m)
}

export namespace Module {
    /** Implementation of a module that performs operations on a given `Container`. */
    export interface FunctionItem<P extends ProvideGraph = any> {
        (ct: Container<FlatGraph<never>>): Container<P>
    }
    export type Item = FunctionItem | ApplyTo | readonly Item[]

    export type Provides<M> =
        M extends ApplyTo<infer P> | FunctionItem<infer P> ? P :
        M extends readonly [infer A] ? Provides<A> :
        M extends readonly [infer A, ...infer B] ? Merge<Provides<A>, Provides<B>> :
        M extends [] ? FlatGraph<never> :
        never

    export interface ApplyTo<P extends ProvideGraph = any> {
        applyTo(ct: Container<any>): Container<P>
    }

}
