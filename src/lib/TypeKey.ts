import { Inject } from './Inject'
import { BaseKey, HasBaseKeySymbol } from './BaseKey'
import { AbstractKey, HasAbstractKeySymbol } from './AbstractKey'
import { ScopeList } from './Scope'
import { DependencyKey, Actual } from './DependencyKey'
import { AbstractClass, Class, asMixin } from './_internal'
import { Dependency } from './Dependency'
import { ClassWithoutDefault, ClassWithDefault } from './InjectableClass'

export interface HasTypeKeySymbol<out T> extends HasAbstractKeySymbol<T> {
    readonly [_typeKeySymbol]: readonly [T] | null
}

type ClassLike<T> = Class<T> | ((...args: any[]) => T)

// Use this to prevent library consumers from generating types equivalent to `TypeKey`.
const _typeKeySymbol: unique symbol = Symbol()

export interface BaseTypeKey<out T = any, Def extends HasBaseKeySymbol<T> = any> extends HasTypeKeySymbol<T> {
    readonly keyTag: symbol | typeof MISSING_KEY_TAG
    readonly scope?: ScopeList
    readonly name: string
    readonly fullName: string
    readonly of?: ClassLike<T>
    readonly inject: null
    readonly defaultInit?: Def
}

export interface TypeKey<out T = any, Def extends BaseKey.Any<T> = any> extends BaseTypeKey<T, Def>, AbstractKey<T> {
    readonly keyTag: symbol
}

export interface BaseTypeKeyWithoutDefault extends BaseTypeKey<any, never> { }
export interface BaseTypeKeyWithDefault<
    out T,
    D extends Dependency,
    Sync extends Dependency,
> extends BaseTypeKey<T, HasBaseKeySymbol<T, D, Sync>> { }

export type KeyWithoutDefault = BaseTypeKeyWithoutDefault | ClassWithoutDefault
export type KeyWithDefault<T, D extends Dependency, Sync extends Dependency> =
    | BaseTypeKeyWithDefault<T, D, Sync>
    | ClassWithDefault<T, D, Sync>

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

    export interface DefaultWithDeps<T, K extends DependencyKey> {
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
    K extends DependencyKey,
>(deps: K, fac: (deps: Actual<K>, ...args: Args) => T): TypeKeyClass<(...args: Args) => T, BaseKey<(...args: Args) => T, K>>

export function FactoryKey<
    T,
    Args extends any[],
    K extends DependencyKey,
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
