
// Dependency pair

import { Dependency } from './Dependency'
import { Scope, ScopeList } from './Scope'
import { Invariant, SpreadInvariant } from './_internal'

/** @ignore */
export interface DepPair<in out K extends Dependency, D extends Dependency> {
    deps: D
    key: K
}

/** @ignore */
export interface WithScope<Scp extends Scope> {
    readonly scope: ScopeList<Scp> | (() => ScopeList<Scp>)
}

/** @ignore */
export interface GraphPairs extends DepPair<any, any> { }

interface BaseProvideGraph<Pairs extends GraphPairs = GraphPairs> {
    pairs: Pairs
}

/** @ignore */
export interface FlatGraph<Pairs extends GraphPairs = GraphPairs> extends BaseProvideGraph<Pairs> { }

export interface ChildGraph<
    out Parent extends ProvideGraph,
    Pairs extends GraphPairs = GraphPairs,
> extends BaseProvideGraph<Pairs> {
    parent: Parent
}

export type ProvideGraph<Pairs extends GraphPairs = GraphPairs> =
    | FlatGraph<Pairs>
    | ChildGraph<ProvideGraph, Pairs>

type MergePairs<Old extends GraphPairs, New extends GraphPairs> =
    | New
    | (Old extends any ? (
        Invariant<Old['key']> extends SpreadInvariant<New['key']> ? never : Old
    ) : never)

/** @ignore */
export type Merge<Old extends ProvideGraph, New extends ProvideGraph> =
    & (
        New extends ChildGraph<infer Parent, infer Pairs> ? ChildGraph<Merge<Old, Parent>, Pairs> :
        New extends FlatGraph<infer Pairs> ? Provide<Old, Pairs> :
        never
    )

/** @ignore */
export type Provide<P extends ProvideGraph, Pairs extends GraphPairs> =
    & (
        P extends ChildGraph<infer Parent, infer OldPairs> ? ChildGraph<Parent, MergePairs<OldPairs, Pairs>> :
        P extends FlatGraph<infer OldPairs> ? FlatGraph<MergePairs<OldPairs, Pairs>> :
        never
    )
