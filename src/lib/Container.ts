import { BaseKey, DependencyKey, InjectableClass } from "."
import { Scope, Singleton } from './Scope'
import { Inject } from "./Inject"
import { Actual, AnyKey, BaseTypeKey, BaseTypeKeyWithDefault, ClassWithDefault, ClassWithoutDefault, ContainerActual, DepsOf, IsSync, RequireSync, TypeKey, } from "./TypeKey"
import { Initializer, isPromise, nullable } from "./_internal"

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

/** Error thrown when requeting a TypeKey whose value was not provided. */
export class DependencyNotSyncError extends InjectError {
    readonly key?: AnyKey
    constructor(key?: AnyKey) {
        super('Dependency not provided synchronously.')
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

// This entry has a dependency key and an initializer function
interface EntryInit<T, P, K extends AnyKey> {
    scope?: Scope
    binding: BaseKey<T, K, any, P, any>
}

interface EntryInstance<T> {
    instance: T
}

interface EntryPromise<T> {
    promise: Promise<T>
}

interface Entry<T, P, K extends AnyKey> {
    value:
    | EntryInit<T, P, K>
    // This entry has a predefined instance we can return
    | EntryInstance<T>
    | EntryPromise<T>
}

const _classTypeKey = Symbol()

type _UnresolvedKeys<AllKeys, Solved, K> =
    K extends AllKeys ? Exclude<K, Solved> :
    K extends (BaseTypeKey<infer _T, never> | ClassWithoutDefault<infer _T>) ? K :
    K extends (
        | BaseTypeKeyWithDefault<infer _T, infer D, any>
        | ClassWithDefault<infer _T, infer D, any>
    ) ? _UnresolvedKeys<
        AllKeys,
        Solved,
        D | (K extends { scope: infer Scp extends Scope } ? Scp : never)
    > :
    K extends (
        | IsSync<BaseTypeKeyWithDefault<infer _T, any, infer Sync>>
        | IsSync<ClassWithDefault<infer _T, any, infer Sync>>
    ) ? _UnresolvedKeys<AllKeys, Solved, Sync> :
    K

export type UnresolvedKeys<P, K extends AnyKey> = _UnresolvedKeys<Keys<P>, SimplifiedDeps<P>, DepsOf<K>>

const _requestFailedSymbol = Symbol()

export interface RequestFailed<K> {
    [_requestFailedSymbol]: K
}

export type CanRequest<P, K extends AnyKey> =
    & Container<P>
    & ([UnresolvedKeys<P, K>] extends [infer E] ? ([E] extends [never] ? unknown : RequestFailed<E>) : never)

type Keys<Deps> = Deps extends DepPair<infer K, infer _D> ? K : never

type DepsForKey<Deps, K> =
    K extends Keys<Deps> ? (Deps extends DepPair<K, infer D> ? D : never) :
    K extends (BaseTypeKey<infer _T, never> | ClassWithoutDefault<infer _T>) ? K :
    K extends (
        | BaseTypeKeyWithDefault<infer _T, infer D, any>
        | ClassWithDefault<infer _T, infer D, any>
    ) ? D :
    K extends (
        | IsSync<BaseTypeKeyWithDefault<infer _T, any, infer Sync>>
        | IsSync<ClassWithDefault<infer _T, any, infer Sync>>
    ) ? Sync :
    K

export type Provide<Old, New> =
    | (Old extends DepPair<Keys<New>, any> ? never : Old)
    | New

type SimplifyStep<Deps, Deps2 = Deps> =
    Deps extends DepPair<infer K, infer D> ? (
        K extends D ? never : DepPair<K, D extends any ? DepsForKey<Deps2, D> : never>
    ) : never

type SolvedKeys<Deps> = Deps extends DepPair<infer K, never> ? K : never

export type SimplifiedDeps<Deps> = [SimplifyStep<Deps>] extends [infer S] ? (
    [Deps, S] extends [S, Deps] ? SolvedKeys<S> : SimplifiedDeps<S>
) : never

const _depsTag = Symbol()

interface DepPair<out K, in D = never> {
    (d: D): K
}

interface _Container<in P> {
    [_depsTag]: ((d: P) => void) | null
}

class _AsyncScope extends Scope() { static readonly scopeTag = Symbol() }
export type AsyncScope = typeof _AsyncScope

/** The dependency injection container for `structured-injection`. */
export class Container<P> implements _Container<P> {
    [_requestFailedSymbol]: unknown
    private readonly _providers: Map<TypeKey<any>, Entry<any, P, any>> = new Map<TypeKey<any>, Entry<any, P, any>>([
        [Container.Key, { value: { instance: this } }]
    ])
    private readonly _parent?: Container<any>
    readonly [_depsTag]: ((d: P) => void) | null = null
    private readonly scopes: Scope[]

    protected constructor({ scope = [], parent }: { scope?: Scope[] | Scope, parent?: Container<any> } = {}) {
        this._parent = parent
        this.scopes = scope instanceof Array ? scope : [scope]
    }

    static create<S extends Scope = never>(options: { scope?: readonly S[] | S } = {}): Container<
        | DepPair<typeof Singleton>
        | DepPair<typeof Container.Key>
        | (S extends any ? DepPair<S> : never)
    > {
        let { scope = [] } = options
        let scopeWithSingleton = scope instanceof Array ? [Singleton, ...scope] : [Singleton, scope]
        const newOptions: { scope: Scope[] } = { scope: scopeWithSingleton }
        return new Container<any>(newOptions)
    }

    // Add a `TypeKey` provider to the _providers set
    private _setKeyProvider<T, K extends AnyKey = any>(key: TypeKey<T>, entry: Entry<T, P, K>) {
        this._providers.set(key, entry)
    }

    private _getEntry<T, K extends AnyKey = any>(key: TypeKey<T>): Entry<T, P, K> | undefined {
        return this._providers.get(key) as Entry<T, P, K> | undefined
    }

    // Returns a provider for the given `TypeKey`, or an error if it or any of its transitive dependencies are not provided.
    private _getTypeKeyProvider<T, K extends AnyKey = any>(key: TypeKey<T>): Initializer<T> | InjectError {
        let entry: Entry<T, P, K>

        // Traverse this container and its parents until we find an entry
        let entryContainer: Container<any> | undefined = this
        while (true) {
            const e = entryContainer?._getEntry<T, K>(key)
            if (e != undefined) {
                entry = e
                break
            }
            entryContainer = entryContainer._parent
            if (entryContainer == undefined) {

                const binding = key.defaultInit
                if (binding != undefined) {

                    const scope = key.scope
                    // Use the default provider if available for this key
                    entry = { value: { binding, scope } }
                    break
                }

                return new TypeKeyNotProvidedError(key)
            }
        }

        const value = entry.value

        // If this dependency is just an instance, return that
        if ('instance' in value) return { sync: true, init: () => value.instance }
        if ('promise' in value) return { sync: false, init: () => value.promise }

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
        const depsResult = (dependencyContainer as Container<P>)._getProvider(value.binding.inner)
        const initializer = value.binding.init(depsResult)

        if (initializer instanceof InjectError) return new DependencyFailedError(initializer)
        if (value.scope == undefined) return initializer
        let init = nullable(initializer)

        const provider: Initializer.Base<T> = {
            sync: initializer.sync, init() {
                try {
                    if ('instance' in entry.value) return entry.value.instance
                    if ('promise' in entry.value) return entry.value.promise

                    // Assuming entry won't change from 'instance' or 'promise' to 'binding', init should be defined at this point
                    let output = init!.init()
                    if (!this.sync && isPromise(output)) {
                        entry.value = { promise: output }
                        output.then(x => {
                            this.sync = true
                            entry.value = { instance: x }
                        })
                    } else {
                        this.sync = true
                        entry.value = { instance: output as T }
                    }
                    return output
                } finally {
                    init = null
                }
            }
        }

        return provider as Initializer<T>
    }

    private _getClassTypKey<T>(cls: InjectableClass<T>): TypeKey<T> {
        const _cls: typeof cls & { [_classTypeKey]?: TypeKey<T> } = cls
        return _cls[_classTypeKey] ??= class _X extends TypeKey({
            of: _cls,
            default: _cls.inject && (typeof _cls.inject == 'function' ? _cls.inject() : _cls.inject),
        }) {
            static readonly keyTag: symbol = Symbol()
            static readonly scope = _cls.scope
        }
    }

    private _getClassProvider<T>(cls: InjectableClass<T>): Initializer<T> | InjectError {
        return this._getTypeKeyProvider(this._getClassTypKey(cls))
    }

    // Returns a provider for the given `DependencyKey`, or an error if any of its transitive dependencies are not provided.
    private _getProvider<K extends AnyKey>(deps: K): Initializer<ContainerActual<K, P>> | InjectError {
        type T = ContainerActual<K, P>

        if (deps == null) return { sync: true, init: () => deps as T }
        if (Object.is(deps, Container.Key)) return { sync: true, init: () => this as T }
        if (TypeKey.isTypeKey(deps)) return this._getTypeKeyProvider(deps as TypeKey<T>) as Initializer<T>
        if (deps instanceof BaseKey) return deps.init(this._getProvider(deps.inner))
        if (typeof deps == 'function') return this._getClassProvider(deps as InjectableClass<T>)
        const arrayLength = deps instanceof Array ? deps.length : null

        type _K = NonNullable<K>
        type _T = { [X in keyof _K]: ContainerActual<_K[X], P> }
        let _deps = deps as { [X in keyof _K]: _K[X] & DependencyKey<_T[X]> }

        const providers: { [X in keyof _K]?: Initializer<ContainerActual<_K[X], P>> } = arrayLength == null ? {} : new Array(arrayLength) as any
        let allSync = true

        let failed = false
        const errors: { [X in keyof _K]?: InjectError } = {}

        for (let prop in _deps) {
            const provider = this._getProvider(_deps[prop])
            if (provider instanceof InjectError) {
                failed = true
                errors[prop] = provider
            } else if (!failed) {
                providers[prop] = provider
                allSync = allSync && !!provider.sync
            }
        }

        if (failed) return new InjectPropertyError(errors)

        if (allSync) return {
            sync: true, init: () => {
                const out: Partial<_T> = arrayLength == null ? {} : new Array(arrayLength) as unknown as Partial<_T>

                for (let prop in providers) {
                    out[prop] = providers[prop]!.init() as typeof out[keyof _K]
                }

                return out as T
            }
        }

        return {
            sync: false, init: async () => {
                const out: Partial<_T> = arrayLength == null ? {} : new Array(arrayLength) as unknown as Partial<_T>

                for (let prop in providers) {
                    out[prop] = await providers[prop]!.init()
                }

                return out as T
            }
        }
    }

    /** Registers `key` to provide the value returned by `init`, with the dependencies defined by `deps`. */
    provide<
        K extends TypeKey<any> | InjectableClass<any>,
        SrcK extends AnyKey = any,
        D = DepsOf<SrcK>,
        Sync = RequireSync<D>,
        S extends Scope = K extends { scope: infer A extends Scope } ? A : never,
    >(
        key: K,
        ...args: [
            ...scope: [scope: S] | [],
            ...init:
            | [BaseKey<Actual<K>, any, D, P, Sync>]
            | [deps: SrcK, init: (deps: ContainerActual<SrcK, P>) => Actual<K>],
        ]
    ): Container<Provide<
        P,
        | DepPair<K, S | D>
        | (unknown extends Sync ? never : DepPair<IsSync<K>, Sync>)
    >> {
        type T = Actual<K>
        // If no scope was provided, fall back to key.scope, which may or may not be defined
        const scope = Scope.isScope(args[0]) ? args[0] : key.scope
        let entry: Entry<T, P, AnyKey>

        if (typeof args[args.length - 1] == 'function') {
            const deps = args[args.length - 2] as SrcK
            const init = args[args.length - 1] as (deps: ContainerActual<SrcK, P>) => T
            entry = {
                value: {
                    binding: Inject.map(deps, init),
                    scope,
                }
            }
        } else {
            const binding = args[args.length - 1] as BaseKey<T, SrcK, any>
            if (binding instanceof Inject.Value) {
                entry = {
                    value: { instance: binding.instance }
                }
            } else {
                entry = {
                    value: {
                        binding,
                        scope,
                    }
                }
            }
        }

        let _key: TypeKey<T> = TypeKey.isTypeKey(key) ? key : this._getClassTypKey(key)
        this._setKeyProvider(_key, entry)
        return this as any
    }

    provideAsync<
        K extends TypeKey<any> | InjectableClass<any>,
        SrcK extends AnyKey = any,
        D = DepsOf<SrcK>,
        Sync = RequireSync<D>,
        S extends Scope = K extends { scope: infer A extends Scope } ? A : never,
    >(
        key: K,
        ...args: [
            ...scope: [scope: S] | [],
            ...init:
            | [BaseKey<Actual<K> | Promise<Actual<K>>, any, D, P, Sync>]
            | [deps: SrcK, init: (deps: ContainerActual<SrcK, P>) => Actual<K>],
        ]
    ): Container<Provide<
        P,
        | DepPair<K, S | D | AsyncScope>
        | (unknown extends Sync ? never : DepPair<IsSync<K>, Sync>)
    >> {
        this.provide(key as any, ...args)
        return this as any
    }

    /** Registers 'key' to provide the given `instance`. */
    provideInstance<K extends TypeKey<any> | InjectableClass<any>>(key: K, instance: Actual<K>): Container<Provide<P, DepPair<IsSync<K>, never> | DepPair<K, never>>> {
        type T = Actual<K>
        let _key: TypeKey<T> = TypeKey.isTypeKey(key) ? key : this._getClassTypKey(key)
        this._setKeyProvider(_key, { value: { instance } })
        return this as any
    }

    addScope<S extends Scope>(...scope: S[]): Container<P | (S extends any ? DepPair<S> : never)> {
        this.scopes.push(...scope)
        return this as any
    }

    /** Requests the dependency or dependencies defined by `deps`, or throws if any transitive dependencies are not provided. */
    readonly request = function <K extends AnyKey, Th extends CanRequest<P, K>>(this: Th, deps: K): ContainerActual<K, P> {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        if (!provider.sync) {
            throw new DependencyNotSyncError(deps)
        }
        return provider.init()
    }

    readonly requestAsync = function <
        K extends AnyKey,
        Th extends CanRequest<P | DepPair<AsyncScope>, K>,
    >(this: Th, deps: K): Promise<ContainerActual<K, P>> {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        return Promise.resolve(provider.init())
    }

    /** Returns a child of this container, after executing `f` with it. */
    createChild<S2 extends Scope = never>(
        { scope = [] }: Container.ChildOptions<S2> = {},
    ): Container<P | (S2 extends any ? DepPair<S2> : never)> {
        return new Container<P | (S2 extends any ? DepPair<S2> : never)>({ scope, parent: this })
    }

    /** Returns a `Subcomponent` that passes arguments to `f` to initialize the child container. */
    createSubcomponent<Args extends any[], P2 = never, S2 extends Scope = never>(
        { scope = [] }: Container.ChildOptions<S2> = {},
        f?: (child: Container<never>, ...args: Args) => Container<P2>,
    ): Container.Subcomponent<Args, Provide<Provide<P, S2 extends any ? DepPair<S2> : never>, P2>> {
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
    readonly inject = function <K extends AnyKey, R, Th extends CanRequest<P, K>>(
        this: Th,
        deps: K,
        f: (deps: ContainerActual<K, P>) => R,
    ): R {
        return f(this.request(deps))
    }

    /** Given a `DependencyKey` for a factory-type function, resolve the function, call it with `args`, and return the result. */
    readonly build = function <
        K extends AnyKey,
        Th extends CanRequest<P, K>,
        Args extends ContainerActual<K, P> extends (...args: infer A) => Out ? A : never,
        Out = ContainerActual<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(
        this: Th,
        deps: K,
        ...args: Args
    ): Out {
        return (this.request(deps) as (...args: Args) => Out)(...args)
    }
}

export namespace Container {
    export class Key extends TypeKey<Container<never>>({ name: Container.name }) { static readonly keyTag = Symbol() }
    export const inject = Inject.from(Key)

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
export type Module = FunctionModule | readonly Module[]

export function Module<M extends Module[]>(...m: M): M {
    return m
}

export type ModuleProvides<M> =
    M extends (ct: Container<never>) => Container<infer P> ? P :
    M extends readonly [infer A, ...infer B] ? Provide<ModuleProvides<A>, ModuleProvides<B>> :
    M extends [] ? never :
    never
