import { Scope } from "./Scope"
import { DependencyKey } from "./TypeKey"
import { Class } from "./_internal"

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

/** A class constructor that takes no arguments and can used as a `DependencyKey<T>`. */
export interface DefaultConstructor<T> {
    new(): T
    [Inject.scope]?: Scope
}

/**
 * A class constructor with a `binding` that determines how to resolve it as a `DependencyKey<T>`.
 *
 * @example
 *  ```
 *  class MyClass1 {
 *      constructor(x: number, y: string) {}
 *      static [Inject.binding] = Inject.bindConstructor(this, NumberKey, StringKey)
 *  }
 *
 *  class MyClass2 {
 *      static [Inject.binding]: Inject.Binding<MyClass2> = () => Inject.bindFrom(MyClass3)
 *  }
 *
 *  class MyClass3 extends MyClass2 {
 *      constructor(x: string, y: string) {
 *      }
 *      static [Inject.binding] = Inject.bindWith({
 *          x: MumberKey,
 *          y: StringKey,
 *      }, ({ x, y }) => new MyClass3(x.toString(), y))
 *  }
 *  ```
 */
export type ClassWithBinding<T> = Class<T> & {
    [Inject.scope]?: Scope
    /** A `Binding` used to resolve this class constructor as a `DependencyKey<T>`. */
    [Inject.binding]: Inject.Binding<T>
}

/** A class constructor that can be used as a `DependencyKey<T>`. */
export type InjectableClass<T> = DefaultConstructor<T> | ClassWithBinding<T>
