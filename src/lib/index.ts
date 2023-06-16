export * from './Container'
export * from './TypeKey'
export * from './Inject'
import { Inject } from './Inject'

const _scopeKey: unique symbol = Symbol()

/** Represents a scope for which certain dependencies are provided. */
export class Scope {
    readonly name?: string
    private readonly [_scopeKey] = null
    constructor(name?: string) {
        this.name = name
    }
}

/** The default scope for top-level containers. */
export const Singleton = new Scope('Singleton')

type AbstractClass<T> = abstract new (...args: any[]) => T

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
export interface ClassWithBinding<T> extends AbstractClass<T> {
    [Inject.scope]?: Scope
    /** A `Binding` used to resolve this class constructor as a `DependencyKey<T>`. */
    [Inject.binding]: Inject.Binding<T>
}

/** A class constructor that can be used as a `DependencyKey<T>`. */
export type InjectableClass<T> = DefaultConstructor<T> | ClassWithBinding<T>
