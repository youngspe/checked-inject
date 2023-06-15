import { AbstractKey, BaseKey, DependencyKey, Inject, InjectableClass, Scope, Singleton, StructuredKey, TypeKey } from "."

/** Represents a possible error when resolving a dependency. */
export abstract class InjectError extends Error { }

/** Error thrown when requeting a TypeKey whose value was not provided. */
export class TypeKeyNotProvidedError extends InjectError {
    readonly key: TypeKey
    constructor(key: TypeKey) {
        super(key.name ? `TypeKey ${key.name} not provided.` : 'TypeKey not provided.')
        this.key = key
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

export class ScopeUnavailableError extends InjectError {
    readonly scope: Scope
    constructor(scope: Scope) {
        const message = scope.name ? `Scope ${scope.name} unavailable` : 'Scope unavailable'
        super(message)
        this.scope = scope
    }
}

interface Entry<T, D> {
    value:
    // This entry has a dependency key and an initializer function
    | { deps: DependencyKey<D>, init: (deps: D) => T, scope?: Scope }
    // This entry has a predefined instance we can return
    | { instance: T }
}

const _classTypeKey = Symbol()

/** The dependency injection container for `structured-injection`. */
export class Container {
    private readonly _providers = new Map<TypeKey<any>, Entry<any, any>>([
        [Container.Key, { value: { instance: this } }]
    ])
    private readonly _parent?: Container
    private readonly _scopes: Scope[]

    constructor({ scope = [Singleton], parent }: { scope?: Scope[] | Scope, parent?: Container } = {}) {
        this._parent = parent
        this._scopes = scope instanceof Scope ? [scope] : scope
    }

    // Add a `TypeKey` provider to the _providers set
    private _setKeyProvider<T, D = {}>(key: TypeKey<T>, entry: Entry<T, D>) {
        this._providers.set(key, entry)
    }

    private _getEntry<T, D>(key: TypeKey<T>): Entry<T, D> | undefined {
        return this._providers.get(key) as Entry<T, D> | undefined
    }

    // Returns a provider for the given `TypeKey`, or an error if it or any of its transitive dependencies are not provided.
    private _getTypeKeyProvider<T, D = any>(key: TypeKey<T>): (() => T) | InjectError {
        let entry: Entry<T, D>

        // Traverse this container and its parents until we find an entry
        let entryContainer: Container | undefined = this
        while (true) {
            const e = entryContainer?._getEntry<T, D>(key)
            if (e != undefined) {
                entry = e
                break
            }
            entryContainer = entryContainer._parent
            if (entryContainer == undefined) {
                const def = key.defaultInit
                if (def != undefined) {
                    const scope = key.scope
                    // Use the default provider if available for this key
                    entry = {
                        value:
                            (typeof def == 'function') ? { deps: {} as any, init: def, scope } :
                                ('instance' in def) ? def : { scope, ...def }
                    }
                    break
                }
                return new TypeKeyNotProvidedError(key)
            }
        }

        const value = entry.value

        // If this dependency is just an instance, return that
        if ('instance' in value) return () => value.instance

        // Pick the appropriate container from this or its ancestors to retrieve the dependencies
        // If this entry has no scope, use the current container. Otherwise, find a container that contains the scope
        let dependencyContainer: Container
        if (value.scope != undefined) {
            let scopeContainer: Container | undefined = this
            let providerOutsideScope = true
            while (!scopeContainer._scopes.includes(value.scope)) {
                if (scopeContainer === entryContainer) {
                    // if we've traversed back to the entryContainer and not found the scope,
                    // that means the provider is defined in an descendant of the container with the scope,
                    // if the scope exists at all
                    providerOutsideScope = false
                }
                scopeContainer = scopeContainer?._parent
                if (scopeContainer == undefined) return new ScopeUnavailableError(value.scope)
            }
            if (providerOutsideScope || entryContainer == undefined) {
                // if the provider was defined in an ancestor of the container with this scope, we want to make sure we
                // don't store the instance in the ancestor.
                // do this by creating a new Entry so changes to value don't affect the original entry.value
                entry = { value }
                scopeContainer._setKeyProvider(key, entry)
                dependencyContainer = scopeContainer
            } else {
                // The provider was defined in a subcontainer of the scope.
                // This means values available to entryContainer can't bleed into a parent container,
                // so it's safe to use dependencies available to entryContainer but not scopeContainer.
                // This allows you to, for example, provide types with Singleton scope in a non-root container
                // and still have access to dependencies provided to that container.

                // Basically we'll grab the the dependencies from the most recent of entryContainer and scopeContainer
                dependencyContainer = entryContainer
            }
        } else {
            dependencyContainer = this
        }

        // Get the dependencies needed to intialize the requested value
        const depsResult: (() => D) | InjectError = dependencyContainer._getProvider(value.deps)
        if (depsResult instanceof InjectError) return new DependencyFailedError(depsResult)
        let deps: (() => D) | null = depsResult

        return () => {
            // Leave room for singletons in the future: between invocations, assume value could be changed to an instance
            // Assuming entry won't change from 'instance' to 'init', deps should be defined at this point
            if ('init' in entry.value) {
                const instance = entry.value.init(deps!())
                // If there's no scope, just return the created instance
                if (entry.value.scope == undefined) return instance
                // If there is a scope, store the instance so we can return the same one every time
                entry.value = { instance }
            }
            // Since there's an instance available, we don't need deps anymore
            deps = null
            return entry.value.instance
        }
    }

    private _getClassProvider<T>(cls: InjectableClass<T>): (() => T) | InjectError {
        const _cls: typeof cls & { [_classTypeKey]?: TypeKey<T> } = cls
        if (!_cls[_classTypeKey] || !Object.getOwnPropertySymbols(_cls).includes(_classTypeKey)) {
            if (Inject.binding in _cls) {
                const binding =
                    typeof _cls[Inject.binding] == 'function' ? _cls[Inject.binding]() : _cls[Inject.binding]

                _cls[_classTypeKey] = new TypeKey({
                    of: _cls,
                    scope: _cls[Inject.scope],
                    default: {
                        deps: binding.dependencies,
                        init: deps => binding.resolve(deps)
                    },
                })
            } else {
                (_cls as any)[_classTypeKey] = new TypeKey({
                    of: _cls,
                    scope: _cls[Inject.scope],
                    default: () => new _cls(),
                })
            }
        }

        const typeKey = _cls[_classTypeKey] as TypeKey<T>
        return this._getTypeKeyProvider(typeKey)
    }

    // Returns a provider for the given `DependencyKey`, or an error if any of its transitive dependencies are not provided.
    private _getProvider<T>(deps: DependencyKey<T>): (() => T) | InjectError {
        if (deps instanceof TypeKey) return this._getTypeKeyProvider(deps)
        if (deps instanceof BaseKey) return deps.init(this._getProvider(deps.inner))
        if (deps instanceof AbstractKey) throw new Error('Unreachable: all subtypes of AbstractKey also extend BaseKey')
        if (typeof deps == 'function') return this._getClassProvider(deps)
        const arrayLength = deps instanceof Array ? deps.length : null

        const providers: { [K in keyof T]?: () => T[K] } = {}

        let failed = false
        const errors: { [K in keyof T]?: InjectError } = {}

        // Cast this to StructuredKey<T> to discard the [k: keyof any] signature
        let _deps: StructuredKey<T> = deps

        for (let prop in _deps) {
            const provider = this._getProvider(_deps[prop])
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
    provide<T, D>(key: TypeKey<T>, ...args: [...scope: [scope: Scope] | [], deps: DependencyKey<D>, init: (deps: D) => T]): this {
        // If no scope was provided, fall back to key.scope, which may or may not be defined
        const scope = args.length == 3 ? args[0] : key.scope
        const deps = args[args.length - 2] as DependencyKey<D>
        const init = args[args.length - 1] as (deps: D) => T

        this._setKeyProvider(key, { value: { deps, init, scope } })
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
    createChild(
        { scope = [] }: Container.ChildOptions = {},
        ...modules: Module[]
    ): Container {
        return new Container({ scope, parent: this }).apply(...modules)
    }

    /** Returns a `Subcomponent` that passes arguments to `f` to initialize the child container. */
    createSubcomponent<Args extends any[]>(
        { scope = [] }: Container.ChildOptions = {},
        f?: (child: Container, ...args: Args) => void,
    ): Container.Subcomponent<Args> {
        return (...args) => {
            const child = new Container({ scope, parent: this })
            f?.(child, ...args)
            return child
        }
    }

    /** Apply a list of `Module`s to this container. */
    apply(...modules: Module[]): this {
        for (let mod of modules) {
            if (typeof mod == 'function') {
                mod(this)
            } else {
                mod.forEach(m => this.apply(m))
            }
        }
        return this
    }

    /** Calls the given function with the requested dependencies and returns its output. */
    inject<D, R>(deps: DependencyKey<D>, f: (deps: D) => R): R {
        return f(this.request(deps))
    }

    static readonly Key = new TypeKey({ of: Container })
    static readonly [Inject.binding] = Inject.bindFrom(Container.Key)
}

export namespace Container {
    /** A function that returns a new subcomponent instance using the given arguments. */
    export interface Subcomponent<Args extends any[]> {
        (...arg: Args): Container
    }

    export interface ChildOptions {
        scope?: Scope[] | Scope
    }
}

/** Implementation of a module that performs operations on a given `Container`. */
export interface FunctionModule {
    (ct: Container): void
}

/** An object used to provide definitions to a `Container` */
export type Module = FunctionModule | Module[]
