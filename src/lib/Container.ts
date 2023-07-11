import { BaseKey, DependencyKey, InjectableClass } from "."
import { Scope, Singleton } from './Scope'
import { Inject } from "./Inject"
import { Actual, AnyKey, BaseTypeKey, ContainerActual, Dependency, DepsOf, IsSync, IsSyncDepsOf, KeyWithDefault, KeyWithoutDefault, NotSync, RequireSync, TypeKey, UnableToResolve, } from "./TypeKey"
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
interface EntryInit<T, P extends ProvideGraph, K extends AnyKey> {
    scope?: Scope
    binding: BaseKey<T, K, any, P, any>
}

interface EntryInstance<T> {
    instance: T
}

interface EntryPromise<T> {
    promise: Promise<T>
}

interface Entry<T, P extends ProvideGraph, K extends AnyKey> {
    value:
    | EntryInit<T, P, K>
    // This entry has a predefined instance we can return
    | EntryInstance<T>
    | EntryPromise<T>
}

const _classTypeKey = Symbol()

export type UnresolvedKeys<
    P extends ProvideGraph,
    K extends AnyKey,
    Sync extends Dependency = IsSyncDepsOf<K>,
> = DepsForKey<P, DepsOf<K> | Sync>

const unresolved = Symbol()

export interface RequestFailed<K> {
    [unresolved]: [(K extends any ? [K] : never)[0]]
}

export type CanRequest<
    P extends ProvideGraph,
    K extends AnyKey,
    Sync extends Dependency = IsSyncDepsOf<K>,
> =
    & Container<P>
    & ([UnresolvedKeys<P, K, Sync>] extends [infer E] ? ([E] extends [never] ? unknown : RequestFailed<E>) : never)

type GraphWithKeys<K extends Dependency> =
    | FlatGraph<K extends any ? DepPair<K, any> : never>
    | ChildGraph<GraphWithKeys<K>, K extends any ? DepPair<K, any> : never>

export type AllKeys<P extends ProvideGraph> = P extends GraphWithKeys<infer K> ? K : never

type MergePairs<Old extends GraphPairs, New extends GraphPairs> = Exclude<Old, DepPair<New['key'], any>> | New

export type Merge<Old extends ProvideGraph, New extends ProvideGraph> =
    New extends ChildGraph<infer Parent, infer Pairs> ? ChildGraph<Merge<Old, Parent>, Pairs> :
    New extends FlatGraph<infer Pairs> ? Provide<Old, Pairs> :
    never

export type Provide<P extends ProvideGraph, Pairs extends GraphPairs> =
    P extends ChildGraph<infer Parent, infer OldPairs> ? ChildGraph<Parent, MergePairs<OldPairs, Pairs>> :
    P extends FlatGraph<infer OldPairs> ? FlatGraph<MergePairs<OldPairs, Pairs>> :
    never

type _FindGraphWithDep<P extends ProvideGraph, D extends Dependency> = Extract<KeysOf<P>, D> extends never ? (
    P extends ChildGraph<infer Parent> ? _FindGraphWithDep<Parent, D> : never
) : P

type ExcludeBroad<D extends Dependency> = D extends Extract<Dependency, D> ? never : D

type FindGraphWithDep<P extends ProvideGraph, D extends Dependency> = _FindGraphWithDep<P, ExcludeBroad<D>>

type _DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
    PCurrent extends ProvideGraph = PRoot,
    Pairs extends GraphPairs = PairsOf<PCurrent>,
> = K extends any ? (
    K extends KeysOf<PCurrent> ? (Pairs extends DepPair<K, infer D> ? DepsForKey<
        Pairs extends WithScope<infer Scp> ? FindGraphWithDep<PRoot, Scp | K> : PRoot,
        D
    > : never) :
    PCurrent extends ChildGraph<infer Parent> ? _DepsForKeyTransitive<PRoot, K, Parent> :
    UnableToResolve<['DepsForKeyTransitive', K, AllKeys<PRoot>]>
) : never

type DepsForKeyTransitive<
    PRoot extends ProvideGraph,
    K extends Dependency,
> = K extends any ? _DepsForKeyTransitive<PRoot, K> : never

type DepsForKeyIsSync<
    P extends ProvideGraph,
    K2 extends InjectableClass | BaseTypeKey,
    K extends IsSync<K2>,
> =
    K2 extends PairsOf<P> ? K :
    K2 extends KeyWithoutDefault ? never :
    K2 extends KeyWithDefault<infer _T, any, infer Sync> ? DepsForKey<P, Sync> :
    UnableToResolve<['DepsForKeyIsSync', K]>

type _DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> =
    Dependency extends K ? UnableToResolve<['DepsForKey', K]> :
    K extends AllKeys<P> ? DepsForKeyTransitive<P, K> :
    K extends KeyWithoutDefault ? K :
    K extends KeyWithDefault<infer _T, infer D, any> ? DepsForKey<P, D> :
    K extends IsSync<infer K2> ? DepsForKeyIsSync<P, K2, K> :
    K

type DepsForKey<
    P extends ProvideGraph,
    K extends Dependency,
> = K extends any ? _DepsForKey<P, K> : never

const _depsTag = Symbol()

// Dependency pair
interface DepPair<out K extends Dependency, D extends Dependency> {
    deps: D
    key: K
}

interface WithScope<Scp extends Scope> {
    scope: Scp
}

interface GraphPairs extends DepPair<Dependency, any> { }

interface BaseProvideGraph<Pairs extends GraphPairs = GraphPairs> {
    pairs: Pairs
}

