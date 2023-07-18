import { HasComputedKeySymbol } from './ComputedKey'
import { ScopeList } from './Scope'
import { Class, asMixin } from './_internal'
import { Dependency } from './Dependency'
import { AbstractKey } from './AbstractKey'

/**
 * A class constructor with a `binding` that determines how to resolve it as a `DependencyKey.Of<T>`.
 *
 * @example
 *  ```
 *  class MyClass1 {
 *      constructor(x: number, y: string) {}
 *      static inject = Inject.bindConstructor(this, NumberKey, StringKey)
 *  }
 *
 *  class MyClass2 {
 *      static inject: Inject.Binding<MyClass2> = () => Inject.bindFrom(MyClass3)
 *  }
 *
 *  class MyClass3 extends MyClass2 {
 *      constructor(x: string, y: string) {
 *      }
 *      static inject = Inject.bindWith({
 *          x: MumberKey,
 *          y: StringKey,
 *      }, ({ x, y }) => new MyClass3(x.toString(), y))
 *  }
 *  ```
 */
export interface InjectableClass<T = any> extends Class<T> {
    readonly scope?: ScopeList
    readonly inject?: HasComputedKeySymbol<T> | (() => HasComputedKeySymbol<T>)
}

export interface ClassWithoutDefault extends InjectableClass<any> {
    readonly inject?: never
}

export interface ClassWithDefault<T, D extends Dependency, Sync extends Dependency> extends InjectableClass<T> {
    readonly inject: HasComputedKeySymbol<T, D, Sync> | (() => HasComputedKeySymbol<T, D, Sync>)
}

export function InjectableClass<T = any>() {
    return asMixin(class Injectable {
        readonly scope?: ScopeList
        readonly inject?: HasComputedKeySymbol<T> | (() => HasComputedKeySymbol<T>)
    }, AbstractKey)
}
