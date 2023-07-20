import { HasComputedKeySymbol } from './ComputedKey'
import { Container } from './Container'
import { Scope } from './Scope'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, HasTypeKeySymbol } from './TypeKey'
import { InjectableClass } from './InjectableClass'
import { Dependency, IsSync } from './Dependency'
import { Merge } from './ProvideGraph'

interface OnlyObject<out T = unknown> {
    readonly [k: keyof any]: T
}
interface OnlyObjectKey extends OnlyObject<DependencyKey> { }

/** @ignore An object representing a structured set of type keys to produce type `T`. */
export type ObjectKey<T, D extends Dependency, Sync extends Dependency = any> = T extends OnlyObject ? OnlyObjectKey & {
    readonly [K in keyof T]: DependencyKey.Of<T[K], D, Sync>
} : never

/** @ignore An array representing a structured set of type keys to produce type `T`. */
export type ArrayKey<T, D extends Dependency, Sync extends Dependency = any> =
    T extends readonly [infer A, ...infer B] ? [DependencyKey.Of<A, D, Sync>, ...ArrayKey<B, D, Sync>] :
    T extends [] ? [] :
    T extends readonly any[] ? DependencyKey[] & {
        readonly [K in Extract<keyof T, number>]: DependencyKey.Of<T[K], D, Sync>
    } :
    never

/** @ignore A structured set of type keys to produce type `T`. */
export type StructuredKey<T, D extends Dependency = any, Sync extends Dependency = any> =
    | ObjectKey<T, D, Sync>
    | ArrayKey<T, D, Sync>
/** @ignore */
export type SimpleKey<T, D extends Dependency = any, Sync extends Dependency = any> =
    | BaseTypeKey<T>
    | HasComputedKeySymbol<T, D, Sync>

/** The actual type that a dependency key of type `D` resolves to. */
type Actual<K extends DependencyKey> =
    K extends DependencyKey.Of<infer _T> ? (
        K extends HasComputedKeySymbol<infer T> | HasTypeKeySymbol<infer T> ? T :
        K extends InjectableClass<infer T> ? T :
        K extends StructuredKey<infer T> ? T :
        _T
    ) :
    K extends readonly any[] ? ArrayActual<K> :
    K extends OnlyObject<DependencyKey> ? ObjectActual<K> :
    K extends undefined ? undefined : K extends null ? null :
    K extends void ? void :
    never

type ArrayActual<K extends readonly DependencyKey[]> =
    K extends [] ? [] :
    K extends readonly [
        infer A extends DependencyKey,
        ...infer B extends DependencyKey[]
    ] ? [Actual<A>, ...ArrayActual<B>] :
    K extends readonly (infer A extends DependencyKey)[] ? Actual<A>[] :
    never

type ObjectActual<K extends OnlyObject<DependencyKey>> = {
    [X in keyof K]: Actual<K[X]>
}

type Leaves<T> =
    T extends Promise<infer U> ? Leaves<U> :
    T extends (OnlyObject<infer U> | (infer U)[]) ? Leaves<U> :
    T extends (...args: any[]) => infer U ? Leaves<U> :
    T

type ContainerTransform<T, P extends Container.Graph> =
    [P] extends [never] ? T : Container<any> extends Leaves<T> ? (
        T extends [] ? [] :
        T extends readonly [infer A, ...infer B] ? [
            ContainerTransform<A, P>,
            ...ContainerTransform<B, P>
        ] :
        T extends readonly (infer U)[] ? ContainerTransform<U, P>[] :
        T extends Container<infer P1> ? Container<Merge<P, P1>> :
        T extends Promise<infer U> ? Promise<ContainerTransform<U, P>> :
        T extends (...args: infer Args) => infer U ? (...args: Args) => ContainerTransform<U, P> :
        T extends OnlyObject ? {
            [K in keyof T]: ContainerTransform<T[K], P>
        } :
        T
    ) : T

type _Target<K extends DependencyKey, G extends Container.Graph = never> = ContainerTransform<Actual<K>, G>

/**
 * The type that {@link K} resolves to.
 *
 * @template G - The {@link Container.Graph} of the {@link Container} resolving {@link K}
 * @group Injection
 */
