import { Inject } from './Inject'
import { ComputedKey } from './ComputedKey'
import { AbstractKey } from './AbstractKey'
import { Scope, ScopeList } from './Scope'
import { DependencyKey, Target } from './DependencyKey'
import { AbstractClass, Class, asMixin } from './_internal'
import { Dependency } from './Dependency'
import { ClassWithoutDefault, ClassWithDefault } from './InjectableClass'

import TypeKeyClass = TypeKey.TypeKeyClass

/** @ignore */
export interface HasTypeKeySymbol<out T> {

    /** @ignore */
    readonly [_typeKeySymbol]: readonly [T] | null
}

type ClassLike<T> = Class<T> | ((...args: any[]) => T)

// Use this to prevent library consumers from generating types equivalent to `TypeKey`.
const _typeKeySymbol: unique symbol = Symbol()

export interface BaseTypeKey<out T = any, Def extends ComputedKey<T> = any> extends HasTypeKeySymbol<T> {
    /** @ignore */
    readonly keyTag?: symbol
    /** The {@link Scope:type | Scope} or {@link ScopeList} to which this `TypeKey` should be bound. */
    readonly scope?: ScopeList
    /** The name that will be displayed in exception messages. */
    readonly fullName: string
    /** A class or function returning the target value of this `TypeKey`. */
    readonly of?: ClassLike<T>
    /** @ignore prevent a TypeKey from being an InjectableClass */
    readonly inject: null
    /** @ignore */
    readonly defaultInit?: Def
}

/**
 * A key for a custom dependency not bound to a specific class.
 *
 * @see The {@link TypeKey | TypeKey()} function for implementing TypeKey.
 * A TypeKey implementation is a class object that extends {@link TypeKey}().
 *
 * @example
 *
 * ```ts
 * // These TypeKeys both resolve to `string` but are separate from each other:
 * class NameKey extends TypeKey<string>() { private _: any }
 * class IdKey extends TypeKey<string>() { private _: any }
 *
 * class User { constructor(name: string, id: string) {} }
 *
 * const ct = Container.create()
 *   .provideInstance(NameKey, 'Alice')
 *   .provideInstance(IdKey, '123')
 *   .provide(User, {
 *     name: NameKey,
 *     id: IdKey,
 *   }, ({ name, id }) => new User(name, id))
 *
 * const user = ct.request(User)
 * ```
 *
 * @group Dependencies
 * @category TypeKey
 */
export interface TypeKey<out T = any, Def extends ComputedKey<T> = any> extends BaseTypeKey<T, Def>, AbstractKey {
    /** @ignore */
    readonly keyTag?: symbol
}

/** @ignore */
export interface BaseTypeKeyWithoutDefault extends BaseTypeKey<any, never> { }

/** @ignore */
export interface BaseTypeKeyWithDefault<
    out T,
    D extends Dependency,
    Sync extends Dependency,
> extends BaseTypeKey<T, ComputedKey<T, any, D, Sync>> { }

/** @ignore */
export type KeyWithoutDefault = BaseTypeKeyWithoutDefault | ClassWithoutDefault
/** @ignore */
export type KeyWithDefault<T, D extends Dependency, Sync extends Dependency> =
    | BaseTypeKeyWithDefault<T, D, Sync>
    | ClassWithDefault<T, D, Sync>

/**
 * Generates a base class for a class object that extends {@link TypeKey:type}\<T>.
 * Classes that extend the returned base class should have a
 * `private _: any` property (or any other private member) to ensure the key has its own unique type.
 *
 * @returns A base class that can be extended to produce a `TypeKey<T>` class object.
 *
 * @example
 *
 * ```ts
 * class NameKey extends TypeKey<string>() { private _: any }
 * ```
 *
 * @example with {@link Scope:type}:
 *
 * ```ts
 * class NameKey extends TypeKey<string>() {
 *   private _: any
 *   static scope = Singleton
 * }
 * ```
 *
 * @example with default instance:
 *
 * ```ts
 * class NameKey extends TypeKey({ default: Inject.value('Alice') }) {
 *   private _: any
 * }
 * ```
 *
 * @example with custom default:
 *
 * ```ts
 * class NameKey extends TypeKey({
 *   default: Inject.map(DataSource, ds => ds.getName()),
 * }) {
 *   private _: any
 * }
 * ```
 *
 * @example using the `TypeKey`:
 *
 * ### Provide
 * ```ts
 * const ct = Container.create().provide(NameKey, () => 'Alice')
 * ```
 * ### Request
 * ```ts
 * const name: string = ct.request(NameKey)
 * ```
 *
 * ### Use as dependency
 *
 * ```ts
 * const UserModule = Module(ct => ct
 *   .provide(User, { name: NameKey }, ({ name }) => new User(name))
 * )
 * ```
 *
 * ### Use key operators
 *
 * ```ts
 * const UserModule = Module(ct => ct
 *   .provide(User, { name: NameKey.Lazy() }, ({ name }) => new User(name()))
 * )
 * ```
 *
 * @group Dependencies
 * @category TypeKey
 */