export interface FlatGraph<Pairs extends GraphPairs = GraphPairs> extends BaseProvideGraph<Pairs> { }

export interface ChildGraph<
    out Parent extends ProvideGraph,
    Pairs extends GraphPairs = GraphPairs,
> extends BaseProvideGraph<Pairs> {
    parent: Parent
}

export type ProvideGraph<Pairs extends GraphPairs = GraphPairs> =
    | FlatGraph<Pairs>
    | ChildGraph<ProvideGraph, Pairs>

type ParentOf<P extends ProvideGraph> = P extends ChildGraph<infer Parent> ? Parent : never
type PairsOf<P extends ProvideGraph> = P['pairs']
type KeysOf<P extends ProvideGraph> = PairsOf<P>['key']

type PairForProvide<K extends Dependency, D extends Dependency, S extends Scope> =
    & DepPair<K, D | (Scope extends S ? never : S)>
    & ([S] extends [never] ? unknown : (Scope extends S ? unknown : WithScope<S>))

type PairForProvideIsSync<K extends BaseTypeKey | InjectableClass, Sync extends Dependency, S extends Scope> =
    [Dependency] extends [Sync] ? never :
    & DepPair<IsSync<K>, Sync>
    & ([S] extends [never] ? WithScope<S> : unknown)

interface _Container<in P> {
    [_depsTag]: ((d: P) => void) | null
}

/** The dependency injection container for `structured-injection`. */
export class Container<P extends ProvideGraph> implements _Container<P> {
    [unresolved]!: ['missing dependencies:']
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

    static create<S extends Scope = never>(options: { scope?: readonly S[] | S } = {}): Container<FlatGraph<
        | DepPair<typeof Singleton, never>
        | DepPair<typeof Container.Key, never>
        | DepPair<IsSync<typeof Container.Key>, never>
        | (S extends any ? DepPair<S, never> : never)
    >> {
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
        D extends Dependency = DepsOf<SrcK>,
        Sync extends Dependency = RequireSync<D>,
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
        | PairForProvide<K, D, S>
        | PairForProvideIsSync<K, Sync, S>
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
        D extends Dependency = DepsOf<SrcK>,
        S extends Scope = K extends { scope: infer A extends Scope } ? A : never,
    >(
        key: K,
        ...args: [
            ...scope: [scope: S] | [],
            ...init:
            | [BaseKey<Actual<K> | Promise<Actual<K>>, SrcK, D, P, any>]
            | [deps: SrcK, init: (deps: ContainerActual<SrcK, P>) => Actual<K> | Promise<Actual<K>>],
        ]
    ): Container<Provide<P, PairForProvide<K, D, S> | DepPair<IsSync<K>, NotSync<K>>>> {
        this.provide(key as any, ...args)
        return this as any
    }

    /** Registers 'key' to provide the given `instance`. */
    provideInstance<K extends TypeKey<any> | InjectableClass<any>>(key: K, instance: Actual<K>): Container<
        Provide<P, DepPair<IsSync<K>, never> | DepPair<K, never>>
    > {
        type T = Actual<K>
        let _key: TypeKey<T> = TypeKey.isTypeKey(key) ? key : this._getClassTypKey(key)
        this._setKeyProvider(_key, { value: { instance } })
        return this as any
    }

    addScope<S extends Scope>(...scope: S[]): Container<
        Merge<P, ProvideGraph<S extends any ? DepPair<S, never> : never>>
    > {
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
        Th extends CanRequest<P, K, never>,
    >(this: Th, deps: K): Promise<ContainerActual<K, P>> {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        return Promise.resolve(provider.init())
    }

    /** Returns a child of this container, after executing `f` with it. */
    createChild(): Container<ChildGraph<P, never>> {
        return new Container({ parent: this })
    }

    /** Returns a `Subcomponent` that passes arguments to `f` to initialize the child container. */
    createSubcomponent<Args extends any[], P2 extends ProvideGraph = never>(
        f?: (child: Container<ChildGraph<FlatGraph<never>, never>>, ...args: Args) => Container<P2>,
    ): Container.Subcomponent<Args, Merge<P, P2>> {
        return (...args) => {
            const child = new Container<ChildGraph<FlatGraph<never>, never>>({ parent: this })
            return f?.(child, ...args) ?? child as any
        }
    }

    /** Apply a list of `Module`s to this container. */
    apply<M extends Module[]>(...modules: M): Container<Merge<P, ModuleProvides<M>>> {
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
    export class Key extends TypeKey<Container<FlatGraph<never>>>({ name: Container.name }) { static readonly keyTag = Symbol() }
    export const inject = Inject.from(Key)

    /** A function that returns a new subcomponent instance using the given arguments. */
    export interface Subcomponent<Args extends any[], P extends ProvideGraph = never> {
        (...arg: Args): Container<P>
    }
}

/** Implementation of a module that performs operations on a given `Container`. */
export interface FunctionModule {
    (ct: Container<FlatGraph<never>>): Container<any>
}

/** An object used to provide definitions to a `Container` */
export type Module = FunctionModule | readonly Module[]

export function Module<M extends Module[]>(...m: M): M {
    return m
}

export type ModuleProvides<M> =
    M extends (ct: Container<FlatGraph<never>>) => Container<infer P> ? P :
    M extends readonly [infer A, ...infer B] ? Merge<ModuleProvides<A>, ModuleProvides<B>> :
    M extends [] ? FlatGraph<never> :
    never
