import { DepsOf, InjectError } from "."
import { Scope } from "./Scope"
import { Actual, BaseKey, DependencyKey } from "./TypeKey"
import { Class } from "./_internal"

export namespace Inject {
    export const dependencies: unique symbol = Symbol()
    export const scope: unique symbol = Symbol()
    export const binding: unique symbol = Symbol()
    const _bindingKey = Symbol()
    // abstract class _Binding<T, K, D extends Actual<K>> {
    //     protected abstract [_bindingKey]: null
    //     abstract readonly dependencies: K
    //     abstract resolve(deps: D): T
    // }

    const _deps = Symbol()

    interface _Binding<T, D> {
        readonly key: BaseKey<T, any>
        [_deps]?: D
    }


    export function map<T, K extends DependencyKey>(src: K, f: (deps: Actual<K>) => T): _Binding<T, DepsOf<K>> {
        return {
            key: new class Map extends BaseKey<T, K> {
                init(deps: InjectError | (() => Actual<K, never>)): InjectError | (() => T) {
                    if (deps instanceof InjectError) return deps
                    return () => f(deps())
                }
            }(src)
        }
    }

    class From<K extends DependencyKey> extends BaseKey<Actual<K>, K> {
        init(deps: InjectError | (() => Actual<K>)): InjectError | (() => Actual<K>) {
            return deps
        }
    }

    export function from<K extends DependencyKey>(src: K): _Binding<Actual<K>, DepsOf<K>> {
        return {
            key: new From(src)
        }
    }

    // export function from<K>(src: K) {
    //     return map(src, x => x)
    // }

    export type Binding<T, D> = _Binding<T, D> | (() => _Binding<T, D>)
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
export type ClassWithBinding<T, D> = Class<T> & {
    [Inject.scope]?: Scope
    /** A `Binding` used to resolve this class constructor as a `DependencyKey<T>`. */
    [Inject.binding]: Inject.Binding<T, D>
}

/** A class constructor that can be used as a `DependencyKey<T>`. */
export type InjectableClass<T, D> = DefaultConstructor<T> | ClassWithBinding<T, D>
