import { Inject, Provide, Scope } from "."
import { Container, InjectError, } from './Container'
import { AbstractClass, Class, PrivateConstruct, asMixin } from "./_internal"

/**
 * A class constructor with a `binding` that determines how to resolve it as a `DependencyKey<T>`.
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
export type ClassWithBinding<T, D extends Dependency> = Class<T> & {
    /** A `Binding` used to resolve this class constructor as a `DependencyKey<T>`. */
    [Inject.scope]?: Scope
    readonly inject: Inject.Binding<T, D>
}

/** A class constructor that can be used as a `DependencyKey<T>`. */
export type InjectableClass<T, D extends Dependency = any> = ClassWithBinding<T, D>

interface OnlyObject<out T = unknown> {
    readonly [k: keyof any]: T
}

interface OnlyObjectKey extends OnlyObject<AnyKey> { }

/** An object representing a structured set of type keys to produce type `T`. */
export type ObjectKey<T, D extends Dependency> =
    T extends OnlyObject ? OnlyObjectKey & { readonly [K in keyof T]: DependencyKey<T[K], D> } :
    never

/** An array representing a structured set of type keys to produce type `T`. */
export type ArrayKey<T, D extends Dependency> =
    T extends [infer A, ...infer B] ? [DependencyKey<A, D>, ...ArrayKey<B, D>] :
    T extends [] ? [] :
    T extends readonly any[] ? AnyKey[] & { readonly [K in Extract<keyof T, number>]: DependencyKey<T[K], D> } :
    never

/** A structured set of type keys to produce type `T`. */
export type StructuredKey<T, D extends Dependency = any> = ObjectKey<T, D> | ArrayKey<T, D>
/** A dependency key that, when requested, resolves to a value of type `T`. */
export type DependencyKey<T, D extends Dependency = any> = AnyKey & (
    | BaseTypeKey<T>
    | HasBaseKeySymbol<T, D>
    | StructuredKey<T, D>
    | (T extends (null | undefined | void) ? T : never)
)

export type AnyKey =
    | OnlyObject<AnyKey>
    | AnyKey[]
    | HasAbstractKeySymbol<any>
    | PrivateConstruct
    | null | undefined | void

interface HasAbstractKeySymbol<out T> {
    readonly [_abstractKeySymbol]: readonly [T] | null
}

interface HasTypeKeySymbol<out T> extends HasAbstractKeySymbol<T> {
    readonly [_typeKeySymbol]: readonly [T] | null
}

const _baseKeySymbol = Symbol()

export interface HasBaseKeySymbol<out T, D = any> extends HasAbstractKeySymbol<T> {
    readonly [_baseKeySymbol]: readonly [T, D] | null
}

/** The actual type that a dependency key of type `D` resolves to. */
export type Actual<K> =
    K extends DependencyKey<infer _T> ? _T & (
        K extends HasAbstractKeySymbol<infer T> ? T :
        K extends InjectableClass<infer T, any> ? T :
        K extends StructuredKey<infer T> ? T :
        unknown
    ) :
    K extends any[] ? ArrayActual<K> :
    K extends OnlyObject ? ObjectActual<K> :
    K extends undefined ? undefined :
    K extends null ? null :
    K extends void ? void :
    never

type ArrayActual<K> =
    K extends [] ? [] :
    K extends [infer A, ...infer B] ? [Actual<A>, ...ArrayActual<B>] :
    K extends (infer A)[] ? Actual<A>[] :
    never

type ObjectActual<K> = { [X in keyof K]: Actual<K[X]> }

type ArrayContainerActual<K extends any[], P> =
    K extends [] ? [] :
    K extends [infer A, ...infer B] ? [ContainerActual<A, P>, ...ArrayContainerActual<B, P>] :
    K extends (infer A)[] ? ContainerActual<A, P>[] :
    never

type ObjectContainerActual<K extends OnlyObject, P> = { [X in keyof K]: ContainerActual<K[X], P> }

export type ContainerActual<K, P> =
    & Actual<K>
    & (
        Actual<K> extends Container<infer S2> ? Container<Provide<P, S2>> :
        Actual<K> extends (...args: infer A) => Container<infer S2> ? (...args: A) => Container<Provide<P, S2>> :
        K extends HasAbstractKeySymbol<any> ? unknown :
        K extends any[] ? ArrayContainerActual<K, P> :
        K extends OnlyObject ? ObjectContainerActual<K, P> :
        unknown
    )

export type DepsOf<K> =
    K extends Scope ? K :
    K extends BaseTypeKey<any> ? K :
    K extends DependencyKey<infer _T, never> ? never :
    K extends DependencyKey<infer _T, infer D> ? D :
    K extends (infer T)[] ? DepsOf<T> :
    K extends OnlyObject ? DepsOf<K[keyof K]> :
    Dependency


namespace OperatorSymbols {
    export const Lazy = Symbol()
    export const Provider = Symbol()
    export const Optional = Symbol()
}

// Use this to prevent library consumers from generating types equivalent to `AbstractKey`.
const _abstractKeySymbol: unique symbol = Symbol()

/** Implementation detail--extend `BaseKey` instead. */
export abstract class AbstractKey<out T> implements HasAbstractKeySymbol<T> {
    readonly [_abstractKeySymbol]: readonly [T] | null = null
    private [OperatorSymbols.Lazy]?: Inject.GetLazy<any>
    /** Requests a function returning a lazily-computed value of `T`. */
    Lazy = function <Th extends AbstractKey<any> & AnyKey>(this: Th): Inject.GetLazy<Th> {
        return this[OperatorSymbols.Lazy] ??= Inject.lazy<Th>(this)
    }

