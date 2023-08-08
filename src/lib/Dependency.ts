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
    out E extends C,
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

export type CyclicItem =
    | InItem
    | In<any, any>

type CyclicCUnit = BaseResource | IsSync<BaseResource>
type _CyclicC<B extends CyclicCUnit> = B | In<ProvideGraph, B> | Sub<ProvideGraph, B>
type CyclicC<B extends CyclicCUnit = CyclicCUnit> = B | In<any, B> | Sub<any, B>
type CyclicCValue<C extends CyclicC> =
    C extends In<any, infer B> | Sub<any, infer B> ? B :
    C

type ExtractSub<D extends Dependency> =
    D extends In<any, infer S extends Sub<any, any>> ? S :
    D

type ToCyclicC<D extends Dependency> = Extract<ExtractSub<D>, CyclicC>

export type ApplyCyclic<D extends Dependency, C extends CyclicC, E extends C> =
    D extends CyclicDep<infer D2, infer C2, infer E2> ? (
        CyclicChecked<ApplyCyclic<D2, C, Exclude<E, C2> | Extract<E, E2>>, C2, E2>
    ) :
    ExtractSub<D> extends infer DCyclic extends _CyclicC<infer B> ? (
        DCyclic extends E ? CycleDetected<CyclicCValue<DCyclic>> :
        DCyclic extends C ? never :
        D
    ) :
    D

type CyclicChecked<D extends CyclicItem | FailedDependency, C extends CyclicC, E extends C> =
    [C] extends [never] ? D :
    D extends CyclicItem ? CyclicDep<D, C, E> :
    D

type FlattenCyclic<
    D extends CyclicItem,
    C1 extends CyclicC, C2 extends CyclicC,
    E1 extends C1, E2 extends C2,
> = D extends any ? (
    CyclicDep<
        D,
        C1 | C2,
        | Exclude<E1, C2>
        | Exclude<E2, C1>
        | Extract<E1, E2>
    >
) : never

/** @ignore */
export type WrapCyclic<D extends Dependency, C extends CyclicC, E extends C> =
    D extends CyclicItem ? CyclicChecked<D, C, E> :
    D extends CyclicDep<infer D2, infer C2, infer E2> ? FlattenCyclic<D2, C, C2, E, E2> :
    D

/** @ignore */
export type AllowCycles<D extends Dependency> = WrapCyclic<D, ToCyclicC<D>, never>

type _DetectCycles<
    D extends CyclicItem,
    C1 extends CyclicC,
    C2 extends CyclicC,
    E1 extends C1,
    E2 extends C2,
> =
    ExtractSub<D> extends infer DCyclic extends CyclicC ? (
        DCyclic extends C2 ? FlattenCyclic<D, C1, C2, E1, E2> :
        CyclicDep<D, DCyclic | C2, DCyclic | E2>
    ) :
    D

/** @ignore */
export type DetectCycles<D extends Dependency, _C extends CyclicC = ToCyclicC<D>, _E extends _C = Exclude<_C, CyclicC<IsSync<any>>>> =
    D extends CyclicItem ? _DetectCycles<D, _C, never, _E, never> :
    D extends CyclicDep<infer D2, infer C2, infer E2> ? (
        _DetectCycles<D2, _C, C2, _E, E2>
    ) :
    D

/** @ignore */
export declare abstract class Missing<K extends Dependency> {
    private _: K
}

/** @ignore */
export declare abstract class Sub<G extends ProvideGraph, D extends SubItem> {
    private _: [G, D]
}

export type SubItem =
    | SimpleDependency

type SubChecked<G extends ProvideGraph, D extends SubItem | FailedDependency> =
    D extends SubItem ? Sub<G, D> : D

export type WrapSub<G extends ProvideGraph, D extends Dependency> =
    D extends SubItem ? Sub<G, D> :
    D extends Sub<infer G2, infer D2> ? Sub<Merge<G, G2>, D2> :
    D extends In<any, any> ? D :
    D extends CyclicDep<infer D2, infer C, infer E> ? CyclicChecked<
        WrapSub<G, D2>, WrapSub<G, C>, WrapSub<G, E>
    > :
    D

/** @ignore */
export declare abstract class In<G extends ProvideGraph, D extends InItem> {
    private _: [G, D]
}

export type InItem =
    | SubItem
    | Sub<any, any>

export type InChecked<G extends ProvideGraph, D extends InItem | FailedDependency> =
    D extends InItem ? In<G, D> : D

type WrapInCyclicC<G extends ProvideGraph, D extends CyclicC> =
    D extends CyclicCUnit ? In<G, D> :
    D

/** @ignore */
export type WrapIn<G extends ProvideGraph, D extends Dependency> =
    D extends InItem ? In<G, D> :
    D extends In<any, any> ? D :
    D extends CyclicDep<infer D2, infer C extends CyclicC, infer E> ? CyclicChecked<
        WrapIn<G, D2>, WrapInCyclicC<G, C>, WrapInCyclicC<G, E>
    > :
    D

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
