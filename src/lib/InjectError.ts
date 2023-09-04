import { TypeKey } from './TypeKey'
import { ScopeList } from './Scope'
import { DependencyKey } from './DependencyKey'


/** Represents a possible error when resolving a dependency. */
export abstract class InjectError extends Error { }

/** Error thrown when requesting a TypeKey whose value was not provided. */
export class TypeKeyNotProvidedError extends InjectError {
    readonly key: TypeKey
    constructor(key: TypeKey) {
        super(`TypeKey ${key.fullName} not provided`)
        this.key = key
    }
}

/** Error thrown when requesting a TypeKey whose value was not provided. */
export class DependencyNotSyncError extends InjectError {
    readonly key?: DependencyKey
    constructor(key?: DependencyKey) {
        super('Dependency not provided synchronously')
        this.key = key
    }
}

function wrapMessage(err: InjectError) {
    return err instanceof InjectPropertyError ? err.message : `(${err.message})`
}

/** Error thrown when a dependency's dependency has failed to resolve. */
export class DependencyFailedError extends InjectError {
    constructor(public readonly cause: InjectError) {
        super(`Dependency failed: ${wrapMessage(cause)}`)
    }
}

/** Error thrown when a member of a structured dependency key failed to resolve. */
export class InjectPropertyError extends InjectError {
    constructor(public readonly childErrors: { [K in keyof any]?: InjectError }) {
        super([
            '{',
            ...Object
                .getOwnPropertyNames(childErrors)
                .flatMap(e => childErrors[e] ? `${e}: ${childErrors[e]?.message},`.split('\n') : [])
                .map(l => `  ${l}`),
            '}',
        ].join('\n'))
        this.childErrors = childErrors
    }
}

export class DependencyCycleError extends InjectError {
    constructor(public readonly key: TypeKey) {
        super(`Dependency cycle while resolving ${key.fullName}`)
    }
}

/** Error thrown when a dependency is bound to a {@link Scope:type | Scope} that is unavailable. */
export class ScopeUnavailableError extends InjectError {
    constructor(public readonly scope: ScopeList) {
        const message = `Scope ${ScopeList.flatten(scope).map(s => s.fullName).join('|')} unavailable`
        super(message)
    }
}