    private [OperatorSymbols.Provider]?: Inject.GetProvider<any>
    /** Requests a function returning a value of `T`. */
    Provider = function <Th extends AbstractKey<T> & AnyKey>(this: Th): Inject.GetProvider<Th> {
        return this[OperatorSymbols.Provider] ??= Inject.provider(this)
    }

    private [OperatorSymbols.Optional]?: Inject.Optional<any>
    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    Optional = function <Th extends AbstractKey<T> & AnyKey>(this: Th): Inject.Optional<Th> {
        return this[OperatorSymbols.Optional] ??= Inject.optional(this)
    }

    Build = function <
        Th extends DependencyKey<(...args: Args) => Out>,
        Args extends any[],
        Out = Th extends AbstractKey<(...args: Args) => infer O> ? O : never,
    >(this: Th, ...args: Args): Inject.Build<Th, Args, Out> {
        return Inject.build(this, ...args)
    }
}

type ClassLike<T> = Class<T> | ((...args: any[]) => T)

export type Dependency = Scope | HasTypeKeySymbol<any>

// Use this to prevent library consumers from generating types equivalent to `TypeKey`.
const _typeKeySymbol: unique symbol = Symbol()

export interface BaseTypeKey<out T, Def = any> extends HasTypeKeySymbol<T> {
    readonly keyTag: symbol | typeof MISSING_KEY_TAG
    readonly scope?: Scope
    readonly name: string
    readonly fullName: string
    readonly of?: ClassLike<T>
    readonly inject: null
    readonly defaultInit?: Def
}

export interface TypeKey<out T = any, Def extends BaseKey<T, any, any> = any> extends BaseTypeKey<T, Def>, AbstractKey<T> {
    readonly keyTag: symbol
}

const MISSING_KEY_TAG = 'add `static readonly keyTag = Symbol()` to TypeKey implementation' as const

interface TypeKeyClass<out T, Def> extends
    AbstractKey<T>,
    AbstractClass<any, [never]>,
    BaseTypeKey<T, Def> { }

export function TypeKey<T>(): TypeKeyClass<T, never>
export function TypeKey<T>(options: TypeKey.Options<T, never>): TypeKeyClass<T, never>

export function TypeKey<
    Def extends HasBaseKeySymbol<T>,
    T = Def extends HasBaseKeySymbol<infer _T> ? _T : never,
>(options: TypeKey.Options<T, Def>): TypeKeyClass<T, Def>

export function TypeKey<
    Def extends HasBaseKeySymbol<T>,
    T,
>({ default: defaultInit, of, name = of?.name }: TypeKey.Options<T, Def> = {} as any): TypeKeyClass<T, Def> {
    return asMixin(class _TypeKey {
        static readonly [_typeKeySymbol]: TypeKeyClass<T, Def>[typeof _typeKeySymbol] = null
        static readonly keyTag: symbol | typeof MISSING_KEY_TAG = MISSING_KEY_TAG
        static readonly of = of
        static readonly fullName = this.name + (name ? `(${name})` : '')
        static readonly defaultInit = defaultInit
        static readonly inject = null
        static toString() { return this.fullName }
    }, AbstractKey<T>)
}

export namespace TypeKey {
    export interface Options<T, Def extends HasBaseKeySymbol<T>> {
        of?: ClassLike<T>
        name?: string
        default?: Def
    }

    export interface DefaultWithDeps<T, K extends AnyKey> {
        deps: K
        init(deps: Actual<K>): T
    }
    export interface DefaultWithInstance<T> { instance: T }
    export interface DefaultFunction<T> { (): T }

    export function isTypeKey(target: any): target is BaseTypeKey<any> {
        return _typeKeySymbol in target
    }
}

const _noDefault: unique symbol = Symbol()


/** Convenience for a TypeKey that specifically resolves to a a function that, given `Args`, returns `T`. */

export interface FactoryKey<Args extends any[], T> extends TypeKey<(...args: Args) => T> { }

// export function FactoryKey<Args extends any[], T, Src, K extends DependencyKey<Src>>(deps: K, f: (deps: Src, ...args: Args) => T) {
//     return class extends TypeKey({ default: { deps, init: (deps) => (...args: Args) => f(deps, ...args) } }) {
//         static readonly keyTag: symbol = Symbol()
//     }
// }

export function FactoryKey<T, Args extends any[] = []>(): TypeKeyClass<(...args: Args) => T, never>

export function FactoryKey<
    T,
    Args extends any[],
    K extends AnyKey,
>(deps: K, fac: (deps: Actual<K>, ...args: Args) => T): TypeKeyClass<(...args: Args) => T, BaseKey<(...args: Args) => T, K>>

export function FactoryKey<
    T,
    Args extends any[],
    K extends AnyKey,
>(
    ...args:
        | []
        | [deps: K, fac: (deps: Actual<K>, ...args: Args) => T]
): TypeKeyClass<(...args: Args) => T, BaseKey<(...args: Args) => T, K>> {
    if (args.length == 2) {
        let [deps, fac] = args
        return TypeKey<BaseKey<(...args: Args) => T, K>>({ default: Inject.map(deps, d => (...args: Args) => fac(d, ...args)) })
    }
    return TypeKey()
}

/** A key that, upon request,transforms a provider for `K` into a provider of `T`. */
export abstract class BaseKey<
    out T = any,
    out K extends AnyKey = any,
    D = DepsOf<K>,
> extends AbstractKey<T> implements HasBaseKeySymbol<T, D> {
    readonly [_baseKeySymbol]: readonly [T, D] | null = null
    /** This key determines the dependencies that will be passed to `this.init()`. */
    readonly inner: K

    constructor(inner: K) {
        super()
        this.inner = inner
    }

    /** Given a provide of `D` or an error, return a provider of `T` or an error. */
    abstract init(deps: (() => Actual<K>) | InjectError): (() => T) | InjectError
}
