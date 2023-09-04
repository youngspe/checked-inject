import { Dependency, IsSync, FailedDependency, Missing, Sub, In, WrapIn, BaseResource, SimpleDependency, OkDependency, InItem, SubItem, FailOn, ClassDep, NotSync, CycleDetected, ToFailable, CyclicItem, Cyclic, ToSkippable, Skippable, Failable, FailOn_Skippable, WrapFailOn, GetBaseResource } from './Dependency'
import { DependencyKey, DepsOf, NotDistinct, IsSyncDepsOf, UnableToResolve, Trace } from './DependencyKey'
import { ChildGraph, DepPair, GraphPairs, Merge, ProvideGraph, WithScope } from './ProvideGraph'
import { Scope } from './Scope'
import { BaseTypeKey, KeyWithDefault, KeyWithoutDefault } from './TypeKey'
import { Class } from './_internal'

type UnresolvedKeys<
    P extends ProvideGraph,
    K extends DependencyKey,
    Sync = IsSyncDepsOf<K>,
> = DepsForKey<
    P,
    | DepsOf<K>
    | Sync
> extends infer D ? (
        D extends Missing<infer X> ? SimplifyDep<X> :
        SimplifyDep<D>
    ) : never

export const unresolved = Symbol()

/** @ignore */
export interface RequestFailed<in out K> {
    [unresolved]: (K extends any ? [K] : never)[0]
}

export type CanRequest<
    P extends ProvideGraph,
    K extends DependencyKey,
    Sync = IsSyncDepsOf<K>,
> = (UnresolvedKeys<P, K, Sync> extends infer E ? ([E] extends [never] ? unknown : RequestFailed<E>) : never)

export type AllKeys<P extends ProvideGraph> =
    | P['pairs']['key']
    | (P extends ChildGraph<infer Parent, any> ? AllKeys<Parent> : never)

type _FindGraphWithDep<P extends ProvideGraph, D> =
    P extends ChildGraph<infer Parent> ? (
        [D] extends [KeysOf<P>] ? P :
        _FindGraphWithDep<Parent, D>
    ) :
    P

type ExcludeBroad<D> = D extends Extract<Dependency, D> ? never : D

type FindGraphWithDep<P extends ProvideGraph, D> = _FindGraphWithDep<P, ExcludeBroad<D>>
type IntersectKeyOf<P extends ProvideGraph, D> = Extract<KeysOf<P>, ExcludeBroad<D>>

type CheckHasScopes<
    G extends ProvideGraph,
    Scp extends Scope,
> =
    Scp extends AllKeys<G> ? never :
    Missing<Scp>// | UnableToResolve<SimplifyDep<AllKeys<G>>>

type _ResolveScopedDep<
    HasScopeError extends FailedDependency,
    G extends ProvideGraph,
    Key extends SimpleDependency,
    Scp extends Scope,
    D,
> =
    [HasScopeError] extends [never] ? (
        IntersectKeyOf<G, Scp | Key> extends never ? WrapIn<FindGraphWithDep<G, Scp | Key>, D> :
        D
    ) :
    HasScopeError

type ResolveScopedDep<
    G extends ProvideGraph,
    Key extends SimpleDependency,
    Scp extends Scope,
    D,
    ScopeFilter,
> = _ResolveScopedDep<
    CheckHasScopes<G, Extract<Scp, ScopeFilter>>,
    G, Key, Scp, D
>

type _DepsForKeyTransitive_inner<
    PRoot extends ProvideGraph,
    K extends SimpleDependency,
    PCurrent extends ProvideGraph,
    Pair extends GraphPairs,
> =
    [Pair] extends [never] ? (
        PCurrent extends ChildGraph<infer Parent> ? _DepsForKeyTransitive<PRoot, K, Parent> :
        UnableToResolve<['DepsForKeyTransitive', K, SimplifyDep<Extract<AllKeys<PRoot>, BaseResource>>]>
    ) :
    [Pair] extends [DepPair<any, infer D>] ? (
        [Pair] extends [WithScope<infer Scp>] ? ResolveScopedDep<PRoot, K, Scp, D, D> :
        D
    ) : never

type _DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends SimpleDependency,
    PCurrent extends ProvideGraph,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> = _DepsForKeyTransitive_inner<PRoot, K, PCurrent, Pairs extends DepPair<infer K1 extends K, any> ? (K extends K1 ? Pairs : never) : never>

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends SimpleDependency,
> = _DepsForKeyTransitive<PRoot, K, PRoot>

