import { Inject, Provide, ProvideGraph, Scope } from "."
import { BaseKey } from "./BaseKey"
import { Container, } from './Container'
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
export interface InjectableClass<T> extends Class<T> {
    readonly scope?: Scope
    readonly inject?: HasBaseKeySymbol<T> | (() => HasBaseKeySymbol<T>)
}

export interface ClassWithoutDefault<T> extends InjectableClass<T> {
    readonly inject?: never
}
export interface ClassWithDefault<T, D extends Dependency, Sync extends Dependency> extends InjectableClass<T> {
    readonly inject: HasBaseKeySymbol<T, D, Sync> | (() => HasBaseKeySymbol<T, D, Sync>)
}

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
    T extends readonly [infer A, ...infer B] ? [DependencyKey<A, D>, ...ArrayKey<B, D>] :
    T extends [] ? [] :
    T extends readonly any[] ? AnyKey[] & { readonly [K in Extract<keyof T, number>]: DependencyKey<T[K], D> } :
    never

/** A structured set of type keys to produce type `T`. */
export type StructuredKey<T, D extends Dependency = any> = ObjectKey<T, D> | ArrayKey<T, D>
export type SimpleKey<T, D extends Dependency = any> =
    | BaseTypeKey<T>
    | HasBaseKeySymbol<T, D>

/** A dependency key that, when requested, resolves to a value of type `T`. */
export type DependencyKey<T, D extends Dependency = any> = AnyKey & (
    | SimpleKey<T, D>
    | InjectableClass<T>
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

export const _baseKeySymbol = Symbol()

export interface HasBaseKeySymbol<out T, D = any, Sync = any> extends HasAbstractKeySymbol<T> {
    readonly [_baseKeySymbol]: readonly [T, D, Sync] | null
}

/** The actual type that a dependency key of type `D` resolves to. */
export type Actual<K extends AnyKey> =
    K extends DependencyKey<infer _T> ? (
        K extends HasAbstractKeySymbol<infer T> ? T :
        K extends InjectableClass<infer T> ? T :
        K extends StructuredKey<infer T> ? T :
        _T
    ) :
    K extends readonly any[] ? ArrayActual<K> :
    K extends OnlyObject<AnyKey> ? ObjectActual<K> :
    K extends undefined ? undefined :
    K extends null ? null :
    K extends void ? void :
    never

type ArrayActual<K extends readonly AnyKey[]> =
    K extends [] ? [] :
    K extends readonly [infer A extends AnyKey, ...infer B extends AnyKey[]] ? [Actual<A>, ...ArrayActual<B>] :
    K extends readonly (infer A extends AnyKey)[] ? Actual<A>[] :
    never

type ObjectActual<K extends OnlyObject<AnyKey>> = { [X in keyof K]: Actual<K[X]> }

type Leaves<T> =
    T extends (OnlyObject<infer U> | (infer U)[]) ? Leaves<U> :
    T extends Promise<infer U> ? Leaves<U> :
    T extends (...args: any[]) => infer U ? Leaves<U> :
    T

type ContainerTransform<T, P extends ProvideGraph> =
    [P] extends [never] ? T :
    Container<any> extends Leaves<T> ? (
        T extends [] ? [] :
        T extends readonly [infer A, ...infer B] ? [ContainerTransform<A, P>, ...ContainerTransform<B, P>] :
        T extends readonly (infer U)[] ? ContainerTransform<U, P>[] :
        T extends Container<infer P1> ? Container<Provide<P, P1>> :
        T extends Promise<infer U> ? Promise<ContainerTransform<U, P>> :
        T extends (...args: infer Args) => infer U ? (...args: Args) => ContainerTransform<U, P> :
        T extends OnlyObject ? { [K in keyof T]: ContainerTransform<T[K], P> } :
        T
    ) : T

export type ContainerActual<K extends AnyKey, P extends ProvideGraph> = ContainerTransform<Actual<K>, P>

abstract class UnableToResolve<in out K> {
    private k!: K
}

export type DepsOf<K> =
    AnyKey extends K ? (Dependency & UnableToResolve<K>) :
    K extends Scope | BaseTypeKey<any> | InjectableClass<any> ? K :
    K extends DependencyKey<infer _T, never> ? never :
    K extends DependencyKey<infer _T, infer D> ? D :
    K extends readonly (infer T)[] ? DepsOf<T> :
    K extends OnlyObject ? DepsOf<K[keyof K]> :
    Dependency & UnableToResolve<K>

// Use this to prevent library consumers from generating types equivalent to `AbstractKey`.
const _abstractKeySymbol: unique symbol = Symbol()

/** Implementation detail--extend `BaseKey` instead. */
export abstract class AbstractKey<out T> implements HasAbstractKeySymbol<T> {
    readonly [_abstractKeySymbol]: readonly [T] | null = null
    /** Requests a function returning a lazily-computed value of `T`. */
    Lazy = function <Th extends AnyKey>(this: Th): Inject.GetLazy<Th> {
        return Inject.lazy<Th>(this)
    }

    /** Requests a function returning a value of `T`. */
    Provider = function <Th extends AnyKey>(this: Th): Inject.GetProvider<Th> {
        return Inject.provider(this)
    }

    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    Optional = function <Th extends AnyKey>(this: Th): Inject.Optional<Th> {
        return Inject.optional(this)
    }

    Build = function <
        Th extends SimpleKey<(...args: Args) => Out>,
        Args extends any[],
        Out = Th extends SimpleKey<(...args: Args) => infer O> ? O : never,
    >(this: Th, ...args: Args): Inject.Build<Th, Args, Out> {
        return Inject.build(this, ...args)
    }

    Map = function <
        Th extends AnyKey,
        U,
        P extends ProvideGraph = never,
    >(this: Th, transform: (x: ContainerActual<Th, P>) => U): Inject.Map<U, Th, P> {
        return Inject.map(this, transform)
    }
}

type ClassLike<T> = Class<T> | ((...args: any[]) => T)

const _isSyncSymbol = Symbol()

export interface IsSync<in out K extends HasTypeKeySymbol<any> | PrivateConstruct> {
    [_isSyncSymbol]: K
}

export type RequireSync<D extends Dependency> = D extends HasTypeKeySymbol<any> | PrivateConstruct ? IsSync<D> : never

export type Dependency = Scope | HasTypeKeySymbol<any> | IsSync<any> | PrivateConstruct

// Use this to prevent library consumers from generating types equivalent to `TypeKey`.
const _typeKeySymbol: unique symbol = Symbol()

export interface BaseTypeKey<out T, Def extends HasBaseKeySymbol<T> = any> extends HasTypeKeySymbol<T> {
    readonly keyTag: symbol | typeof MISSING_KEY_TAG
    readonly scope?: Scope
    readonly name: string
    readonly fullName: string
    readonly of?: ClassLike<T>
    readonly inject: null
    readonly defaultInit?: Def
}

export interface TypeKey<out T = any, Def extends BaseKey.Any<T> = any> extends BaseTypeKey<T, Def>, AbstractKey<T> {
    readonly keyTag: symbol
}

export interface BaseTypeKeyWithDefault<out T, D, Sync> extends BaseTypeKey<T, HasBaseKeySymbol<T, D, Sync>> { }

const MISSING_KEY_TAG = 'add `static readonly keyTag = Symbol()` to TypeKey implementation' as const

interface TypeKeyClass<out T, Def extends HasBaseKeySymbol<T>> extends
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

/** Convenience for a TypeKey that specifically resolves to a a function that, given `Args`, returns `T`. */

export interface FactoryKey<Args extends any[], T> extends TypeKey<(...args: Args) => T> { }

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
