import { Scope } from './Scope'
import { NotDistinct, UnableToResolve, UnableToResolveIsSync, Trace } from './DependencyKey'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, TypeKey } from './TypeKey'
import { InjectableClass } from './InjectableClass'
import { Merge, ProvideGraph } from './ProvideGraph'

/** @ignore */
export type BaseResource = BaseTypeKey | ClassDep

declare abstract class _ClassDep<in out D extends InjectableClass> {
    private _: D
}

export type ClassDep<D extends InjectableClass = any> = _ClassDep<D> & PrivateConstruct

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
export declare abstract class CyclicDep<
    out K extends CyclicItem,
    out C extends CyclicC,
    out E extends CyclicC,
> {
    private _: [K, C, E]
}

type _DistributeCyclicCSub<G extends ProvideGraph, D extends InItem> =
    D extends CyclicCUnit ? Sub<G, D> :
    never

type _DistributeCyclicCIn<G extends ProvideGraph, D extends InItem> =
    D extends CyclicCUnit ? In<G, D> :
    D extends Sub<infer G2, infer D2> ? _DistributeCyclicCSub<G2, D2> :
    never

type _DistributeCyclicC<D extends CyclicItem> =
    D extends CyclicCUnit ? D :
    D extends In<infer G, infer D2> ? (
        D2 extends BaseResource ? In<G, D2> :
        D2 extends Sub<infer G2, infer D3> ? _DistributeCyclicCIn<G2, D3> :
        never
    ) :
    D extends Sub<infer G, infer D2> ? (
        D2 extends BaseResource ? Sub<G, D2> :
        D2 extends Sub<infer G2, infer D3> ? _DistributeCyclicCSub<G2, D3> :
        never
    ) :
    never

type DistributeCyclicC<D extends Dependency> =
    D extends CyclicDep<infer D2, infer C, any> ? Exclude<_DistributeCyclicC<D2>, C> :
    D extends CyclicItem ? _DistributeCyclicC<D> :
    never

export type CyclicItem =
    | InItem
    | In<any, any>

type CyclicCUnit = BaseResource | IsSync<BaseResource>
type CyclicC<B extends CyclicCUnit = CyclicCUnit> = B | In<any, B> | Sub<any, B>
type ExpandCyclicC<C extends Dependency> = C extends CyclicC<infer B> ? B : never

type InValue<C extends CyclicC, G extends ProvideGraph = any> =
    C extends In<G, infer B> ? B :
    C extends Sub<any, any> ? C :
    never

export type ApplyCyclicIn<G extends ProvideGraph, D extends InItem, C extends CyclicC, _C extends CyclicC = InValue<C>> =
    | InChecked<G,
        D extends Sub<infer G2, infer D2> ? ApplyCyclicSub<G2, D2, C> :
        D extends _C ? never :
        D
    >

type SubValue<C extends CyclicC, G extends ProvideGraph = any> =
    C extends Sub<G, infer B> ? B :
    never

export type ApplyCyclicSub<G extends ProvideGraph, D extends SubItem, C extends CyclicC, _C = SubValue<C>> =
    | SubChecked<G, Exclude<D, _C>>

export type ApplyCyclicInError<G extends ProvideGraph, D extends InItem, E extends CyclicC, _E extends CyclicC = InValue<E, G>> =
    D extends Sub<infer G2, infer D2> ? ApplyCyclicSubError<G2, D2, E> :
    D extends E ? CycleDetected<ExpandCyclicC<D>> :
    never

export type ApplyCyclicSubError<G extends ProvideGraph, D extends SubItem, E extends CyclicC, _E extends CyclicC = SubValue<E, G>> =
    D extends E ? CycleDetected<ExpandCyclicC<D>> :
    never

export type _ApplyCyclic<D extends CyclicItem, C extends CyclicC, E extends CyclicC> =
    D extends E ? CycleDetected<ExpandCyclicC<D>> :
    D extends C ? never :
    D extends In<infer G, infer D2> ? ApplyCyclicIn<G, D2, C> | ApplyCyclicInError<G, D2, E> :
    D extends Sub<infer G, infer D2> ? ApplyCyclicSub<G, D2, C> | ApplyCyclicSubError<G, D2, E> :
    D

export type ApplyCyclic<D extends Dependency, C extends CyclicC, E extends CyclicC> =
    | _ApplyCyclic<Extract<D, CyclicItem>, C, E>
    | (
        D extends CyclicItem ? never :
        D extends CyclicDep<infer D2, infer C2, infer E2> ? CyclicChecked<_ApplyCyclic<D2, C, Exclude<E, Exclude<C2, E2>>>, C2, E2> :
        D
    )

