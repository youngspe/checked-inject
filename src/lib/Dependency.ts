import { Scope } from './Scope'
import { NotDistinct, UnableToResolve, UnableToResolveIsSync } from './DependencyKey'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, TypeKey } from './TypeKey'
import { InjectableClass } from './InjectableClass'

/** @ignore */
export type BaseResource<T = any> = BaseTypeKey<T> | InjectableClass<T>

const _isSyncSymbol = Symbol()

/** @ignore */
export abstract class IsSync<out K extends BaseResource> {
    private [_isSyncSymbol]!: K
    private constructor() { }
}
const _notSyncSymbol = Symbol()

/** @ignore */
export abstract class NotSync<out K extends BaseResource> {
    private [_notSyncSymbol]!: K
    private constructor() { }
}

/** @ignore */
export type RequireSync<D extends Dependency> = D extends BaseResource ? IsSync<D> : never

const _cyclicDependencySymbol = Symbol()

/** @ignore */
export abstract class CyclicDependency<
    out K extends BaseResource,
    out C extends BaseResource = K,
> {
    [_cyclicDependencySymbol]!: [K, C]
}

type _ToCyclic<D extends BaseResource, C extends BaseResource> =
    [D] extends [never] ? never :
    [C] extends [never] ? D :
    CyclicDependency<D, C>

/** @ignore */
export type ToCyclic<D extends Dependency, C extends BaseResource = Extract<D, BaseResource>> =
    | _ToCyclic<Extract<D, BaseResource>, C>
    | (
        D extends BaseResource ? never :
        D extends CyclicDependency<infer K, infer C2> ? _ToCyclic<Exclude<K, C>, C | C2> :
        D
    )

const _scopedSymbol = Symbol()

/** @ignore */
export abstract class Missing<K extends Dependency> {
    [_scopedSymbol]!: [K]
}

/**
 * A low-level dependency for a {@link DependencyKey}.
 * Generally, you won't need to interact with this type much.
 * It includes {@link Scope:type | Scope}, {@link TypeKey:type | TypeKey}, and {@link InjectableClass}.
 *
 * @group Dependencies
 */
export type Dependency =
    | Scope
    | BaseTypeKey
    | IsSync<any>
    | PrivateConstruct
    | CyclicDependency<any, any>
    | FailedDependency

export type FailedDependency =
    | Missing<any>
    | UnableToResolve<any>
    | UnableToResolveIsSync<any>
    | NotDistinct<any>
    | NotSync<any>
