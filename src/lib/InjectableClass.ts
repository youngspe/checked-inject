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
 *    constructor(x: number, y: string) {}
 *    static inject = Inject.construct(this, NumberKey, StringKey)
 *  }
 *
 *  class MyClass2 {
 *    static inject = Inject.construct(MyClass3, NumberKey, StringKey, BooleanKey)
 *  }
 *
 *  class MyClass3 extends MyClass2 {
 *    constructor(x: number, y: string, z: boolean) {
 *      super()
 *    }
 *  }
 *  ```
 *
 * @group Dependencies
 * @category InjectableClass
 */
export interface InjectableClass<T = any> extends Class<T> {
    /**
     * A {@link Scope} or {@link ScopeList} that, if provided, specifies the scope in which an
     * instance of this class will be resolved and stored.
     */
    readonly scope?: ScopeList
    /**
     * A {@link ComputedKey} that, if provided, specifies how to resolve this class if no provider was supplied.
     */
    readonly inject?: HasComputedKeySymbol<T> | (() => HasComputedKeySymbol<T>)
}

export interface ClassWithoutDefault extends InjectableClass<any> {
    readonly inject?: never
}

export interface ClassWithDefault<T, D extends Dependency, Sync extends Dependency> extends InjectableClass<T> {
    readonly inject: HasComputedKeySymbol<T, D, Sync> | (() => HasComputedKeySymbol<T, D, Sync>)
}

abstract class _Injectable { }

/**
 * A base class that contains static {@link DependencyKey} operators.
 *
 * @group Dependencies
 * @category InjectableClass
 */
export abstract class Injectable<T = any> extends asMixin(_Injectable, AbstractKey) {
    /** {@inheritDoc InjectableClass#scope} */
    readonly scope?: ScopeList
    /** {@inheritDoc InjectableClass#inject} */
    readonly inject?: HasComputedKeySymbol<T> | (() => HasComputedKeySymbol<T>)
}
