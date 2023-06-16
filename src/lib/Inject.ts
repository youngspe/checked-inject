import { DependencyKey } from "./TypeKey"

export namespace Inject {
    export const dependencies: unique symbol = Symbol()
    export const scope: unique symbol = Symbol()
    export const binding: unique symbol = Symbol()
    const _bindingKey = Symbol()
    abstract class _Binding<T> {
        protected abstract [_bindingKey]: null
        abstract readonly dependencies: any
        abstract resolve(deps: any): T
    }

    class BindConstructor<T, D extends any[]> extends _Binding<T> {
        protected override[_bindingKey] = null
        override readonly dependencies: DependencyKey<D>
        private _constructor: new (...args: D) => T

        constructor(constructor: new (...args: D) => T, dependencies: DependencyKey<D>) {
            super()
            this._constructor = constructor
            this.dependencies = dependencies
        }

        override resolve(deps: any): T {
            return new this._constructor(...deps)
        }
    }

    export function bindConstructor<T, D extends any[], DKeys extends DependencyKey<D> & any[]>(
        constructor: new (...args: D) => T,
        ...deps: DKeys): _Binding<T> {
        return new BindConstructor(constructor, deps)
    }

    class BindFrom<T> extends _Binding<T> {
        protected override[_bindingKey] = null
        override readonly dependencies: DependencyKey<T>

        constructor(source: DependencyKey<T>) {
            super()
            this.dependencies = source
        }

        override resolve(deps: any): T {
            return deps
        }
    }

    export function bindFrom<T>(source: DependencyKey<T>): _Binding<T> {
        return new BindFrom(source)
    }

    class BindWith<T, D> extends _Binding<T> {
        protected override[_bindingKey] = null
        override readonly dependencies: DependencyKey<D>
        private _init: (deps: D) => T

        constructor(deps: DependencyKey<D>, init: (deps: D) => T) {
            super()
            this.dependencies = deps
            this._init = init
        }

        override resolve(deps: any): T {
            return this._init(deps)
        }
    }

    export function bindWith<T, D>(deps: DependencyKey<D>, init: (deps: D) => T): _Binding<T> {
        return new BindWith(deps, init)
    }

    export type Binding<T> = _Binding<T> | (() => _Binding<T>)
}