export function TypeKey<T>(): TypeKeyClass<T, never>

export function TypeKey<T>(options: TypeKey.Options<T, never>): TypeKeyClass<T, never>

export function TypeKey<
    Def extends ComputedKey<T>,
    T = Def extends ComputedKey<infer _T> ? _T : never,
>(options: TypeKey.Options<T, Def>): TypeKeyClass<T, Def>

export function TypeKey<
    Def extends ComputedKey<T>,
    T,
>({ default: defaultInit, of, name = of?.name }: TypeKey.Options<T, Def> = {} as any): TypeKeyClass<T, Def> {
    return asMixin(class _TypeKey {
        static readonly [_typeKeySymbol]: TypeKeyClass<T, Def>[typeof _typeKeySymbol] = null
        /** @ignore */
        static readonly keyTag?: symbol
        static readonly of = of
        static get fullName() { return this.name + (name ? `(${name})` : '') }
        static readonly defaultInit = defaultInit
        static readonly inject = null
        static toString() { return this.fullName }
    }, AbstractKey)
}

/**
 * @group Dependencies
 * @category TypeKey
 */
export namespace TypeKey {
    export interface Options<T, Def extends ComputedKey<T>> {
        /**
         * A class or function. The name will be used to name this `TypeKey`
         * and the return type can be used to infer the target type.
         */
        of?: ClassLike<T>
        /** A name for this TypeKey, largely for use in error messages. */
        name?: string
        /** A {@link ComputedKey} providing a default value for this TypeKey if none is provided to the {@link Container}. */
        default?: Def
    }

    /** @ignore */
    export function isTypeKey(target: any): target is BaseTypeKey<any> {
        return _typeKeySymbol in target
    }

    /** Class returned by {@link TypeKey}. Extend this to implement {@link TypeKey:type}. */
    export interface TypeKeyClass<out T, Def extends ComputedKey<T>> extends
        AbstractKey,
        AbstractClass<any, never>,
        BaseTypeKey<T, Def> { }
}

/**
 * Convenience for a {@link TypeKey:type | TypeKey} that resolves a function of the form
 * `(...args: Args) => T`.
 *
 * @group Dependencies
 * @category TypeKey
 */
export interface FactoryKey<Args extends any[], T> extends TypeKey<(...args: Args) => T> { }
/**
 * A specialized form of {@link TypeKey} that resolves a function of the form
 * `(...args: Args) => T`.
 *
 * @group Dependencies
 * @category TypeKey
 */
export function FactoryKey<T, Args extends any[] = []>(): TypeKeyClass<(...args: Args) => T, never>

/**
 * @param fac - A default value for the factory function
 */
export function FactoryKey<T, Args extends any[]>(
    fac: (...args: Args) => T,
): TypeKeyClass<(...args: Args) => T, ComputedKey.WithDepsOf<(...args: Args) => T, void>>

/**
 * @param deps - A {@link DependencyKey} specifying dependencies of the factory function
 * @param fac - A function that accepts the specified dependency followed by {@link Args}
 */
export function FactoryKey<
    T,
    Args extends any[],
    K extends DependencyKey,
>(deps: K, fac: (deps: Target<K>, ...args: Args) => T): TypeKeyClass<(...args: Args) => T, ComputedKey.WithDepsOf<(...args: Args) => T, K>>

export function FactoryKey<
    T,
    Args extends any[],
    K extends DependencyKey,
>(
    ...args:
        | []
        | [fac: (...args: Args) => T]
        | [deps: K, fac: (deps: Target<K>, ...args: Args) => T]
): TypeKeyClass<(...args: Args) => T, ComputedKey.WithDepsOf<(...args: Args) => T, K>> {
    if (args.length == 2) {
        let [deps, fac] = args
        return TypeKey({ default: Inject.map(deps, d => (...args: Args) => fac(d, ...args)) })
    }
    if (args.length == 1) {
        return TypeKey({ default: Inject.value(args[0]) })
    }
    return TypeKey()
}
