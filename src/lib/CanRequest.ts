import { Dependency, IsSync, FailedDependency, CyclicDep, Missing, Sub, In, WrapIn, ApplyCyclic, DetectCycles, ShouldDetectCycles, BaseResource, WrapCyclic, SimpleDependency, CyclicItem, OkDependency, InItem, WrapSub, SubItem, InChecked } from './Dependency'
import { DependencyKey, DepsOf, NotDistinct, IsSyncDepsOf, UnableToResolve, Trace } from './DependencyKey'
import { ChildGraph, DepPair, EdgeSource, FlatGraph, GraphPairs, Merge, ProvideGraph, WithScope } from './ProvideGraph'
import { Scope } from './Scope'
import { BaseTypeKey, KeyWithDefault, KeyWithoutDefault } from './TypeKey'

type UseCycleDetection<CheckCycles extends boolean, D extends Dependency> =
    [CheckCycles] extends [true] ? DetectCycles<D> :
    D

type UnresolvedKeys<
    P extends ProvideGraph,
    K extends DependencyKey,
    Sync extends Dependency = IsSyncDepsOf<K>,
> = DepsForKey<P, DepsOf<K> | Sync> extends infer D ? D extends Missing<infer X> ? X : D : never

export const unresolved = Symbol()

/** @ignore */
export interface RequestFailed<in out K> {
    [unresolved]: (K extends any ? [K] : never)[0]
}

export type CanRequest<
    P extends ProvideGraph,
    K extends DependencyKey,
    Sync extends Dependency = IsSyncDepsOf<K>,
> = (UnresolvedKeys<P, K, Sync> extends infer E ? ([E] extends [never] ? unknown : RequestFailed<E>) : never)

type GraphWithKeys<K extends EdgeSource> =
    | FlatGraph<K extends any ? DepPair<K, any> : never>
    | ChildGraph<GraphWithKeys<K>, K extends any ? DepPair<K, any> : never>

export type AllKeys<P extends ProvideGraph> = P extends GraphWithKeys<infer K> ? K : never

type _FindGraphWithDep<P extends ProvideGraph, D extends SimpleDependency | Scope> =
    P extends ChildGraph<infer Parent> ? (
        (D extends KeysOf<P> ? never : false) extends true ? P : _FindGraphWithDep<Parent, D>
    ) : P

type ExcludeBroad<D extends Dependency> = D extends Extract<Dependency, D> ? never : D

type FindGraphWithDep<P extends ProvideGraph, D extends SimpleDependency | Scope> = _FindGraphWithDep<P, ExcludeBroad<D>>
type IntersectKeyOf<P extends ProvideGraph, D extends Dependency> = Extract<KeysOf<P>, ExcludeBroad<D>>

type CheckHasScopes<G extends ProvideGraph, Scp extends Scope> = Scp extends AllKeys<G> ? never : Missing<Scp>

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends SimpleDependency,
    PCurrent extends ProvideGraph = PRoot,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> =
    K extends Pairs['key'] ? (Pairs extends DepPair<K, infer D> ? (
        Pairs extends WithScope<infer Scp> ? (
            CheckHasScopes<PRoot, Extract<Scp, D>> extends infer HS extends Dependency ? (
                [HS] extends [never] ? (
                    IntersectKeyOf<PRoot, Scp | K> extends never ? WrapIn<FindGraphWithDep<PRoot, Scp | K>, D> :
                    WrapIn<PRoot, D>
                ) : HS) : never
        ) : D
    ) : never) :
    PCurrent extends ChildGraph<infer Parent> ? DepsForKeyTransitive<PRoot, K, Parent> :
    UnableToResolve<['DepsForKeyTransitive', K]>

type _DepsForKeyScoped<
    G extends ProvideGraph,
    Scp extends Scope,
    D extends Dependency,
    RequireScopeFilter extends Scope,
> =
    [Scp] extends never ? D :
    CheckHasScopes<G, Extract<Scp, RequireScopeFilter>> extends infer HS extends Dependency ? ([HS] extends [never] ? (
        IntersectKeyOf<G, Scp> extends never ? WrapIn<FindGraphWithDep<G, Scp>, D> :
        WrapIn<G, D>
    ) : HS) :
    never

