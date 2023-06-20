import { AbstractKey, BaseKey, DependencyKey, InjectableClass, Scope, Singleton, StructuredKey, scopeTag } from "."
import { ClassWithBinding, DefaultConstructor, Inject } from "./Inject"
import { Actual, TypeKey } from "./TypeKey"

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

type CanRequest<Ct, K, A> = (() => Ct) extends () => _Container<infer P> ? (
    OutstandingDeps<P, K> extends never ? A : never
) : never

type Keys<Deps> = Deps extends [infer K, infer _D] ? K : never

type Provide<Old, New> =
    | (New extends [infer K, infer _D] ? Old extends [K, infer _D] ? never : Old : never)
    | New

export type DepsOf<D> =
    D extends TypeKey<infer _T> ? D :
    D extends BaseKey<infer _T, infer K, infer _D> ? DepsOf<K> :
    // TODO: refactor ClassWithBinding to include dependencies as a type arg
    D extends ClassWithBinding<infer _T, infer Deps> ? Deps :
    D extends DefaultConstructor<infer _T> ? never :
    D extends [infer A, ...infer B] ? DepsOf<A> | DepsOf<B> :
    D extends [] ? never :
    D extends (infer A)[] ? DepsOf<A> :
    D extends { [s: keyof any]: unknown } ? { [K in keyof D]: DepsOf<D[K]> }[keyof D] :
    D

type OutstandingDeps<Deps, K, Deps2 = Deps> = K extends Keys<Deps> ? (
    Deps extends [K, infer D] ? OutstandingDeps<Exclude<Deps2, [K, any]>, D> : never
) : K

const _depsTag = Symbol()

interface _Container<in P> {
    [_depsTag]?: (d: P) => void
}

/** The dependency injection container for `structured-injection`. */
export class Container<P> {
    private readonly _providers = new Map<TypeKey<any>, Entry<any, any>>([
        // TODO: be able to provide this container
        // [Container.Key, { value: { instance: this } }]
    ])
    private readonly _parent?: Container<[any, never]>
    readonly [_depsTag]?: (d: P) => void
    private readonly scopes: readonly Scope[]

    protected constructor({ scope = [], parent }: { scope?: Scope[] | Scope, parent?: Container<any> } = {}) {
        this._parent = parent
        this.scopes = scope instanceof Array ? scope : [scope]
    }

