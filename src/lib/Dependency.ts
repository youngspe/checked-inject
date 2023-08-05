import { Scope } from './Scope'
import { NotDistinct, UnableToResolve, UnableToResolveIsSync } from './DependencyKey'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, TypeKey } from './TypeKey'
import { InjectableClass } from './InjectableClass'
import { Merge, ProvideGraph } from './ProvideGraph'
import { AllKeys } from './CanRequest'

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
export declare abstract class CyclicDependency<
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
    D extends CyclicDependency<infer D2, infer C, any> ? Exclude<_DistributeCyclicC<D2>, C> :
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
    C extends In<any, any> | Sub<any, any> ? C :
    never

export type ApplyCyclicIn<G extends ProvideGraph, D extends InItem, C extends CyclicC, _C extends CyclicC = InValue<C>> =
    | InChecked<G,
        D extends Sub<infer G2, infer D2> ? ApplyCyclicSub<G2, D2, C> :
        D extends _C ? never :
        D
    >

type SubValue<C extends CyclicC, G extends ProvideGraph = any> =
    C extends Sub<G, infer B> ? B :
    C extends In<any, any> | Sub<any, any> ? C :
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

export type ApplyCyclic<D extends Dependency, C extends CyclicC, E extends CyclicC> =
    D extends E ? CycleDetected<ExpandCyclicC<D>> :
    D extends C ? never :
    D extends In<infer G, infer D2> ? ApplyCyclicIn<G, D2, C> | ApplyCyclicInError<G, D2, E> :
    D extends Sub<infer G, infer D2> ? ApplyCyclicSub<G, D2, C> | ApplyCyclicSubError<G, D2, E> :
    D

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
            K,
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

type DetectCyclesSubItem<D extends InItem, C extends CyclicC = DistributeCyclicC<D>> =
    | _ToCyclic<Exclude<Extract<D, CyclicCUnit>, BaseResource>, C, never>
    | (
        D extends BaseResource ? CyclicDependency<D, C, D> :
        D extends CyclicCUnit ? never :
        D
    )

type DetectCyclesInItem<D extends InItem, C extends CyclicC = DistributeCyclicC<D>> =
    | DetectCyclesSubItem<Extract<D, SubItem>, C>
    | (
        D extends Sub<infer G, infer D2> ? WrapSub<G, DetectCyclesSubItem<D2>> :
        never
    )

type DetectCyclesCyclicItem<D extends CyclicItem, C extends CyclicC = DistributeCyclicC<D>> =
    | DetectCyclesInItem<Extract<D, InItem>, C>
    | (
        D extends In<infer G, infer D2> ? WrapIn<G, DetectCyclesInItem<D2>> :
        never
    )

export type _DetectCycles<D extends CyclicItem | CyclicDependency<any, any, any>, C extends CyclicC = DistributeCyclicC<D>> =
    | DetectCyclesCyclicItem<Extract<D, CyclicItem>, C>
    | (
        D extends CyclicItem ? DetectCyclesCyclicItem<D> :
        never
    )

/** @ignore */
export type DetectCycles<D extends Dependency> =
    | _DetectCycles<Extract<D, CyclicItem | CyclicDependency<any, any, any>>>
    | Exclude<D, CyclicItem | CyclicDependency<any, any, any>>
// D extends CyclicDependency<infer D2, infer C2, infer E2> ? ToCyclic<
//     DetectCyclesCyclicItem<D2, _C>, C2, E2
// > :
// D extends CyclicItem ? DetectCyclesCyclicItem<D, _C> :
// D

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
        D extends CyclicDependency<infer K, infer C, infer E> ? _ToCyclic<
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
    [D] extends [never] ? never : In<G, Exclude<D, FailedDependency>>


/** @ignore */
export type WrapIn<G extends ProvideGraph, D extends Dependency> =
    | InChecked<G, Extract<D, InItem>>
    | (
        D extends InItem ? never :
        D extends CyclicDependency<infer K, infer C, infer E> ? _ToCyclic<
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
    | CyclicDependency<any, any, any>
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