type _DepsForKeyScoped<
    G extends ProvideGraph,
    Scp extends Scope,
    D,
    RequireScopeFilter extends Scope,
> =
    [Scp] extends [never] ? D :
    ResolveScopedDep<G, never, Scp, D, RequireScopeFilter>

type DepsForKeyScoped<
    G extends ProvideGraph,
    K,
    D,
    // Pass true iff the scopes of `K` should be required dependencies
    // Pass false to only use them to locate the correct ancestor graph
    RequireScope extends boolean,
> =
    K extends WithScope<infer Scp> ? _DepsForKeyScoped<
        G,
        ExcludeBroad<Scp>,
        D,
        RequireScope extends true ? Scope : never
    > :
    D

type DepsForKeyIsSync<
    P extends ProvideGraph,
    K2 extends BaseResource,
    K extends IsSync<K2>,
> =
    K2 extends KeyWithoutDefault ? never :
    K2 extends KeyWithDefault<infer _T, any, infer Sync> ? DepsForKeyScoped<P, K2, Sync, false> :
    // The above cases should have handled all BaseResource values
    UnableToResolve<['DepsForKeyIsSync', K, { [X in keyof K2]: K2[X] }]>

type DepsForKeySimpleDep<
    G extends ProvideGraph,
    K extends SimpleDependency,
> =
    BaseResource extends K ? UnableToResolve<['KeyTooBroad', K]> :
    IsSync<BaseResource> extends K ? UnableToResolve<['KeyTooBroad', K]> :
    K extends Extract<AllKeys<G>, K> ? DepsForKeyTransitive<G, K> :
    K extends KeyWithoutDefault ? Missing<K> :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKeyScoped<G, K, D, true> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<G, K2, K> :
    // The above cases should have handled all SimpleDendency values
    // UnableToResolve<['DepsForKeySimpleDep', K, { [X in keyof K]: K[X] }]>
    UnableToResolve<['DepsForKeySimpleDep', K]>

type DepsForKeyInItem<G extends ProvideGraph, K extends InItem> =
    K extends SimpleDependency ? DepsForKeySimpleDep<G, K> :
    K extends Sub<infer GSub, infer D> ? WrapIn<Merge<G, GSub>, DepsForKeySimpleDep<Merge<G, GSub>, D>> :
    UnableToResolve<['DepsForKeyInItem', K]>

type DepsForKeyCyclicItem<G extends ProvideGraph, K extends CyclicItem> =
    K extends InItem ? DepsForKeyInItem<G, K> :
    K extends In<G, infer D> ? DepsForKeyInItem<G, D> :
    K extends In<infer G2, infer D> ? WrapIn<G2, DepsForKeyInItem<G2, D>> :
    UnableToResolve<['DepsForKeyCyclicItem', K]>

type TryInstanceType<T> = T extends Class<infer U> ? U : T

type DepsForKeyFailOn<
    G extends ProvideGraph,
    K extends CyclicItem,
    Fl extends Failable,
    Prev extends Skippable,
    KAll,
    Ksk = ToSkippable<K>,
> =
    Ksk extends Fl ? CycleDetected<Ksk> :
    Ksk extends Failable ? (TransitiveFailOn<KAll, Fl> extends infer Fl2 ? (
        Ksk extends Fl2 ? CycleDetected<Ksk> :
        Ksk extends Prev ? never :
        WrapFailOn<DepsForKeyCyclicItem<G, K>, Ksk | Fl | Extract<Fl2, Failable>>
    ) : never) :
    Ksk extends Prev ? never :
    WrapFailOn<DepsForKeyCyclicItem<G, K>, Fl>

type DepsForKeyStep<
    G extends ProvideGraph,
    K extends OkDependency,
    Prev extends Skippable,
    KAll = K,
> =
    K extends FailOn<infer D, infer Fl> ? DepsForKeyFailOn<G, D, Fl, Prev, KAll> :
    ToSkippable<K> extends Prev ? never :
    K extends Cyclic<infer D> ? DepsForKeyCyclicItem<G, D> :
    K extends CyclicItem ? WrapFailOn<DepsForKeyCyclicItem<G, K>, ToFailable<K>> :
    UnableToResolve<['DepsForKeyStep', K]>

type _DepsForKey1<
    G extends ProvideGraph,
    K extends OkDependency,
    Prev extends Skippable,
> =
    [K] extends [never] ? never :
    _DepsForKey<
        G,
        DepsForKeyStep<G, CombineFailOn<K>, Prev>,
        Prev | ToSkippable<K>
    >