type DepsForKeyScoped<
    G extends ProvideGraph,
    K,
    D extends Dependency,
    // Pass true iff the scopes of `K` should be required dependencies
    // Pass false to only use them to locate the correct ancestor graph
    RequireScope extends boolean,
> =
    K extends WithScope<infer Scp> ? _DepsForKeyScoped<G, ExcludeBroad<Scp>, D, RequireScope extends true ? Scope : never> :
    D

type DepsForKeyIsSync<
    P extends ProvideGraph,
    K2 extends BaseResource,
    K extends IsSync<K2>,
> =
    K2 extends KeyWithoutDefault ? never :
    K2 extends KeyWithDefault<infer _T, any, infer Sync> ? DepsForKeyScoped<P, K2, Sync, false> :
    // The above cases should have handled all BaseResource values
    UnableToResolve<['DepsForKeyIsSync', K]>

type DepsForKeySimpleDep<
    G extends ProvideGraph,
    K extends SimpleDependency,
> =
    [K] extends [Extract<SimpleDependency, K>] ? UnableToResolve<['KeyTooBroad', K]> :
    K extends AllKeys<G> ? DepsForKeyTransitive<G, K> :
    K extends KeyWithoutDefault ? Missing<K> :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKeyScoped<G, K, D, true> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<G, K2, K> :
    // The above cases should have handled all SimpleDendency values
    UnableToResolve<['DepsForKeySimpleDep', K]>

type DepsForKeyInItem<G extends ProvideGraph, K extends InItem> =
    K extends SimpleDependency ? DepsForKeySimpleDep<G, K> :
    K extends Sub<infer GSub, infer D> ? InChecked<Merge<G, GSub>, D> :
    UnableToResolve<['DepsForKeyInItem', K]>

type DepsForKeyCyclicItem<G extends ProvideGraph, K extends CyclicItem> =
    K extends InItem ? DepsForKeyInItem<G, K> :
    K extends In<infer G2, infer D> ? WrapIn<G2, DepsForKeyInItem<G2, D>> :
    UnableToResolve<['DepsForKeyCyclicItem', K]>

type _DepsForKeyStep<
    G extends ProvideGraph,
    K extends Dependency,
    _K extends Dependency = K,
> = Extract<K, Trace<any[] & { length: 10 }>> extends never ? (
    K extends Trace<infer X> ? Trace<readonly [...X, Exclude<_K, Trace>]> :
    K extends FailedDependency ? K :
    K extends CyclicItem ? DepsForKeyCyclicItem<G, K> :
    K extends CyclicDep<infer K2, infer C, infer E> ? WrapCyclic<
        ApplyCyclic<DepsForKeyCyclicItem<G, K2>, C, E>,
        C,
        E
    > :
    K extends Scope ? never :
    UnableToResolve<['DepsForKeyStep', K]>
) : Extract<K, Trace>

type DepsForKeyStep<
    P extends ProvideGraph,
    K extends Dependency,
> = _DepsForKeyStep<P, ValidateDep<K>>

type DepsForKey<
    G extends ProvideGraph,
    K extends Dependency,
    CheckCycles extends boolean = ShouldDetectCycles extends AllKeys<G> ? true : false,
> = [K] extends [FailedDependency] ? K : DepsForKey<G, DepsForKeyStep<G, UseCycleDetection<CheckCycles, K>>>

type ValidateDep<D extends Dependency> =
    D extends BaseTypeKey | Scope ? (
        // if keyTag is a symbol it's a valid TypeKey
        D extends { readonly keyTag: symbol } | { readonly scopeTag: symbol } ? D :
        // if D's instance type has no private fields it is not guaranted to be distinct
        D extends { prototype: infer P } ? ({ [X in keyof P]: P[X] } extends P ? NotDistinct<D> : D) :
        NotDistinct<D>
    ) :
    D

type PairsOf<P extends ProvideGraph> = P['pairs']
type KeysOf<P extends ProvideGraph> = PairsOf<P>['key']
