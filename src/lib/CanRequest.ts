import { Dependency, IsSync, FailedDependency, CyclicDependency, Missing, InSub, In, WrapIn, ApplyCyclic, DetectCycles, ShouldDetectCycles, BaseResource, ToCyclic, SimpleDependency, CyclicItem, OkDependency } from './Dependency'
import { DependencyKey, DepsOf, NotDistinct, IsSyncDepsOf, UnableToResolve } from './DependencyKey'
import { ChildGraph, DepPair, FlatGraph, GraphPairs, Merge, ProvideGraph, WithScope } from './ProvideGraph'
import { Scope } from './Scope'
import { BaseTypeKey, KeyWithDefault, KeyWithoutDefault } from './TypeKey'

type UseCycleDetection<G extends ProvideGraph, D extends Dependency> =
    ShouldDetectCycles extends AllKeys<G> ? DetectCycles<D> :
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
> = ([UnresolvedKeys<P, K, Sync>] extends [infer E] ? ([E] extends [never] ? unknown : RequestFailed<E>) : never)

type GraphWithKeys<K extends Dependency> =
    | FlatGraph<K extends any ? DepPair<K, any> : never>
    | ChildGraph<GraphWithKeys<K>, K extends any ? DepPair<K, any> : never>

type AllKeys<P extends ProvideGraph> = P extends GraphWithKeys<infer K> ? K : never

type _FindGraphWithDep<P extends ProvideGraph, D extends Dependency> = Extract<KeysOf<P>, D> extends never ? (
    P extends ChildGraph<infer Parent> ? _FindGraphWithDep<Parent, D> : never
) : P

type ExcludeBroad<D extends Dependency> = D extends Extract<Dependency, D> ? never : D

type FindGraphWithDep<P extends ProvideGraph, D extends Dependency> = _FindGraphWithDep<P, ExcludeBroad<D>>
type IntersectKeyOf<P extends ProvideGraph, D extends Dependency> = Extract<KeysOf<P>, ExcludeBroad<D>>

type CheckHasScopes<G extends ProvideGraph, Scp extends Scope> = Scp extends AllKeys<G> ? never : Missing<Scp>

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
    PCurrent extends ProvideGraph = PRoot,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> =
    K extends KeysOf<PCurrent> ? (Pairs extends DepPair<K, infer D> ? (
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
    UnableToResolve<['DepsForKeyIsSync', K]>

type DepsForKeySimpleDep<
    P extends ProvideGraph,
    K extends SimpleDependency,
> =
    K extends KeyWithoutDefault ? Missing<K> :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKeyScoped<P, K, D, true> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<P, K2, K> :
    Missing<K>

type DepsForKeyCyclicItem<G extends ProvideGraph, K extends CyclicItem> =
    K extends InSub<any, never> ? never :
    K extends InSub<infer GSub, infer D> ? WrapIn<Merge<G, GSub>, D> :
    K extends In<infer G2, infer D> ? WrapIn<G2, DepsForKeySimpleDep<G2, D>> :
    K extends SimpleDependency ? DepsForKeySimpleDep<G, K> :
    never

type _DepsForKeyStep<
    G extends ProvideGraph,
    K extends Dependency,
> =
    K extends FailedDependency ? K :
    Dependency extends K ? UnableToResolve<['DepsForKey', K]> :
    K extends AllKeys<G> ? DepsForKeyTransitive<G, K> :
    K extends CyclicDependency<infer K2, infer C, infer E> ? ToCyclic<
        ApplyCyclic<DepsForKeyCyclicItem<G, K2>, C, E>,
        C,
        E
    > :
    K extends CyclicItem ? DepsForKeyCyclicItem<G, K> :
    Missing<K>

type DepsForKeyStep<
    P extends ProvideGraph,
    K extends Dependency,
> = _DepsForKeyStep<P, ValidateDep<K>>

type DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> = [K] extends [FailedDependency] ? K : DepsForKey<P, DepsForKeyStep<P, UseCycleDetection<P, K>>>

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
