import { Scope } from './Scope'
import { NotDistinct, UnableToResolve, UnableToResolveIsSync } from './DependencyKey'
import { Extending, Class } from './_internal'
import { BaseTypeKey } from './TypeKey'
import { InjectableClass } from './InjectableClass'
import { Merge, ProvideGraph } from './ProvideGraph'
import { ComputedKey } from './ComputedKey'

/** @ignore */
export type BaseResource = BaseTypeKey | ClassDep

declare abstract class _ClassDep<in out D extends InjectableClass> {
    private _: D
    /** @ignore make sure this type is invariant over D */
    _classDep(x: D): D
    readonly scope: Extract<D['scope'], Scope>
    readonly inject: Extract<D['inject'], ComputedKey | (() => ComputedKey)>
}

export interface ClassDep<in out D extends InjectableClass = any> extends
    _ClassDep<D>,
    Class<D['prototype']> {
}

/** @ignore */
export declare abstract class IsSync<out K extends BaseResource> {
    private _: K
    _isSync: K
}

/** @ignore */
export declare abstract class NotSync<out K> {
    private _: K
    _notSync: K
}

/** @ignore */
export type RequireSync<D> = D extends BaseResource ? IsSync<D> : never

/** @ignore */
export type AllowCycles<D> = WrapCyclic<D>

export type Skippable<B extends SimpleDependency = SimpleDependency> =
    | B
    | In<any, B>
    | Sub<any, B>

export type Failable<B extends BaseResource = BaseResource> = Skippable<B>

export type ToFailable_CyclicItem<D extends CyclicItem> =
    D extends Failable ? D :
    D extends In<any, infer D2 extends Sub<any, BaseResource>> ? D2 :
    never

export type ToFailable<D> = Extending<Failable, (
    D extends CyclicItem ? ToFailable_CyclicItem<D> :
    D extends Cyclic<any> ? never :
    D extends FailOn_Dep<infer D2, any> ? ToFailable_CyclicItem<D2> :
    never
)>

export type ToSkippable_CyclicItem<D extends CyclicItem> =
    D extends Skippable ? D :
    D extends In<any, infer D2 extends Sub<any, SimpleDependency>> ? D2 :
    never

export type ToSkippable<D> =
    D extends CyclicItem ? ToSkippable_CyclicItem<D> :
    D extends Cyclic<infer D2> ? ToSkippable_CyclicItem<D2> :
    D extends FailOn_Dep<infer D2, any> ? ToSkippable_CyclicItem<D2> :
    never

export declare abstract class Cyclic<D extends CyclicItem> {
    private _: D
    _cyclic: D
}

export type WrapCyclic<D> =
    D extends CyclicItem ? Cyclic<D> :
    D extends FailOn_Dep<infer D2, any> ? Cyclic<D2> :
    D

export type CyclicItem =
    | InItem
    | In<any, any>

export declare abstract class FailOn_Skippable<D extends Skippable, Fl extends Failable> {
    private _a: [D, Fl]
    _failOn_skippable: [D, Fl]
}

export declare abstract class FailOn_Dep<D extends CyclicItem, Fl extends Failable> {
    private _b: [D, Fl]
    _failOn_dep: [D, Fl]
}

export interface FailOn<D extends CyclicItem, Fl extends Failable> extends
    FailOn_Dep<D, Fl>,
    FailOn_Skippable<ToSkippable<D>, Fl> { }

export type WrapFailOn<D, Fl extends Failable> =
    [Fl] extends [never] ? D :
    D extends CyclicItem ? FailOn<D, Fl> :
    D extends Cyclic<any> ? D :
    D extends FailOn_Dep<infer D2, infer Fl2> ? FailOn<D2, Fl | Fl2> :
    D

export type GetBaseResource_InItem<D extends InItem> =
    D extends BaseResource ? D :
    D extends Sub<any, infer D2> ? D2 :
    D

export type GetBaseResource_CyclicItem<D extends CyclicItem> =
    D extends InItem ? GetBaseResource_InItem<D> :
    D extends In<any, infer D2> ? GetBaseResource_InItem<D2> :
    D

export type GetBaseResource<D> =
    D extends CyclicItem ? GetBaseResource_CyclicItem<D> :
    D extends Cyclic<infer D2> ? GetBaseResource_CyclicItem<D2> :
    D extends FailOn_Dep<infer D2, any> ? GetBaseResource_CyclicItem<D2> :
    D

/** @ignore */
export declare abstract class Missing<K> {
    private _: K
}

/** @ignore */
export declare abstract class Sub<G extends ProvideGraph, D extends SubItem> {
    private _: [G, D]
    _sub: [G, D]
}

export type SubItem = SimpleDependency

type WrapSub_CyclicItem<G extends ProvideGraph, D extends CyclicItem> = Extending<CyclicItem, (
    D extends SubItem ? Sub<G, D> :
    D extends Sub<infer G2, infer D2> ? Sub<Merge<G2, G>, D2> :
    D extends In<any, any> ? D :
    never
)>

export type WrapSub<G extends ProvideGraph, D> =
    D extends CyclicItem ? WrapSub_CyclicItem<G, D> :
    D extends FailOn_Dep<infer D2, infer Fl> ? WrapFailOn<
        WrapSub_CyclicItem<G, D2>,
        WrapSub_CyclicItem<G, Fl>
    > :
    D extends Cyclic<infer D2> ? Cyclic<WrapSub_CyclicItem<G, D2>> :
    D

/** @ignore */
export declare abstract class In<G extends ProvideGraph, D extends InItem> {
    private _: [G, D]
    _in: [G, D]
}

export type InItem =
    | SubItem
    | Sub<any, any>

export type WrapIn_CyclicItem<G extends ProvideGraph, D extends CyclicItem> = Extending<CyclicItem, (
    D extends InItem ? In<G, D> :
    D extends In<any, any> ? D :
    never
)>

export type WrapIn<G extends ProvideGraph, D> =
    D extends CyclicItem ? WrapIn_CyclicItem<G, D> :
    D extends FailOn_Dep<infer D2, infer Fl> ? WrapFailOn<
        WrapIn_CyclicItem<G, D2>,
        ToFailable<WrapIn_CyclicItem<G, Fl>>
    > :
    D extends Cyclic<infer D2> ? Cyclic<WrapIn_CyclicItem<G, D2>> :
    D

export declare abstract class CycleDetected<C> {
    private _: C
}

export type SimpleDependency =
    | BaseResource
    | IsSync<any>

export type AuxiliaryDependency =
    | Scope

export type OkDependency =
    | CyclicItem
    | Cyclic<any>
    | FailOn<any, any>

/**
 * A low-level dependency for a {@link DependencyKey}.
 * Generally, you won't need to interact with this type much.
 * It includes {@link Scope:type | Scope}, {@link TypeKey:type | TypeKey}, and {@link InjectableClass}.
 *
 * @group Dependencies
 */
export type Dependency =
    | OkDependency
    | AuxiliaryDependency
    | FailedDependency

export type FailedDependency =
    | Missing<any>
    | UnableToResolve<any>
    | UnableToResolveIsSync<any>
    | NotDistinct<any>
    | NotSync<any>
    | CycleDetected<any>
