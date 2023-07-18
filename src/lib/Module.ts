import { DependencyKey, ProvidedActual } from './DependencyKey'
import { ProvideGraph, Container, FlatGraph, unresolved, CanRequest, Merge, DefaultGraph } from './Container'

/** Implementation of a module that performs operations on a given `Container`. */

export interface FunctionModuleItem<P extends ProvideGraph = any> {
    (ct: Container<FlatGraph<never>>): Container<P>
}
export type ModuleItem = FunctionModuleItem | ApplyTo | readonly ModuleItem[]
interface ApplyTo<P extends ProvideGraph = any> {
    applyTo(ct: Container<any>): Container<P>
}
/** An object used to provide definitions to a `Container` */

export interface Module<P extends ProvideGraph = any> extends ApplyTo<P> {
    readonly [unresolved]?: ['missing dependencies:']

    inject<K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K>>(
        this: ApplyTo<P> & Th,
        deps: K,
        f: (deps: ProvidedActual<K, Merge<DefaultGraph, P>>) => R
    ): R

    injectAsync<K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K, never>>(
        this: ApplyTo<P> & Th,
        deps: K,
        f: (deps: ProvidedActual<K, Merge<DefaultGraph, P>>) => R
    ): Promise<R>
}
class _Module<P extends ProvideGraph> implements Module<P> {
    readonly [unresolved]?: ['missing dependencies:']
    private readonly _items: ModuleItem[]

    constructor(items: ModuleItem[]) {
        this._items = items
    }

    applyTo(ct: Container<any>) {
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

    readonly inject = function <K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K>>(
        this: ApplyTo<P> & Th,
        deps: K,
        f: (deps: ProvidedActual<K, Merge<DefaultGraph, P>>) => R
    ): R {
        const val = Container.create().apply(this as ApplyTo<P>).requestUnchecked(deps)
        return f(val)
    }

    readonly injectAsync = function <K extends DependencyKey, R, Th extends CanRequest<Merge<DefaultGraph, P>, K, never>>(
        this: ApplyTo<P> & Th,
        deps: K,
        f: (deps: ProvidedActual<K, Merge<DefaultGraph, P>>) => R | Promise<R>
    ): Promise<R> {
        return Container.create().apply(this as ApplyTo<P>).requestAsyncUnchecked(deps).then(f)
    }
}

export function Module<M extends ModuleItem[]>(...m: M): Module<ModuleProvides<M>> {
    return new _Module(m)
}

export type ModuleProvides<M> = M extends ApplyTo<infer P> | FunctionModuleItem<infer P> ? P : M extends readonly [infer A] ? ModuleProvides<A> : M extends readonly [infer A, ...infer B] ? Merge<ModuleProvides<A>, ModuleProvides<B>> : M extends [] ? FlatGraph<never> : never