export type Target<K extends DependencyKey, G extends Container.Graph = never> =
    // This conditional prevents Target from expanding to ContainerTransform in docs
    [K] extends [infer _] ? _Target<K, G> : _Target<K, G>


/** @ignore */
export abstract class UnableToResolve<in out K> {
    private _k!: K
    constructor(_: never) { }
}

/** @ignore */
export abstract class UnableToResolveIsSync<in out K> {
    private _s!: K
}

/** @ignore */
export type DepsOf<K extends DependencyKey> =
    [DependencyKey] extends [K] ? UnableToResolve<K> :
    K extends Scope | BaseTypeKey<any> | InjectableClass<any> ? K :
    K extends DependencyKey.Of<infer _T, never> ? never :
    K extends DependencyKey.Of<infer _T, infer D> ? D :
    K extends readonly (infer X extends DependencyKey)[] ? DepsOf<X> :
    K extends OnlyObject<infer X extends DependencyKey> ? DepsOf<X> :
    UnableToResolve<K>

/** @ignore */
export type IsSyncDepsOf<K extends DependencyKey> = [DependencyKey] extends [K] ? UnableToResolve<K> :
    K extends Scope ? UnableToResolveIsSync<K> :
    K extends BaseTypeKey | InjectableClass ? IsSync<K> :
    K extends DependencyKey.Of<infer _T, any, never> ? never :
    K extends DependencyKey.Of<infer _T, any, infer D> ? D :
    K extends readonly (infer X extends DependencyKey)[] ? IsSyncDepsOf<X> :
    K extends OnlyObject<infer X extends DependencyKey> ? IsSyncDepsOf<X> :
    UnableToResolveIsSync<K>

/**
 * Specifies which dependencies to request from a {@link Container}.
 *
 * ## Target Types
 *
 * <table>
 * <tr><th>Kind</th><th>Key</th><th> Target Type </th></tr>
 * <tr>
 * <td>
 *
 * {@link TypeKey}\<string>
 *
 * </td>
 * <td>NameKey</td>
 * <td>string</td>
 * </tr>
 * <tr>
 * <td>
 *
 * {@link TypeKey}\<number>
 *
 * </td>
 * <td>IdKey </td>
 * <td>number</td>
 * </tr>
 * <tr>
 * <td>
 *
 * {@link InjectableClass}\<User>
 *
 * </td>
 * <td>User</td>
 * <td>User</td>
 * </tr>
 * <tr>
 * <td>
 *
 * {@link ComputedKey}
 *
 * </td>
 * <td>
 *
 * ```ts
 * Inject.async(User).Lazy()
 * ```
 * or
 * ```ts
 * Inject.lazy(Inject.async(User))
 * ```
 * or (if `User` extends `Injectable`)
 * ```ts
 * User.Async().Lazy()
 * ```
 *
 * </td>
 * <td>
 *
 * `() => Promise<User>`
 *
 * </td>
 * </tr>
 * <tr>
 * <td>Object key</td>
 * <td>
 *
 * ```ts
 * {
 *   name: NameKey,
 *   id: IdKey.Provider(),
 *   user: User,
 * }
 * ```
 *
 * </td>
 * <td>
 *
 * ```ts
 * {
 *   name: string,
 *   id: () => number,
 *   user: User,
 * }
 * ```
 *
 * </td>
 * </tr>
 * <tr>
 * <td>Array key</td>
 * <td>
 *
 * ```ts
 * [NameKey, IdKey.Provider(), User]
 * ```
 *
 * </td>
 * <td>
 *
 * ```ts
 * [string, () => number, User]
 * ```
 *
 * </td>
 * </tr>
 * <table>
 *
 * @group Dependencies
 */
export type DependencyKey =
    | OnlyObject<DependencyKey>
    | DependencyKey[]
    | HasComputedKeySymbol<any>
    | HasTypeKeySymbol<any>
    | PrivateConstruct
    | null | undefined | void

/**
 * @group Dependencies
 */
export namespace DependencyKey {
    /** A dependency key that, when requested, resolves to a value of type `T`. */
    export type Of<T, D extends Dependency = any, Sync extends Dependency = any> =
        | SimpleKey<T, D, Sync>
        | InjectableClass<T>
        | StructuredKey<T, D, Sync>
        | (T extends (null | undefined | void) ? T : never)
}
