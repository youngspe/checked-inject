import { TypeKey } from './TypeKey';
import { ScopeList } from './Scope';
import { DependencyKey } from './DependencyKey';

/** Represents a possible error when resolving a dependency. */

export abstract class InjectError extends Error { }
/** Error thrown when requeting a TypeKey whose value was not provided. */

export class TypeKeyNotProvidedError extends InjectError {
    readonly key: TypeKey;
    constructor(key: TypeKey) {
        super(key.name ? `TypeKey ${key.name} not provided.` : 'TypeKey not provided.');
        this.key = key;
    }
}
/** Error thrown when requeting a TypeKey whose value was not provided. */

export class DependencyNotSyncError extends InjectError {
    readonly key?: DependencyKey;
    constructor(key?: DependencyKey) {
        super('Dependency not provided synchronously.');
        this.key = key;
    }
}
/** Error thrown when a dependency's dependency has failed to resolve. */

export class DependencyFailedError extends InjectError {
    readonly cause: InjectError;

    constructor(cause: InjectError) {
        super(`Dependency failed: ${cause.message}`);
        this.cause = cause;
    }
}
/** Error thrown when a member of a structured dependency key failed to resolve. */

export class InjectPropertyError extends InjectError {
    readonly childErrors: {
        [K in keyof any]?: InjectError;
    };
    constructor(childErrors: {
        [K in keyof any]?: InjectError;
    }) {
        super([
            '{',
            ...Object
                .getOwnPropertyNames(childErrors)
                .flatMap(e => `${e}: ${childErrors[e]?.message?.split('\n')},`)
                .map(l => `  ${l}`),
            '}',
        ].join('\n'));
        this.childErrors = childErrors;
    }
}

export class ScopeUnavailableError extends InjectError {
    readonly scope: ScopeList;
    constructor(scope: ScopeList) {
        const message = `Scope ${ScopeList.flatten(scope).map(s => s.name ?? '<unnamed>').join('|')} unavailable`;
        super(message);
        this.scope = scope;
    }
}