type CyclicChecked<D extends CyclicItem | FailedDependency, C extends CyclicC, E extends CyclicC> =
    [D] extends [FailedDependency] ? D :
    [C] extends [never] ? D :
    (
        | CyclicDep<Exclude<D, FailedDependency>, C, E>
        | Extract<D, FailedDependency>
    )

/** @ignore */
export type WrapCyclic<D extends Dependency, C extends CyclicC, E extends CyclicC> =
    | CyclicChecked<Extract<D, CyclicItem>, C, E>
    | (
        D extends CyclicItem ? never :
        D extends CyclicDep<infer K, infer C2, infer E2> ? CyclicDep<
            K,
            C | C2,
            (
                | Exclude<E, C2>
                | Exclude<E2, C>
                | Extract<E2, E>
            )
        > :
        D
    )
/** @ignore */
export type AllowCycles<D extends Dependency> = WrapCyclic<D, DistributeCyclicC<D>, never>

type DetectCyclesSubItem<D extends SubItem, C extends CyclicC = DistributeCyclicC<D>> =
    | CyclicChecked<Extract<D, IsSync<any>>, C, never>
    | (
        D extends BaseResource ? CyclicDep<D, D, D> :
        D extends CyclicCUnit ? never :
        D
    )

type DetectCyclesInItem<D extends InItem> =
    | DetectCyclesSubItem<Exclude<D, Sub<any, any>>>
    | (
        D extends Sub<infer G, infer D2> ? WrapSub<G, DetectCyclesSubItem<D2>> :
        never
    )

type DetectCyclesCyclicItem<D extends CyclicItem> =
    | DetectCyclesInItem<Exclude<D, In<any, any>>>
    | (
        D extends In<infer G, infer D2> ? WrapIn<G, DetectCyclesInItem<D2>> :
        never
    )

/** @ignore */
export type DetectCycles<D extends Dependency> =
    | DetectCyclesCyclicItem<Extract<D, CyclicItem>>
    | (
        D extends CyclicItem ? never :
        D extends CyclicDep<infer D2, infer C2, infer E2> ? WrapCyclic<
            DetectCyclesCyclicItem<D2>, C2, E2
        > :
        D
    )

/** @ignore */
export declare abstract class Missing<in out K extends Dependency> {
    private _: K
}

/** @ignore */
export declare abstract class Sub<G extends ProvideGraph, D extends SubItem> {
    private _: [G, D]
}

export type SubItem =
    | SimpleDependency

type SubChecked<G extends ProvideGraph, D extends SubItem> =
    [D] extends [never] ? never : Sub<G, D>

type SubFlat<G extends ProvideGraph, D extends CyclicItem> =
    | SubChecked<G, Extract<D, SubItem>>
    | (
        D extends In<any, any> ? D :
        D extends Sub<infer G2, infer D2> ? SubChecked<Merge<G, G2>, D2> :
        never
    )

export type WrapSub<G extends ProvideGraph, D extends Dependency> =
    | SubChecked<G, Extract<D, SubItem>>
    | (
        D extends SubItem ? never :
        D extends CyclicItem ? SubFlat<G, D> :
        D extends CyclicDep<infer K, infer C, infer E> ? CyclicChecked<
            InFlat<G, K>,
            DistributeCyclicC<SubFlat<G, C>>,
            DistributeCyclicC<SubFlat<G, E>>
        > :
        D
    )

/** @ignore */
export declare abstract class In<G extends ProvideGraph, D extends InItem> {
    private _: [G, D]
}

export type InItem =
    | SubItem
    | Sub<any, any>

type InFlat<G extends ProvideGraph, D extends CyclicItem> =
    | InChecked<G, Exclude<D, In<any, any>>>
    | (D extends In<any, any> ? D : never)

export type InChecked<G extends ProvideGraph, D extends InItem | FailedDependency> =
    | ([D] extends [FailedDependency] ? never : In<G, Exclude<D, FailedDependency>>)
    | Extract<D, FailedDependency>

/** @ignore */
export type WrapIn<G extends ProvideGraph, D extends Dependency> =
    | InChecked<G, Extract<D, InItem>>
    | (
        D extends InItem ? never :
        D extends CyclicDep<infer K, infer C, infer E> ? CyclicChecked<
            InFlat<G, K>,
            DistributeCyclicC<InFlat<G, C>>,
            DistributeCyclicC<InFlat<G, E>>
        > :
        D
    )

export declare abstract class CycleDetected<C extends CyclicCUnit> {
    private _: C
}

/** @ignore */
export declare abstract class ShouldDetectCycles {
    readonly _: any
}

export type SimpleDependency =
    | BaseResource
    | IsSync<BaseResource>

export type ComplexDependency =
    | Scope
    | CyclicDep<any, any, any>
    | Sub<any, any>
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
    | Trace
