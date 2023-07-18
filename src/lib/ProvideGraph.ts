
// Dependency pair

import { Container } from "./Container"
import { Dependency, IsSync } from "./Dependency"
import { Scope, ScopeList, Singleton } from "./Scope"

/** @internal */
export interface DepPair<out K extends Dependency, D extends Dependency> {
    deps: D
    key: K
}

/** @internal */
export interface WithScope<Scp extends Scope> {
    scope: ScopeList<Scp>
}

/** @internal */
export interface GraphPairs extends DepPair<Dependency, any> { }

interface BaseProvideGraph<Pairs extends GraphPairs = GraphPairs> {
    pairs: Pairs
}

/** @internal */
export interface FlatGraph<Pairs extends GraphPairs = GraphPairs> extends BaseProvideGraph<Pairs> { }

export type DefaultGraph<S extends Scope = never> = FlatGraph<
    | DepPair<typeof Singleton, never>
    | DepPair<typeof Container.Key, never>
    | DepPair<IsSync<typeof Container.Key>, never>
    | (S extends any ? DepPair<S, never> : never)
>

export interface ChildGraph<
    out Parent extends ProvideGraph,
    Pairs extends GraphPairs = GraphPairs,
> extends BaseProvideGraph<Pairs> {
    parent: Parent
}

export type ProvideGraph<Pairs extends GraphPairs = GraphPairs> =
    | FlatGraph<Pairs>
    | ChildGraph<ProvideGraph, Pairs>

type MergePairs<Old extends GraphPairs, New extends GraphPairs> = Exclude<Old, DepPair<New['key'], any>> | New

/** @internal */
export type Merge<Old extends ProvideGraph, New extends ProvideGraph> =
    New extends ChildGraph<infer Parent, infer Pairs> ? ChildGraph<Merge<Old, Parent>, Pairs> :
    New extends FlatGraph<infer Pairs> ? Provide<Old, Pairs> :
    never

/** @internal */
export type Provide<P extends ProvideGraph, Pairs extends GraphPairs> =
    P extends ChildGraph<infer Parent, infer OldPairs> ? ChildGraph<Parent, MergePairs<OldPairs, Pairs>> :
    P extends FlatGraph<infer OldPairs> ? FlatGraph<MergePairs<OldPairs, Pairs>> :
    never