    static create<S extends Scope = never>(options: { scope?: S[] | S } = {}): Container<
        (S extends any ? [S, never] : never) | [Singleton, never]
    > {
        let { scope = Singleton } = options
        let scopeWithSingleton = scope instanceof Array ? [Singleton, ...scope] : [Singleton, scope]
        return new Container({ scope: scopeWithSingleton })
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
        let entryContainer: Container<any> | undefined = this
        while (true) {
            const e = entryContainer?._getEntry<T, D>(key)
            if (e != undefined) {
                entry = e
                break
            }
            entryContainer = entryContainer._parent
            if (entryContainer == undefined) {

                // TODO: default initializers
                // const def = key.defaultInit
                // if (def != undefined) {
                //     const scope = key.scope
                //     // Use the default provider if available for this key
                //     entry = {
                //         value:
                //             (typeof def == 'function') ? { deps: {} as any, init: def, scope } :
                //                 ('instance' in def) ? def : { scope, ...def }
                //     }
                //     break
                // }

                return new TypeKeyNotProvidedError(key)
            }
        }

        const value = entry.value

        // If this dependency is just an instance, return that
        if ('instance' in value) return () => value.instance

        // Pick the appropriate container from this or its ancestors to retrieve the dependencies
        // If this entry has no scope, use the current container. Otherwise, find a container that contains the scope
        let dependencyContainer: Container<any>
        if (value.scope != undefined) {
            let scopeContainer: Container<any> | undefined = this
            let providerOutsideScope = true
            while (!scopeContainer.scopes.includes(value.scope)) {
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

    // TODO: get classes working again
    // private _getClassProvider<T>(cls: InjectableClass<T>): (() => T) | InjectError {
    //     const _cls: typeof cls & { [_classTypeKey]?: TypeKey<T> } = cls
    //     if (!_cls[_classTypeKey] || !Object.getOwnPropertySymbols(_cls).includes(_classTypeKey)) {
    //         if (Inject.binding in _cls) {
    //             const binding =
    //                 typeof _cls[Inject.binding] == 'function' ? _cls[Inject.binding]() : _cls[Inject.binding]

    //             _cls[_classTypeKey] = new TypeKey({
    //                 of: _cls,
    //                 scope: _cls[Inject.scope],
    //                 default: {
    //                     deps: binding.dependencies,
    //                     init: deps => binding.resolve(deps)
    //                 },
    //             })
    //         } else {
    //             (_cls as any)[_classTypeKey] = new TypeKey({
    //                 of: _cls,
    //                 scope: _cls[Inject.scope],
    //                 default: () => new _cls(),
    //             })
    //         }
    //     }
    //
    //     const typeKey = _cls[_classTypeKey] as TypeKey<T>
    //     return this._getTypeKeyProvider(typeKey)
    // }

    // Returns a provider for the given `DependencyKey`, or an error if any of its transitive dependencies are not provided.
    private _getProvider<D>(deps: D): (() => Actual<D, P>) | InjectError {
        type T = Actual<D, P>
        if (deps === Container) return () => this as T
        if (TypeKey.isTypeKey(deps)) return this._getTypeKeyProvider(deps) as () => T
        if (deps instanceof BaseKey) return deps.init(this._getProvider(deps.inner))
        if (deps instanceof AbstractKey) throw new Error('Unreachable: all subtypes of AbstractKey also extend BaseKey')
        // if (typeof deps == 'function') return this._getClassProvider(deps) as () => Actual<D, S>
        if (typeof deps == 'function') throw new Error('TODO: support classes again')
        const arrayLength = deps instanceof Array ? deps.length : null

        type _T = typeof deps extends StructuredKey<infer _T> ? _T : never

        const providers: { [K in keyof _T]?: () => _T[K] } = {}

        let failed = false
        const errors: { [K in keyof _T]?: InjectError } = {}

        // Cast this to StructuredKey<T> to discard the [k: keyof any] signature
        let _deps = deps as StructuredKey<_T>

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
            const out: Partial<_T> = arrayLength == null ? {} : new Array(arrayLength) as unknown as Partial<_T>

            for (let prop in providers) {
                out[prop] = providers[prop]!()
            }

            return out as T
        }
    }

    /** Registers `key` to provide the value returned by `init`, with the dependencies defined by `deps`. */
    provide<
        T, K extends TypeKey<T>, D extends DependencyKey,
        S extends Scope = K['scope'] extends infer A extends Scope ? A : never
    >(
        key: K,
        ...args: [...scope: [scope: S] | [], deps: D, init: (deps: Actual<D, P>) => T]
    ): Container<Provide<P, [K, S | DepsOf<D>]>> {
        // If no scope was provided, fall back to key.scope, which may or may not be defined
        const scope = args.length == 3 ? args[0] : key.scope
        const deps = args[args.length - 2] as DependencyKey<D>
        const init = args[args.length - 1] as (deps: D) => T

        this._setKeyProvider(key, { value: { deps, init, scope } })
        return this as any
    }

    /** Registers 'key' to provide the given `instance`. */
    provideInstance<T, K extends TypeKey<T>>(key: K, instance: T): Container<Provide<P, [K, never]>> {
        this._setKeyProvider(key, { value: { instance } })
        return this as any
    }

    /** Requests the dependency or dependencies defined by `deps`, or throws if any transitive dependencies are not provided. */
    request<K extends DependencyKey>(deps: K, ..._: CanRequest<this, K, []>): Actual<K, P> {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        return provider()
    }

    /** Returns a child of this container, after executing `f` with it. */
    createChild<S2 extends Scope = never>(
        { scope = [] }: Container.ChildOptions<S2> = {},
    ): Container<Provide<P, S2 extends any ? [S2, never] : never>> {
        return new Container<Provide<P, S2 extends any ? [S2, never] : never>>({ scope, parent: this })
    }

    /** Returns a `Subcomponent` that passes arguments to `f` to initialize the child container. */
    createSubcomponent<Args extends any[], P2 = never, S2 extends Scope = never>(
        { scope = [] }: Container.ChildOptions<S2> = {},
        f?: (child: Container<never>, ...args: Args) => Container<P2>,
    ): Container.Subcomponent<Args, Provide<Provide<P, S2 extends any ? [S2, never] : never>, P2>> {
        return (...args) => {
            const child = new Container<never>({ scope, parent: this })
            return f?.(child, ...args) ?? child as any
        }
    }

    /** Apply a list of `Module`s to this container. */
    apply<M extends Module[]>(...modules: M): Container<Provide<P, ModuleProvides<M>>> {
        for (let mod of modules) {
            if (typeof mod == 'function') {
                mod(this as any)
            } else {
                mod.forEach(m => this.apply(m as any))
            }
        }
        return this as Container<any>
    }

    /** Calls the given function with the requested dependencies and returns its output. */
    inject<D, R, K extends DependencyKey<D>>(
        deps: K,
        f: (deps: D) => R,
        ..._: CanRequest<this, K, []>
    ): R {
        return f(this.request(deps, ..._ as any))
    }

    /** Given a `DependencyKey` for a factory-type function, resolve the function, call it with `args`, and return the result. */
    build<A extends any[], T, K extends DependencyKey<(...args: A) => T>>(
        deps: K,
        ...args: CanRequest<this, K, A>
    ): T {
        return this.request<K>(deps, ...([] as any))(...args)
    }

    // TODO: be able to provide a container with known types ??
    // static readonly Key: TypeKey<Container> = new TypeKey({ of: Container })
    // static readonly [Inject.binding] = Inject.bindFrom(Container.Key)
}

export namespace Container {
    /** A function that returns a new subcomponent instance using the given arguments. */
    export interface Subcomponent<Args extends any[], P = never> {
        (...arg: Args): Container<P>
    }

    export interface ChildOptions<S = never> {
        scope?: S[] | S
    }
}

/** Implementation of a module that performs operations on a given `Container`. */
export interface FunctionModule {
    (ct: Container<never>): Container<any>
}

/** An object used to provide definitions to a `Container` */
export type Module = FunctionModule | Module[]

export function Module<M extends Module[]>(...m: M): M {
    return m
}

export type ModuleProvides<M> =
    M extends (ct: Container<never>) => Container<infer P> ? P :
    M extends [infer A, ...infer B] ? Provide<ModuleProvides<A>, ModuleProvides<B>> :
    M extends [] ? never :
    never
