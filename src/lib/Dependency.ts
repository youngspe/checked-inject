import { Scope } from './Scope'
import { UnableToResolve, UnableToResolveIsSync } from './DependencyKey'
import { PrivateConstruct } from './_internal'
import { BaseTypeKey, HasTypeKeySymbol } from './TypeKey'
import { InjectableClass } from './InjectableClass'

const _isSyncSymbol = Symbol()

export interface IsSync<out K extends BaseTypeKey<any> | InjectableClass<any>> {
    [_isSyncSymbol]: K
}
const _notSyncSymbol = Symbol()

export interface NotSync<out K extends BaseTypeKey<any> | InjectableClass<any>> {
    [_notSyncSymbol]: K
}

export type RequireSync<D extends Dependency> = D extends BaseTypeKey | InjectableClass ? IsSync<D> : never

export type Dependency =
    | Scope
    | HasTypeKeySymbol<any>
    | IsSync<any>
    | NotSync<any>
    | PrivateConstruct
    | UnableToResolve<any>
    | UnableToResolveIsSync<any>