type _DepsForKey<
    G extends ProvideGraph,
    K,
    Prev extends Skippable,
> =
    | Extract<K, FailedDependency>
    | _DepsForKey1<G, Extract<K, OkDependency>, Prev>

type DepsForKey<
    G extends ProvideGraph,
    K,
> = _DepsForKey<G, ValidateDep<K>, never>

type ValidateDep_SubItem<D extends SubItem | Scope, _D> =
    D extends BaseTypeKey | Scope ? (
        // if keyTag is a symbol it's a valid TypeKey
        D extends { readonly keyTag: symbol } | { readonly scopeTag: symbol } ? _D :
        // if D's instance type has no private fields it is not guaranted to be distinct
        D extends { prototype: infer P } ? ({ [X in keyof P]: P[X] } extends P ? NotDistinct<D> : _D) :
        NotDistinct<D>
    ) :
    _D

type ValidateDep_InItem<D extends InItem, _D> =
    D extends SubItem ? ValidateDep_SubItem<D, _D> :
    D extends Sub<any, infer D2> ? ValidateDep_SubItem<D2, _D> :
    never

type ValidateDep_CyclicItem<D extends CyclicItem, _D> =
    D extends InItem ? ValidateDep_InItem<D, _D> :
    D extends In<any, infer D2> ? ValidateDep_InItem<D2, _D> :
    never

type ValidateDep<D> =
    D extends Scope ? ValidateDep_SubItem<D, D> :
    D extends CyclicItem ? ValidateDep_CyclicItem<D, D> :
    D extends FailOn<infer D2, any> ? ValidateDep_CyclicItem<D2, D> :
    D extends Cyclic<infer D2> ? ValidateDep_CyclicItem<D2, D> :
    D

type TransitiveFailOn<K, Fl extends Failable> =
    Fl extends never ? never :
    K extends FailOn_Skippable<Fl, infer Fl2> ? Fl2 :
    never

type CombineFailOn<K, _K = K, _D extends CyclicItem = _K extends FailOn<infer D, any> ? D : never> =
    | Exclude<K, FailOn<any, any>>
    | (_D extends any ? FailOn<
        _D,
        _K extends FailOn<_D, infer Fl> ? Fl : never
    > : never)

type SimplifyDep_BaseResource<D> =
    D extends ClassDep<infer K> ? TryInstanceType<K> :
    TryInstanceType<D>

type SimplifyDep_SubItem<D> =
    D extends BaseResource ? SimplifyDep_BaseResource<D> :
    D extends IsSync<infer D2> ? IsSync<SimplifyDep_BaseResource<D2>> :
    D

type SimplifyDep_InItem<D> =
    D extends SubItem ? SimplifyDep_SubItem<D> :
    D extends Sub<any, infer D2> ? Sub<any, SimplifyDep_SubItem<D2>> :
    D

type SimplifyDep_CyclicItem<D> =
    D extends InItem ? SimplifyDep_InItem<D> :
    D extends In<any, infer D2> ? In<any, D2> :
    D

type SimplifyDep_Ok<D extends OkDependency> =
    D extends CyclicItem ? SimplifyDep_CyclicItem<D> :
    D extends Cyclic<infer D2> ? Cyclic<SimplifyDep_CyclicItem<D2>> :
    D extends FailOn<infer D2, infer Fl> ? FailOn<
        SimplifyDep_CyclicItem<D2>,
        SimplifyDep_CyclicItem<Fl>
    > :
    D

export type SimplifyDep_List<D extends any[]> =
    D extends readonly [] ? [] :
    D extends readonly [infer A, ...infer B] ? [SimplifyDep<A>, ...SimplifyDep_List<B>] :
    D extends readonly (infer A)[] ? SimplifyDep<A>[] :
    never

export type SimplifyDep<D> =
    D extends OkDependency ? SimplifyDep_Ok<D> :
    D extends NotSync<infer D2 extends BaseResource> ? NotSync<SimplifyDep_BaseResource<D2>> :
    D extends CycleDetected<infer D2> ? CycleDetected<SimplifyDep_BaseResource<GetBaseResource<D2>>> :
    D extends Trace<infer X> ? Trace<SimplifyDep<X>> :
    D extends any[] ? SimplifyDep_List<D> :
    TryInstanceType<D>

type PairsOf<P extends ProvideGraph> = P['pairs']
type KeysOf<P extends ProvideGraph> = PairsOf<P>['key']
