import { AbstractKey, BaseKey, DependencyKey, TypeKey } from "."

/** Represents a possible error when resolving a dependency. */
export abstract class InjectError extends Error { }

/** Error thrown when requeting a TypeKey whose value was not provided. */
export class TypeKeyNotProvidedError extends InjectError {
    constructor() {
        super('TypeKey not provided.')
    }
}

/** Error thrown when a dependency's dependency has failed to resolve. */
export class DependencyFailedError extends InjectError {
    readonly cause: InjectError

    constructor(cause: InjectError) {
        super(`Dependency failed: ${cause.message}`)
        this.cause = cause
    }
}

/** Error thrown when a member of a structured dependency key failed to resolve. */
export class InjectPropertyError extends InjectError {
    readonly childErrors: { [K in keyof any]?: InjectError }
    constructor(childErrors: { [K in keyof any]?: InjectError }) {
        super([
            '{',
            ...Object
                .getOwnPropertyNames(childErrors)
                .flatMap(e => `${e}: ${childErrors[e]?.message?.split('\n')},`)
                .map(l => `  ${l}`),
            '}',
        ].join('\n'))
        this.childErrors = childErrors
    }
}


interface Entry<T, D> {
    value:
    // This entry has a dependency key and an initializer function
    | { deps: DependencyKey<D>, init: (deps: D) => T }
    // This entry has a predefined instance we can return
    | { instance: T }
}


/** The dependency injection container for `structured-injection`. */
export class Container {
    private readonly _providers = new Map<TypeKey<any>, Entry<any, any>>()
    private readonly _parent?: Container

    constructor(parent?: Container) {
        this._parent = parent
    }

    // Add a `TypeKey` provider to the _providers set
    private _setKeyProvider<T, D = {}>(key: TypeKey<T>, entry: Entry<T, D>) {
        this._providers.set(key, entry)
    }

    private _getEntry<T, D>(key: TypeKey<T>): Entry<T, D> | undefined {
        return this._providers.get(key) as Entry<T, D> | undefined
    }

    // Returns a provider for the given `TypeKey`, or an error if it or any of its transitive dependencies are not provided.
    private _getTypeKeyProvider<T, D = any>(key: TypeKey<T>): (() => T) | DependencyFailedError | TypeKeyNotProvidedError {
        let entry: Entry<T, D>
        let container: Container | undefined = this

        // Traverse this container and its parents until we find an entry
        while (true) {
            const e = container?._getEntry<T, D>(key)
            if (e != undefined) {
                entry = e
                break
            }
            container = container._parent
            if (container == undefined) return new TypeKeyNotProvidedError()
        }

        const value = entry.value

        // If this dependency is just an instance, return that
        if ('instance' in value) return () => value.instance

        const depsResult: (() => D) | InjectError = this._getProvider(value.deps)
        if (depsResult instanceof InjectError) return new DependencyFailedError(depsResult)
        let deps: (() => D) | null = depsResult

        return () => {
            const value = entry.value
            // Leave room for singletons in the future: between invocations, assume value could be changed to an instance
            // Assuming entry won't change from 'instance' to 'init', deps should be defined at this point
            if ('init' in value) return value.init(deps!())
            // Since there's an instance available, we don't need deps anymore
            deps = null
            return value.instance
        }
    }

    // Returns a provider for the given `DependencyKey`, or an error if any of its transitive dependencies are not provided.
    private _getProvider<T>(deps: DependencyKey<T>): (() => T) | InjectError {
        if (deps instanceof TypeKey) return this._getTypeKeyProvider(deps)
        if (deps instanceof BaseKey) return deps.init(this._getProvider(deps.inner))
        if (deps instanceof AbstractKey) throw new Error('Unreachable: all subtypes of AbstractKey also extend BaseKey')
        const arrayLength = deps instanceof Array ? deps.length : null

        const providers: { [K in keyof T]?: () => T[K] } = {}

        let failed = false
        const errors: { [K in keyof T]?: InjectError } = {}

        for (let prop in deps) {
            const provider = this._getProvider(deps[prop])
            if (provider instanceof InjectError) {
                failed = true
                errors[prop] = provider
            } else {
                providers[prop] = provider
            }
        }

        if (failed) return new InjectPropertyError(errors)

        return () => {
            const out: Partial<T> = arrayLength == null ? {} : new Array(arrayLength) as unknown as Partial<T>

            for (let prop in providers) {
                out[prop] = providers[prop]!()
            }

            return out as T
        }
    }

    /** Registers `key` to provide the value returned by `init`, with the dependencies defined by `deps`. */
    provide<T, D>(key: TypeKey<T>, deps: DependencyKey<D>, init: (deps: D) => T): this {
        this._setKeyProvider(key, { value: { deps, init: init } })
        return this
    }

    /** Registers 'key' to provide the given `instance`. */
    provideInstance<T>(key: TypeKey<T>, instance: T): this {
        this._setKeyProvider(key, { value: { instance } })
        return this
    }

    /** Requests the dependency or dependencies defined by `deps`, or throws if any transitive dependencies are not provided. */
    request<T>(deps: DependencyKey<T>): T {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        return provider()
    }

    /** Returns a child of this container, after executing `f` with it. */
    createChild(f: (child: Container) => void): Container {
        const child = new Container(this)
        f(child)
        return child
    }

    /** Returns a `Subcomponent` that passes arguments to `f` to initialize the child container. */
    createSubcomponent<Args extends any[]>(f: (child: Container, ...args: Args) => void): Container.Subcomponent<Args> {
        return (...args) => {
            const child = new Container(this)
            f(child, ...args)
            return child
        }
    }
}

export namespace Container {
    /** A function that returns a new subcomponent instance using the given arguments. */
    export interface Subcomponent<Args extends any[]> {
        (...arg: Args): Container
    }
}
