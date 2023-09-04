
// Dependency pair

import { BaseResource, IsSync } from './Dependency'
import { Scope, ScopeList } from './Scope'

export type EdgeSource =
    | BaseResource
    | Scope
    | IsSync<any>

/** @ignore */
export declare abstract class DepPair<out K extends EdgeSource, D> {
    private _depPair: any
    deps: D
    key: K
}

/** @ignore */
export interface WithScope<Scp extends Scope> {
    readonly scope: ScopeList<Scp> | (() => ScopeList<Scp>)
}

/** @ignore */
export interface GraphPairs extends DepPair<any, any> { }

/** @ignore */
export declare abstract class ProvideGraph {
    private _graph: any
    parent?: ProvideGraph
    pairs: GraphPairs
}

export declare abstract class FlatGraph<Pairs extends GraphPairs = any> extends ProvideGraph {
    private _flat: any
    parent?: never
    pairs: Pairs
}

export declare abstract class ChildGraph<
    out Parent extends ProvideGraph,
    Pairs extends GraphPairs = any,
> extends ProvideGraph {
    private _child: any
    pairs: Pairs
    parent: Parent
}

type MergePairs<Old extends GraphPairs, New extends GraphPairs> = Exclude<Old, DepPair<New['key'], any>> | New

/** @ignore */
export type Merge<Old extends ProvideGraph, New extends ProvideGraph> =
    New extends ChildGraph<infer Parent, infer Pairs> ? ChildGraph<Merge<Old, Parent>, Pairs> :
    Old extends FlatGraph<never> ? New :
    New extends FlatGraph<infer Pairs> ? Provide<Old, Pairs> :
    never

/** @ignore */
export type Provide<P extends ProvideGraph, Pairs extends GraphPairs> =
    P extends ChildGraph<infer Parent, infer OldPairs> ? ChildGraph<Parent, MergePairs<OldPairs, Pairs>> :
    P extends FlatGraph<never> ? FlatGraph<Pairs> :
    P extends FlatGraph<infer OldPairs> ? FlatGraph<MergePairs<OldPairs, Pairs>> :
    never
