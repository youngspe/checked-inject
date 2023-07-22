import { Dependency, IsSync } from "./Dependency"
import { DependencyKey, DepsOf, NotDistinct, IsSyncDepsOf, UnableToResolve } from "./DependencyKey"
import { InjectableClass } from "./InjectableClass"
import { ChildGraph, DepPair, FlatGraph, GraphPairs, ProvideGraph, WithScope } from "./ProvideGraph"
import { Scope } from "./Scope"
import { BaseTypeKey, KeyWithDefault, KeyWithoutDefault } from "./TypeKey"

type UnresolvedKeys<
    P extends ProvideGraph,
    K extends DependencyKey,
    Sync extends Dependency = IsSyncDepsOf<K>,
> = DepsForKey<P, DepsOf<K> | Sync>

export const unresolved = Symbol()

interface RequestFailed<K> {
    [unresolved]: [(K extends any ? [K] : never)[0]]
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

type _DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
    PCurrent extends ProvideGraph = PRoot,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> = K extends any ? (
    K extends KeysOf<PCurrent> ? (Pairs extends DepPair<K, infer D> ? DepsForKey<
        Pairs extends WithScope<infer Scp> ? FindGraphWithDep<PRoot, Scp | K> : PRoot,
        D
    > : never) :
    PCurrent extends ChildGraph<infer Parent> ? _DepsForKeyTransitive<PRoot, K, Parent> :
    UnableToResolve<['DepsForKeyTransitive', K, AllKeys<PRoot>]>
) : never

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
> = K extends any ? _DepsForKeyTransitive<PRoot, K> : never

type DepsForKeyScoped<P extends ProvideGraph, K, D extends Dependency> =
    K extends WithScope<infer Scp> ? DepsForKey<FindGraphWithDep<P, Scp>, Scp | D> :
    DepsForKey<P, D>

type DepsForKeyIsSync<
    P extends ProvideGraph,
    K2 extends InjectableClass | BaseTypeKey,
    K extends IsSync<K2>,
> =
    K2 extends PairsOf<P> ? K :
    K2 extends KeyWithoutDefault ? never :
    K2 extends KeyWithDefault<infer _T, any, infer Sync> ? DepsForKeyScoped<P, K, Sync> :
    UnableToResolve<['DepsForKeyIsSync', K]>

type DepsForKeyFallback<
    P extends ProvideGraph,
    K extends Dependency,
> =
    K extends KeyWithoutDefault ? K :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKeyScoped<P, K, D> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<P, K2, K> :
    K

type _DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> =
    Dependency extends K ? UnableToResolve<['DepsForKey', K]> :
    K extends AllKeys<P> ? DepsForKeyTransitive<P, K> :
    DepsForKeyFallback<P, K>

type DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> = K extends any ? _DepsForKey<P, ValidateDep<K>> : never

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
