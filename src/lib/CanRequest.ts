import { Dependency, IsSync, FailedDependency, CyclicDependency, ToCyclic, Missing, SubcomponentResolve } from "./Dependency"
import { DependencyKey, DepsOf, NotDistinct, IsSyncDepsOf, UnableToResolve } from "./DependencyKey"
import { InjectableClass } from "./InjectableClass"
import { ChildGraph, DepPair, FlatGraph, GraphPairs, Merge, ProvideGraph, WithScope } from "./ProvideGraph"
import { Scope } from "./Scope"
import { BaseTypeKey, KeyWithDefault, KeyWithoutDefault } from "./TypeKey"


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

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
    PCurrent extends ProvideGraph = PRoot,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> =
    K extends KeysOf<PCurrent> ? (Pairs extends DepPair<K, infer D> ? (
        Pairs extends WithScope<infer Scp> ? (
            IntersectKeyOf<PRoot, Scp | K> extends never ? DepsForKey<FindGraphWithDep<PRoot, Scp | K>, D> : D
        ) : D
    ) : never) :
    PCurrent extends ChildGraph<infer Parent> ? DepsForKeyTransitive<PRoot, K, Parent> :
    UnableToResolve<['DepsForKeyTransitive', K]>

type DepsForKeyScoped<P extends ProvideGraph, K, D extends Dependency> =
    K extends WithScope<infer Scp> ? (
        [Scp] extends never ? D :
        Scope extends Scp ? D :
        IntersectKeyOf<P, Scp> extends never ? DepsForKey<FindGraphWithDep<P, Scp>, Scp | D> : D | Scp
    ) : D

type DepsForKeyIsSync<
    P extends ProvideGraph,
    K2 extends InjectableClass | BaseTypeKey,
    K extends IsSync<K2>,
> =
    K2 extends AllKeys<P> ? Missing<K> :
    K2 extends KeyWithoutDefault ? never :
    K2 extends KeyWithDefault<infer _T, any, infer Sync> ? DepsForKeyScoped<P, K2, Sync> :
    UnableToResolve<['DepsForKeyIsSync', K]>

type DepsForKeyFallback<
    P extends ProvideGraph,
    K extends Dependency,
> =
    K extends KeyWithoutDefault ? Missing<K> :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKeyScoped<P, K, D> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<P, K2, K> :
    K extends CyclicDependency<infer K2, infer C> ? ToCyclic<DepsForKeyStep<P, K2>, C> :
    Missing<K>

type _DepsForKeyStep<
    P extends ProvideGraph,
    K extends Dependency,
> =
    Dependency extends K ? UnableToResolve<['DepsForKey', K]> :
    K extends SubcomponentResolve<infer GSub, infer D> ? DepsForKey<Merge<P, GSub>, D> :
    K extends AllKeys<P> ? DepsForKeyTransitive<P, K> :
    DepsForKeyFallback<P, K>

type DepsForKeyStep<
    P extends ProvideGraph,
    K extends Dependency,
> =
    K extends FailedDependency ? never :
    _DepsForKeyStep<P, ValidateDep<K>>

type DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> = [K] extends [FailedDependency] ? K : (
    | DepsForKey<P, DepsForKeyStep<P, K>>
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

type PairsOf<P extends ProvideGraph> = P['pairs']
type KeysOf<P extends ProvideGraph> = PairsOf<P>['key']
