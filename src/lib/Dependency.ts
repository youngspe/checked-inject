import { Scope } from './Scope'
import { NotDistinct, UnableToResolve, UnableToResolveIsSync } from './DependencyKey'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, TypeKey } from './TypeKey'
import { InjectableClass } from './InjectableClass'
import { ProvideGraph } from './ProvideGraph'

/** @ignore */
export type BaseResource = BaseTypeKey | ClassDep

export declare abstract class ClassDep<in out D extends InjectableClass = any> {
    private _: D
}

/** @ignore */
export declare abstract class IsSync<out K extends BaseResource> {
    private _: K
}

/** @ignore */
export declare abstract class NotSync<out K extends BaseResource> {
    private _: K
}

/** @ignore */
export type RequireSync<D extends Dependency> = D extends BaseResource ? IsSync<D> : never

/** @ignore */
export declare abstract class CyclicDependency<
    out K extends Dependency,
    out C extends CyclicC,
    out E extends BaseResource,
> {
    private _: [K, C, E]
}

type CyclicC<B extends BaseResource = BaseResource> = B | In<any, B>
type ExpandCyclicC<C extends Dependency> = C extends CyclicC<infer B> ? B : never

type _ApplyCyclicErrors<E extends BaseResource> = E extends any ? CycleDetected<E> : never
type ApplyCyclicErrors<D extends Dependency, E extends BaseResource> = _ApplyCyclicErrors<Extract<E, ExpandCyclicC<D>>>
export type ApplyCyclic<D extends Dependency, C extends CyclicC, E extends BaseResource> =
    | Exclude<D, C>
    | ApplyCyclicErrors<Extract<D, C>, E>

type _ToCyclic<D extends Dependency, C extends CyclicC, E extends BaseResource> =
    [D] extends [never] ? never :
    [C] extends [never] ? D :
    CyclicDependency<D, C, E>

type CyclicIgnore =
    | FailedDependency
    | Scope
    | CyclicDependency<any, any, any>
    | SubcomponentResolve<any, any>

/** @ignore */
export type ToCyclic<D extends Dependency, C extends CyclicC, E extends BaseResource> =
    | _ToCyclic<Exclude<D, CyclicIgnore>, C, E>
    | (
        D extends CyclicDependency<infer K, infer C2, infer E2> ? ToCyclic<
            ApplyCyclic<K, C, E>,
            C | C2,
            E2 | Exclude<E, ExpandCyclicC<C2>>
        > :
        D extends SubcomponentResolve<infer G, infer K> ? SubcomponentResolve<
            G,
            ToCyclic<K, C, E>
        > :
        D extends CyclicIgnore ? D :
        never
    )
/** @ignore */
export type AllowCycles<D extends Dependency> = ToCyclic<D, Extract<D, CyclicC>, never>

/** @ignore */
export type DetectCycles<D extends Dependency> = D extends CyclicC<infer B> ? ToCyclic<D, D, B> : never

/** @ignore */
export declare abstract class Missing<in out K extends Dependency> {
    private _: K
}

/** @ignore */
export declare abstract class SubcomponentResolve<G extends ProvideGraph, D extends Dependency> {
    private _: [G, D]
}

/** @ignore */
export declare abstract class In<G extends ProvideGraph, D extends Dependency> {
    private _: [G, D]
}

type InFlat<G extends ProvideGraph, D extends CyclicC> =
    | _WrapIn<G, Exclude<D, In<any, any>>>
    | (D extends In<any, any> ? D : never)

type _WrapIn<G extends ProvideGraph, D extends Dependency> =
    [D] extends [never] ? never :
    In<G, D>

type InIgnore =
    | FailedDependency
    | In<any, any>
    | CyclicDependency<any, any, any>

/** @ignore */
export type WrapIn<G extends ProvideGraph, D extends Dependency> =
    | _WrapIn<G, Exclude<D, InIgnore>>
    | (
        D extends CyclicDependency<infer K, infer C, infer E> ? CyclicDependency<WrapIn<G, K>, InFlat<G, C>, E> :
        D extends InIgnore ? D :
        never
    )

export declare abstract class CycleDetected<C extends BaseResource> {
    private _: C
}

/** @ignore */
export declare abstract class ShouldDetectCycles {
    readonly _: any
}

/**
 * A low-level dependency for a {@link DependencyKey}.
 * Generally, you won't need to interact with this type much.
 * It includes {@link Scope:type | Scope}, {@link TypeKey:type | TypeKey}, and {@link InjectableClass}.
 *
 * @group Dependencies
 */
export type Dependency =
    | Scope
    | BaseTypeKey
    | IsSync<any>
    | CyclicDependency<any, any, any>
    | SubcomponentResolve<any, any>
    | In<any, any>
    | ShouldDetectCycles
    | ClassDep
    | FailedDependency

export type FailedDependency =
    | Missing<any>
    | UnableToResolve<any>
    | UnableToResolveIsSync<any>
    | NotDistinct<any>
    | NotSync<any>
    | CycleDetected<any>
