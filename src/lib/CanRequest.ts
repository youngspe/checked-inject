import { Dependency, IsSync, FailedDependency, CyclicDependency, ToCyclic, Missing, SubcomponentResolve, In, WrapIn, ApplyCyclic, DetectCycles, ShouldDetectCycles, Naught, BaseResource } from './Dependency'
import { DependencyKey, DepsOf, NotDistinct, IsSyncDepsOf, UnableToResolve } from './DependencyKey'
import { InjectableClass } from './InjectableClass'
import { ChildGraph, DepPair, FlatGraph, GraphPairs, Merge, ProvideGraph, WithScope } from './ProvideGraph'
import { Scope } from './Scope'
import { BaseTypeKey, KeyWithDefault, KeyWithoutDefault } from './TypeKey'
import { ExtractInvariant, Invariant, SpreadInvariant } from './_internal'

export type UseCycleDetection<G extends ProvideGraph, D extends Dependency> =
    Invariant<ShouldDetectCycles> extends AllKeysInvariant<G> ? DetectCycles<D> : D

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

export type AllKeysInvariant<G extends ProvideGraph> =
    | (PairsOf<G> extends infer Pair extends GraphPairs ? (
        Pair extends any ? Invariant<Pair['key']> : never
    ) : never)
    | (G extends ChildGraph<infer Parent, infer _> ? AllKeysInvariant<Parent> : never)
export type AllKeys<G extends ProvideGraph> =
    | PairsOf<G>['key']
    | (G extends ChildGraph<infer Parent, infer _> ? AllKeys<Parent> : never)

type _FindGraphWithDep<P extends ProvideGraph, D extends Dependency> = ExtractInvariant<KeysOfInvariant<P>, D> extends never ? (
    P extends ChildGraph<infer Parent> ? _FindGraphWithDep<Parent, D> : never
) : P

type ExcludeBroad<D extends Dependency> = D extends Extract<Dependency, D> ? never : D

type FindGraphWithDep<P extends ProvideGraph, D extends Dependency> = _FindGraphWithDep<P, ExcludeBroad<D>>
type IntersectKeyOf<P extends ProvideGraph, D extends Dependency> = ExtractInvariant<KeysOfInvariant<P>, ExcludeBroad<D>>

type CheckHasScopes<G extends ProvideGraph, Scp extends Scope> =
    Scp extends AllKeys<G> ? never : Missing<Scp>

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
    PCurrent extends ProvideGraph = PRoot,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> =
    Invariant<K> extends KeysOfInvariant<PCurrent> ? (Pairs extends DepPair<K, infer D> ? (
        Pairs extends WithScope<infer Scp> ? (
            CheckHasScopes<PRoot, Scp> extends infer HS extends Dependency ? (
                [HS] extends [never] ? (
                    IntersectKeyOf<PRoot, Scp | K> extends never ? WrapIn<FindGraphWithDep<PRoot, Scp | K>, D> :
                    D
                ) : HS) : D
        ) : never
    ) : never) :
    PCurrent extends ChildGraph<infer Parent> ? DepsForKeyTransitive<PRoot, K, Parent> :
    UnableToResolve<['DepsForKeyTransitive', K]>

type _DepsForKeyScoped<G extends ProvideGraph, Scp extends Scope, D extends Dependency> =
    [Scp] extends never ? D :
    CheckHasScopes<G, Scp> extends infer HS extends Dependency ? ([HS] extends [never] ? (
        IntersectKeyOf<G, Scp> extends never ? WrapIn<FindGraphWithDep<G, Scp>, Scp | D> :
        D | Scp
    ) : HS) :
    never

type DepsForKeyScoped<P extends ProvideGraph, K, D extends Dependency> =
    K extends WithScope<infer Scp> ? _DepsForKeyScoped<P, ExcludeBroad<Scp>, D> :
    D

type DepsForKeyIsSync<
    P extends ProvideGraph,
    K2 extends BaseResource,
    K extends IsSync<K2>,
> =
    K2 extends Naught | KeyWithoutDefault ? never :
    K2 extends KeyWithDefault<infer _T, any, infer Sync> ? DepsForKeyScoped<P, K2, Sync> :
    UnableToResolve<['DepsForKeyIsSync', K]>

type DepsForKeyFallback<
    P extends ProvideGraph,
    K extends Dependency,
> =
    K extends KeyWithoutDefault ? Missing<K> :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKeyScoped<P, K, D> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<P, K2, K> :
    K extends CyclicDependency<infer K2, infer C, infer E> ? ApplyCyclic<DepsForKeyStep<P, K2>, C, E> :
    Missing<K>

type _DepsForKeyStep<
    P extends ProvideGraph,
    K extends Dependency,
> =
    Dependency extends K ? UnableToResolve<['DepsForKey', K]> :
    K extends SubcomponentResolve<any, never> ? never :
    K extends SubcomponentResolve<infer GSub, infer D> ? SubcomponentResolve<GSub, DepsForKeyStep<Merge<P, GSub>, D>> :
    K extends In<infer G2, infer D> ? WrapIn<G2, DepsForKeyStep<G2, D>> :
    Invariant<K> extends AllKeysInvariant<P> ? DepsForKeyTransitive<P, K> :
    DepsForKeyFallback<P, K>

type DepsForKeyStep<
    P extends ProvideGraph,
    K extends Dependency,
> =
    K extends Naught | FailedDependency ? never :
    _DepsForKeyStep<P, ValidateDep<K>>

type DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> = [K] extends [FailedDependency] ? K : (
    | DepsForKey<P, DepsForKeyStep<P, UseCycleDetection<P, K>>>
    | (K extends FailedDependency ? K : never)
)

type ValidateDep<D extends Dependency> =
    D extends BaseTypeKey | Scope ? (
        // if keyTag is a symbol it's a valid TypeKey
        D extends { readonly keyTag: symbol } | { readonly scopeTag: symbol } ? D :
        // if D's instance type has no private fields it is not guaranted to be distinct
        D extends { prototype: infer P } ? ({ [X in keyof P]: P[X] } extends P ? NotDistinct<D> : D) :
        NotDistinct<D>
    ) :
    D

type PairsOf<G extends ProvideGraph> = G['pairs']
type KeysOfInvariant<G extends ProvideGraph> = PairsOf<G> extends infer Pair extends GraphPairs ? (
    Pair extends any ? Invariant<Pair['key']> : never
) : never
