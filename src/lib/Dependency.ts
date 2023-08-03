import { Scope } from './Scope'
import { NotDistinct, UnableToResolve, UnableToResolveIsSync } from './DependencyKey'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, TypeKey } from './TypeKey'
import { InjectableClass } from './InjectableClass'
import { Merge, ProvideGraph } from './ProvideGraph'

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
    out K extends CyclicItem,
    out C extends CyclicC,
    out E extends CyclicC,
> {
    private _: [K, C, E]
}

type _DistributeCyclicC<D extends CyclicItem> =
    D extends BaseResource ? D :
    D extends In<infer G, infer X> ? (X extends BaseResource ? In<G, X> : never) :
    D extends InSub<infer G, infer X> ? (X extends BaseResource ? InSub<G, X> : never) :
    never

type DistributeCyclicC<D extends Dependency> =
    D extends CyclicDependency<infer D2, infer C, any> ? Exclude<_DistributeCyclicC<D2>, C> :
    D extends CyclicItem ? _DistributeCyclicC<D> :
    never

export type CyclicItem = SimpleDependency | In<any, any> | InSub<any, any>
type CyclicC<B extends BaseResource = BaseResource> = B | In<any, B> | InSub<any, B>
type ExpandCyclicC<C extends Dependency> = C extends CyclicC<infer B> ? B : never

export type ApplyCyclic<D extends Dependency, C extends CyclicC, E extends CyclicC> =
    | (
        D extends C ? never :
        D extends In<infer G, infer D2> ? In<G, Exclude<D2, C>> :
        D extends InSub<infer G, infer D2> ? InSub<G, Exclude<D2, C>> :
        D
    )
    | (
        D extends E ? CycleDetected<ExpandCyclicC<D>> :
        D extends InSub<any, infer D2> | In<any, infer D2> ? (D2 extends E ? CycleDetected<ExpandCyclicC<D2>> : never) :
        D
    )

type _ToCyclic<D extends CyclicItem, C extends CyclicC, E extends CyclicC> =
    [D] extends [never] ? never :
    [C] extends [never] ? D :
    CyclicDependency<D, C, E>

/** @ignore */
export type ToCyclic<D extends Dependency, C extends CyclicC, E extends CyclicC> =
    | _ToCyclic<Extract<D, CyclicItem>, C, E>
    | (
        D extends CyclicItem ? never :
        D extends CyclicDependency<infer K, infer C2, infer E2> ? ToCyclic<
            ApplyCyclic<K, C, E>,
            C | C2,
            (
                | Exclude<E, C2>
                | Exclude<E2, C>
                | Extract<E, E2>
            )
        > :
        D
    )
/** @ignore */
export type AllowCycles<D extends Dependency> = ToCyclic<D, DistributeCyclicC<D>, never>

/** @ignore */
// export type DetectCycles<D extends Dependency> = ToCyclic<D, DistributeCyclicC<D>, DistributeCyclicC<D>>
export type DetectCycles<D extends Dependency> = ToCyclic<D, DistributeCyclicC<D>, DistributeCyclicC<D>>

/** @ignore */
export declare abstract class Missing<in out K extends Dependency> {
    private _: K
}

/** @ignore */
export declare abstract class InSub<G extends ProvideGraph, D extends SimpleDependency> {
    private _: [G, D]
}

type _WrapSub<G extends ProvideGraph, D extends SimpleDependency> =
    [D] extends never ? never :
    InSub<G, D>

type SubFlat<G extends ProvideGraph, D extends CyclicItem> =
    | _WrapSub<G, Extract<D, SimpleDependency>>
    | (
        D extends In<any, any> ? D :
        D extends InSub<infer G2, infer D2> ? _WrapSub<Merge<G, G2>, D2> :
        never
    )

export type WrapSub<G extends ProvideGraph, D extends Dependency> =
    | _WrapSub<G, Extract<D, SimpleDependency>>
    | (
        D extends SimpleDependency ? never :
        D extends InSub<infer G2, infer D2> ? InSub<Merge<G, G2>, D2> :
        D extends CyclicDependency<infer K, infer C, infer E> ? _ToCyclic<
            InFlat<G, K>,
            DistributeCyclicC<SubFlat<G, C>>,
            DistributeCyclicC<SubFlat<G, E>>
        > :
        D
    )

/** @ignore */
export declare abstract class In<G extends ProvideGraph, D extends SimpleDependency> {
    private _: [G, D]
}

type InFlat<G extends ProvideGraph, D extends CyclicItem> =
    | _WrapIn<G, Exclude<D, In<any, any> | InSub<any, any>>>
    | (
        D extends In<any, any> ? D :
        D extends InSub<infer G2, infer D2> ? _WrapIn<Merge<G, G2>, D2> :
        never
    )

type _WrapIn<G extends ProvideGraph, D extends SimpleDependency> =
    [D] extends [never] ? never :
    In<G, D>

/** @ignore */
export type WrapIn<G extends ProvideGraph, D extends Dependency> =
    | _WrapIn<G, Extract<D, SimpleDependency>>
    | (
        D extends SimpleDependency ? never :
        D extends CyclicDependency<infer K, infer C, infer E> ? _ToCyclic<
            InFlat<G, K>,
            DistributeCyclicC<InFlat<G, C>>,
            DistributeCyclicC<InFlat<G, E>>
        > :
        D extends InSub<infer GSub, infer DSub> ? _WrapIn<Merge<G, GSub>, DSub> :
        D
    )

export declare abstract class CycleDetected<C extends BaseResource> {
    private _: C
}

/** @ignore */
export declare abstract class ShouldDetectCycles {
    readonly _: any
}

export type SimpleDependency =
    | BaseTypeKey
    | IsSync<any>
    | ClassDep

export type ComplexDependency =
    | Scope
    | CyclicDependency<any, any, any>
    | InSub<any, any>
    | In<any, any>
    | ShouldDetectCycles

export type OkDependency =
    | SimpleDependency
    | ComplexDependency

/**
 * A low-level dependency for a {@link DependencyKey}.
 * Generally, you won't need to interact with this type much.
 * It includes {@link Scope:type | Scope}, {@link TypeKey:type | TypeKey}, and {@link InjectableClass}.
 *
 * @group Dependencies
 */
export type Dependency =
    | OkDependency
    | FailedDependency

export type FailedDependency =
    | Missing<any>
    | UnableToResolve<any>
    | UnableToResolveIsSync<any>
    | NotDistinct<any>
    | NotSync<any>
    | CycleDetected<any>

