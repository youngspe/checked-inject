import { TypeKey } from './TypeKey'
import { BaseComputedKey, ComputedKey } from './ComputedKey'
import { NonEmptyScopeList, Scope, ScopeList, Singleton } from './Scope'
import { Inject } from './Inject'
import { InjectableClass } from './InjectableClass'
import { BaseResource, Dependency, IsSync, NotSync, RequireSync } from './Dependency'
import { Target, DepsOf, DependencyKey, IsSyncDepsOf, ResourceKey } from './DependencyKey'
import { Initializer, nameFunction } from './_internal'
import { Module } from './Module'
import { ChildGraph, DepPair, FlatGraph, Merge, Provide, ProvideGraph, WithScope } from './ProvideGraph'
import { CanRequest, RequestFailed, unresolved } from './CanRequest'
import { InjectError, TypeKeyNotProvidedError, ScopeUnavailableError, DependencyFailedError, InjectPropertyError, DependencyNotSyncError, DependencyCycleError } from './InjectError'

// This entry has a dependency key and an initializer function
interface EntryBinding<T, P extends ProvideGraph, K extends DependencyKey> {
    scope?: Scope[]
    binding: ComputedKey<T, K, any, any, P>
}

interface EntryInitializer<T> {
    initializer: Initializer<T>
}

interface EntryError {
    error: InjectError
}

interface EntryInstance<T> {
    instance: Initializer.Out<T>
}

interface Entry<T, P extends ProvideGraph, K extends DependencyKey> {
    value:
    | EntryBinding<T, P, K>
    | EntryInitializer<T>
    | EntryError
    // This entry has a predefined instance we can return
    | EntryInstance<T>
    isLocal: boolean
}

interface LocalEntry<T> { instance?: Initializer.Out<T> }

type ExcludeUnspecifiedScope<S> = S extends any ? (
    Scope extends S ? never : S
) : never

type CombinedScope<K, S extends Scope> = ExcludeUnspecifiedScope<
    | S
    | (K extends WithScope<infer A> ? A : never)
>

type PairForProvide<K extends Dependency, D extends Dependency, S extends Scope> =
    [CombinedScope<K, S>] extends [infer Scp extends Scope] ? (
        & DepPair<K, D | Scp>
        & ([Scp] extends [never] ? unknown : WithScope<Scp>)
    ) : never

type PairForProvideIsSync<K extends BaseResource, Sync extends Dependency, S extends Scope> =
    [CombinedScope<K, S>] extends [infer Scp extends Scope] ? (
        [Dependency] extends [Sync] ? never :
        & DepPair<IsSync<K>, Sync>
        & ([Scp] extends [never] ? unknown : WithScope<Scp>)
    ) : never

const _classTypeKey = Symbol()
const _depsTag = Symbol()
type Opt<T> = T | []

class ProvideFromInitializer<T, K extends DependencyKey, G extends Container.Graph = never>
    extends BaseComputedKey<T, K, DepsOf<K>, IsSyncDepsOf<K>, G> {
    private readonly _init: Initializer<T, Target<K, G>>

    constructor(src: K, init: Initializer<T, Target<K, G>>) {
        super(src)
        this._init = init
    }

    init(deps: InjectError | Initializer<Target<K, G>>): InjectError | Initializer<T> {
        return (deps instanceof InjectError) ? deps
            : Initializer.chain(deps, this._init)
    }
}

/**
 * The dependency injection container for `checked-inject`.
 *
 * @group Injection
 * @category Container
 */
export class Container<P extends Container.Graph> {
    /** @ignore */
    [unresolved]!: void
    private readonly _providers = new Map<TypeKey<any>, Entry<any, P, any>>()
    private readonly _localInstances = new Map<TypeKey<any>, LocalEntry<any>>
    private readonly _parent?: Container<any>
    /** @ignore */
    readonly [_depsTag]: ((d: P) => void) | null = null
    private readonly scopes: Scope[]

    private constructor({ scope = [], parent }: { scope?: Scope[] | Scope, parent?: Container<any> } = {}) {
        this._parent = parent
        this.scopes = scope instanceof Array ? scope : [scope]
    }

    /**
     * Creates a new {@link Container} instance.
     *
     * @param options - Options for creating the container
     * @param options.scope - A {@link Scope:type | Scope} or {@link ScopeList} to assign to the container
     *
     * @group Static Methods
     */
    static create<S extends Scope = never>(options: { scope?: ScopeList<S> } = {}): Container<Container.DefaultGraph<S>> {
        let { scope } = options
        let scopeWithSingleton = [Singleton, ...ScopeList.flatten(scope)]
        const newOptions: { scope: Scope[] } = { scope: scopeWithSingleton }
        return new Container(newOptions)
    }

    private _hasScope(scope: Scope): boolean {
        if (this.scopes.includes(scope)) return true
        return (this._parent?._hasScope(scope)) ?? false
    }

    private _missingScopes(scopes: Scope[]): Scope[] {
        return scopes.filter(s => !this._hasScope(s))
    }

    // Add a `TypeKey` provider to the _providers set
    private _setKeyProvider<T, K extends DependencyKey = any>(key: TypeKey<T>, entry: Entry<T, P, K>) {
        this._providers.set(key, entry)
    }

    private _getEntry<T, K extends DependencyKey = any>(key: TypeKey<T>): Entry<T, P, K> | undefined {
        return this._providers.get(key) as Entry<T, P, K> | undefined
    }

    // Returns a provider for the given `TypeKey`, or an error if it or any of its transitive dependencies are not provided.
    private _getTypeKeyProvider<
        T,
        K extends DependencyKey = any,
        Def extends ComputedKey<T> = any,
    >(key: TypeKey<T, Def>): Initializer<T> | InjectError {
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
                let binding = key.defaultInit
                if (typeof binding == 'function') { binding = binding() }

                if (binding != undefined) {
                    let scope = ScopeList.flatten(key.scope)
                    let isLocal = scope.includes(Scope.Local)
                    if (isLocal) {
                        scope = scope.filter(s => s !== Scope.Local)
                        if (scope.length > 0) { isLocal = false }
                    }
                    // Use the default provider if available for this key
                    entry = { value: { binding, scope }, isLocal }
                    break
                }

                return new TypeKeyNotProvidedError(key)
            }
        }

        let _localEntry: LocalEntry<T> | undefined

        if (entry.isLocal) {
            _localEntry = this._localInstances.get(key)
            if (!_localEntry) {
                this._localInstances.set(key, _localEntry = {})
            } else if (_localEntry.instance) {
                const localEntry = _localEntry
                return () => localEntry.instance!
            }
        }

        const localEntry = _localEntry
        const value = entry.value

        if ('error' in value) return value.error
        // If this dependency is just an instance, return that
        if ('instance' in value) return () => (entry.value as EntryInstance<T>).instance
        if ('initializer' in value) return value.initializer

        const valueScope = value.scope?.length ? value.scope : undefined

        let dependencyContainer: Container<any> = this
        if (valueScope) {
            const missingScopes = this._missingScopes(valueScope)
            if (missingScopes.length > 0) {
                entry.value = { get error() { return new ScopeUnavailableError(missingScopes) } }
                return entry.value.error
            }

            let ct: Container<any> | undefined = this

            while (ct) {
                dependencyContainer = ct

                if (dependencyContainer === entryContainer) {
                    break
                }
                if (valueScope.some(s => dependencyContainer.scopes.includes(s))) {
                    // if the provider was defined in an ancestor of the container with this scope, we want to make sure we
                    // don't store the instance in the ancestor.
                    // do this by creating a new Entry so changes to value don't affect the original entry.value
                    entry = { value, isLocal: entry.isLocal }
                    dependencyContainer._setKeyProvider(key, entry)
                    break
                }
                ct = ct._parent
            }
        }

        {
            let newValue: EntryInitializer<T> | undefined
            entry.value = newValue = {
                initializer: () => {
                    if (entry.value === newValue) throw new DependencyCycleError(key)
                    if ('instance' in entry.value) return entry.value.instance
                    if ('binding' in entry.value) throw new Error('binding should not happen after initializer is set')
                    if ('error' in entry.value) throw new DependencyFailedError(entry.value.error)
                    return entry.value.initializer()
                }
            }
        }
        // Get the dependencies needed to intialize the requested value
        const depsResult = (dependencyContainer as Container<P>)._getProvider(value.binding.inner)
        const initializer = value.binding.init(depsResult)

        if (initializer instanceof InjectError) {
            const innerError = initializer
            entry.value = { get error() { return new DependencyFailedError(innerError) } }
            return entry.value.error
        }
        let init: Initializer<T> | null = initializer

        let provider: Initializer<T>
        if (!valueScope) {
            if (localEntry) {
                provider = () => {
                    if (localEntry.instance) return localEntry.instance
                    const output = init!()
                    init = null
                    const local = localEntry as { instance?: Initializer.Out<T> }
                    local.instance = output
                    if ('then' in output) {
                        output.then(ref => { local.instance = ref })
                    }
                    return output
                }

            } else {
                provider = initializer
            }
        } else {
            provider = () => {
                try {
                    if ('instance' in entry.value) return entry.value.instance

                    // Assuming entry won't change from 'instance' to 'binding', init should be defined at this point
                    let output = init!()
                    init = null
                    entry.value = { instance: output }
                    if ('then' in output) { output.then(ref => { entry.value = { instance: ref } }) }
                    return output
                } finally {
                    init = null
                }
            }
        }

        provider = nameFunction(provider, `provide_${key.fullName}`)
        entry.value = { initializer: provider }
        return provider
    }

    private _getClassTypeKey<T>(cls: InjectableClass<T>): TypeKey<T> {
        const _cls: typeof cls & { [_classTypeKey]?: TypeKey<T> } = cls
        if (!Object.getOwnPropertySymbols(_cls).includes(_classTypeKey)) {
            _cls[_classTypeKey] = {
                [cls.name]: class extends TypeKey({
                    of: _cls,
                    default: _cls.inject && (typeof _cls.inject == 'function' ? _cls.inject() : _cls.inject),
                }) {
                    static readonly scope = _cls.scope
                }
            }[cls.name]
        }
        return _cls[_classTypeKey]!
    }

    private _getClassProvider<T>(cls: InjectableClass<T>): Initializer<T> | InjectError {
        return this._getTypeKeyProvider(this._getClassTypeKey(cls))
    }

    // Returns a provider for the given `DependencyKey`, or an error if any of its transitive dependencies are not provided.
    private _getProvider<K extends DependencyKey>(deps: K): Initializer<Target<K, P>> | InjectError {
        type T = Target<K, P>

        if (deps == null) return () => ({ value: deps as T })
        if (Object.is(deps, Container.Key)) return () => ({ value: this as T })
        if (TypeKey.isTypeKey(deps)) return this._getTypeKeyProvider(deps as TypeKey<T>) as Initializer<T>
        if (deps instanceof ComputedKey) return deps.init(this._getProvider(deps.inner))
        if (typeof deps == 'function') return this._getClassProvider(deps as InjectableClass<T>)
        const arrayLength = deps instanceof Array ? deps.length : null

        type _K = NonNullable<K>
        type _T = { [X in keyof _K]: Target<_K[X], P> }
        let _deps = deps as { [X in keyof _K]: _K[X] & DependencyKey.Of<_T[X]> }

        const providers: { [X in keyof _K]?: Initializer<Target<_K[X], P>> } = arrayLength == null ? {} : new Array(arrayLength) as any

        let failed = false
        const errors: { [X in keyof _K]?: InjectError } = {}

        for (let prop in _deps) {
            const provider = this._getProvider(_deps[prop])
            if (provider instanceof InjectError) {
                failed = true
                errors[prop] = provider
            } else if (!failed) {
                providers[prop] = provider
            }
        }

        if (failed) return new InjectPropertyError(errors)

        return () => {
            const refs = (arrayLength == null ? {} : new Array(arrayLength)) as unknown as {
                [X in keyof _T]?: Initializer.Ref<_T[X]> | Promise<Initializer.Ref<_T[X]>>
            }
            const out: Partial<_T> = arrayLength == null ? {} : new Array(arrayLength) as unknown as Partial<_T>
            let allSync = true

            for (let prop in providers) {
                const ref = refs[prop] = providers[prop]!()
                allSync = allSync && 'value' in ref
            }

            if (allSync) {
                for (let prop in refs) {
                    out[prop] = (refs[prop] as Initializer.Ref<_T[keyof _T]>).value
                }
                return { value: out as T }
            }

            return (async () => {
                for (let prop in refs) {
                    out[prop] = (await refs[prop])!.value
                }
                return { value: out as T }
            })()
        }
    }

    /** Registers `key` to provide the value returned by `init`, with the dependencies defined by `deps`. */
    private _provide<
        K extends ResourceKey,
        SrcK extends DependencyKey = never,
        D extends Dependency = DepsOf<SrcK>,
        Sync extends Dependency = RequireSync<D>,
        S extends Scope = never,
    >(
        sync: boolean,
        key: K,
        ...args: [
            ...scope: [scope: ScopeList<S>] | [],
            ...init:
            | [ComputedKey<Target<K>, any, D, Sync, P>]
            | [...deps: [SrcK] | [], init: (deps: Target<SrcK, P>) => Target<K>],
        ]
    ): this {
        type T = Target<K>
        // If no scope was provided, fall back to key.scope, which may or may not be defined
        const keyScope = key.scope
        const scopeIndex = 0 as const
        const provideScope = ScopeList.isScopeList(args[scopeIndex]) ? args[scopeIndex] : undefined
        const hasScopeArg = provideScope != undefined

        let scope: Scope[] | undefined = undefined
        let isLocal = false
        if (keyScope || provideScope) {
            scope = [...ScopeList.flatten(keyScope), ...ScopeList.flatten(provideScope)]
            if (scope.includes(Scope.Local)) {
                isLocal = true
                scope = scope.filter(s => s !== Scope.Local)
            }
            if (scope.length == 0) {
                scope = undefined
            } else {
                isLocal = false
            }
        }

        let entry: Entry<T, P, DependencyKey>

        if (typeof args[args.length - 1] == 'function') {
            const hasDepsArg = args.length - (hasScopeArg ? 1 : 0) >= 2

            const deps = hasDepsArg ? args[args.length - 2] as SrcK : undefined as SrcK
            const init = args[args.length - 1] as (deps: Target<SrcK, P>) => T
            entry = {
                value: {
                    binding: new ProvideFromInitializer(deps,
                        sync ? deps => ({ value: init(deps) })
                            : async deps => ({ value: await init(deps) }),
                    ),
                    scope,
                },
                isLocal,
            }
        } else {
            const binding = args[args.length - 1] as ComputedKey<T, SrcK>
            if (binding instanceof Inject.Value) {
                entry = {
                    value: { instance: { value: binding.instance } },
                    isLocal: false,
                }
            } else {
                entry = {
                    value: {
                        binding,
                        scope,
                    },
                    isLocal,
                }
            }
        }

        let _key: TypeKey<T> = TypeKey.isTypeKey(key) ? key : this._getClassTypeKey(key)
        this._setKeyProvider(_key, entry)
        return this
    }

    /**
     * Specifies how to resolve the target type of the given key or class.
     *
     * @example
     *
     * Provide the {@link TypeKey:type | TypeKey} `NameKey` with a function returning a string:
     *
     *  ```ts
     * myContainer.provide(NameKey, () => 'Alice')
     *  ```
     *
     * Provide the {@link TypeKey:type | TypeKey} `IdKey` within the {@link Scope:type | Scope} `MyScope`,
     * so the function is only called once per container with `MyScope`
     *
     *  ```ts
     *  myContainer.provide(IdKey, MyScope, () => '123')
     *  ```
     *
     * Provide an instance of `User` using a dependency object and a function.
     *
     * The dependency object can be an object with {@link DependencyKey} properties, like so:
     *
     *  ```ts
     *  myContainer.provide(User, {
     *    name: NameKey,
     *    id: IdKey,
     *  }, ({ name, id }) => new User(name, user))
     *  ```
     *
     * Provide `User` using a {@link ComputedKey}, `{@link Inject.construct}`
     *
     *  ```ts
     *  myContainer.provide(User, Inject.construct(User, NameKey, IdKey))
     *  ```
     *
     * @template K - The type of the key or class object
     * @template SrcK - Identifies the source data for the provider
     * @template D - Identifies the dependencies of the provided type
     * @template Sync - Identifies the dependencies for the type to be resolved synchronously
     * @param key - The key or class of the type to be provided
     * @param args - The remaining arguments. These include:
     *  * `scope` (optional): The {@link Scope} or {@link ScopeList} to which to bind the provided value
     *  And one of the following:
     *  * `init`: A function returning the provided value, or a {@link ComputedKey} yielding the provided value
     *  * `deps, init`:
     *    * deps: An object specifying which dependencies are required to provide the value
     *    * init: A function that accepts the dependencies specified by `deps` and returns the provided value
     *
     * @returns This container, now typed to include the provided type and its dependencies
     *
     * @group Provide Methods
     */
    provide<
        K extends ResourceKey,
        SrcK extends DependencyKey = never,
        D extends Dependency = DepsOf<SrcK>,
        Sync extends Dependency = RequireSync<D>,
        S extends Scope = never,
    >(
        key: K,
        ...args: [
            ...scope: Opt<[scope: NonEmptyScopeList<S>]>,
            ...init:
            | [init: ComputedKey<Target<K>, any, D, Sync, P>]
            | [deps: SrcK, init: (deps: Target<SrcK, P>) => Target<K>]
            | [init: () => Target<K>]
        ]
    ): Container<Provide<
        P,
        | PairForProvide<K, D, S>
        | PairForProvideIsSync<K, Sync, S>
    >> {
        return this._provide(true, key, ...args) as any
    }

    /**
     * Specifies how to asynchronously resolve the target type of the given key or class.
     * The signature is the same as {@link provide}, except that a {@link Promise} to the target type can be provided.
     * The provided type cannot be directly requested through {@link request}.
     * It can, however be requested through {@link requestAsync} or by using {@link TypeKey.Async | key.Async()}.
     *
     * @example
     *
     *  ```ts
     * myContainer.provideAsync(
     *  NameKey,
     *  { NameService }, async ({ NameService }) => await NameService.getName(),
     * )
     *  ```
     *
     *
     * @template K - The type of the key or class object
     * @template SrcK - Identifies the source data for the provider
     * @template D - Identifies the dependencies of the provided type
     * @param key - The key or class of the type to be provided
     * @param args - The remaining arguments. These include:
     *  * `scope` (optional): The {@link Scope:type | Scope} or {@link ScopeList} to which to bind the provided value
     *  And one of the following:
     *  * `init`: An async function returning the provided value,
     *    or a {@link ComputedKey} yielding the provided value or a promise
     *  * `deps, init`:
     *    * deps: An object specifying which dependencies are required to provide the value
     *    * init: An async function that accepts the dependencies specified by `deps` and returns the provided value
     *
     * @returns This container, now typed to include the provided type and its dependencies
     *
     * @group Provide Methods
     */
    provideAsync<
        T,
        K extends ResourceKey<Awaited<T>>,
        SrcK extends DependencyKey = never,
        D extends Dependency = DepsOf<SrcK>,
        S extends Scope = never,
    >(
        key: K,
        ...args: [
            ...scope: Opt<[scope: NonEmptyScopeList<S>]>,
            ...init:
            | [init: ComputedKey<T, any, D, any, P>]
            | [deps: SrcK, init: (deps: Target<SrcK, P>) => T]
            | [init: () => T]
        ]
    ): Container<Provide<P, PairForProvide<K, D, S> | DepPair<IsSync<K>, NotSync<K>>>> {
        return this._provide(false, key as any, ...args) as any
    }

    /**
     * Provides an instance of the target type for the given key or class.
     *
     * @template K - The type of the key or class object
     * @param key - The key or class of the type to be provided
     * @param instance - The provided instance
     * @returns This container, now typed to include the provided type and its dependencies
     *
     * @group Provide Methods
     */
    provideInstance<K extends ResourceKey>(key: K, instance: Target<K>): Container<
        Provide<P, DepPair<IsSync<K>, never> | DepPair<K, never>>
    > {
        type T = Target<K>
        let _key: TypeKey<T> = TypeKey.isTypeKey(key) ? key : this._getClassTypeKey(key)
        this._setKeyProvider(_key, { value: { instance: { value: instance } }, isLocal: false })
        return this as any
    }

    /**
     * Binds the resolved value of {@link src} to {@link key}.
     * In other words, when {@link key} is requested, {@link src} will be used to provide the value.
     * Equivalent to `provide(key, Inject.from(src))`
     *
     * @param key - The key or class of the type to be provided
     * @param src - The {@link DependencyKey} to use to when {@link key} is requested
     * @returns This container, now typed to include the provided type and its dependencies
     *
     * @group Provide Methods
     */
    bind<
        K extends ResourceKey,
        Src extends DependencyKey.Of<Target<K>>,
    >(key: K, src: Src): Container<Provide<
        P,
        | DepPair<K, DepsOf<Src>>
        | DepPair<IsSync<K>, IsSyncDepsOf<K>>
    >> {
        return this._provide(true, key, Inject.from(src) as ComputedKey<Target<K>>) as any
    }

    /**
     * Adds the given {@link Scope | Scopes} to this container.
     * Any dependencies with this scope will be instantiated when first requested and memoized within this container.
     *
     * @param scope - The scope or scopes to add to this container
     * @returns This container, now typed to include the added scopes
     *
     * @group Provide Methods
     */
    addScope<S extends Scope>(...scope: S[]): Container<Provide<P, S extends any ? DepPair<S, never> : never>> {
        this.scopes.push(...scope)
        return this as any
    }

    /**
     * Requests the dependency specified by the given key,
     * without statically checking that the dependency is safe to request.
     *
     * @param key - A key specifying the dependency to request
     * @returns The requested dependency
     *
     * @throws {@link Errors.InjectError}
     * when not all transitive dependencies are met
     *
     * @group Request Methods
     */
    requestUnchecked<K extends DependencyKey>(key: K): Target<K, P> {
        const provider = this._getProvider(key)
        if (provider instanceof InjectError) throw provider

        const output = provider()
        if ('then' in output) throw new DependencyNotSyncError(key)
        return output.value
    }

    /**
     * Asynchronously requests the dependency specified by the given key,
     * without statically checking that the dependency is safe to request.
     *
     * @param key - A key specifying the dependency to request
     * @returns A promise resolving to the requested dependency
     *
     * @throws {@link Errors.InjectError}
     * when not all transitive dependencies are met
     *
     * @group Request Methods
     */
    requestAsyncUnchecked<K extends DependencyKey>(deps: K): Promise<Target<K, P>> {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        const output = provider()

        return ('value' in output) ? Promise.resolve(output.value) : output.then(({ value }) => value)
    }

    /**
     * Requests the dependency specified by the given key,
     * statically checking that the dependency is safe to request.
     *
     * @param key - A key specifying the dependency to request
     * @returns The requested dependency
     *
     * @group Request Methods
     */
    request<K extends DependencyKey, Th extends CanRequest<P, K>>(
        this: Container<P> & Th,
        deps: K,
    ): Target<K, P> {
        return this.requestUnchecked(deps)
    }

    /**
     * Asynchronously requests the dependency specified by the given key,
     * statically checking that the dependency is safe to request.
     *
     * It is safe to call method when some dependencies cannot be resolved synchronously.
     *
     * @param key - A key specifying the dependency to request
     * @returns A promise resolving to the requested dependency
     *
     * @group Request Methods
     */
    requestAsync<K extends DependencyKey, Th extends CanRequest<P, K, never>>(
        this: Container<P> & Th,
        deps: K,
    ): Promise<Target<K, P>> {
        return this.requestAsyncUnchecked(deps)
    }

    /**
     * Creates a child container.
     * The child inherits all provided types and scopes from this container,
     * but no changes to the child will affect this container.
     *
     * @returns A child of this container
     *
     * @group Child Methods
     */
    createChild(): Container<ChildGraph<P, never>> {
        return new Container({ parent: this })
    }

    /**
     * @returns A {@link Subcomponent} that passes arguments to the given function to initialize a child container.
     *
     * @example
     *  ```ts
     *  const myContainer = Container.create()
     *    .provide(User, MyScope, Inject.construct(User, NameKey, IdKey))
     *
     *  const mySubcomponent = myContainer.createSubcomponent(
     *    (ct, name: string, id: string) => ct
     *      .addScope(MyScope)
     *      .provideInstance(NameKey, name)
     *      .provideInstance(IdKey, id)
     *  )
     *
     *  const childContainer = mySubcomponent('Alice", '123')
     *
     *  const user = childContainer.request(User)
     *  ```
     *
     * @group Child Methods
     */
    createSubcomponent<Args extends any[], P2 extends ProvideGraph = never>(
        f?: (child: Container<ChildGraph<FlatGraph<never>, never>>, ...args: Args) => Container<P2>,
    ): Container.Subcomponent<Args, Merge<P, P2>> {
        return (...args) => {
            const child = new Container<ChildGraph<FlatGraph<never>, never>>({ parent: this })
            return f?.(child, ...args) ?? child as any
        }
    }

    /**
     * Applies the given {@link Module:type | Modules} or {@link Module.Item | Items} to this container.
     * All scopes and dependencies provided with the modules will be applied to this container.
     *
     * @param modules - The modules to apply to the container.
     * @returns This container, now typed to include all types provided within the given modules
     *
     * @example Apply {@link Module} object:
     *  ```ts
     *  const MyModule = Module(ct => ct
     *    .provide(FooService, () => new FooService())
     *    .provide(BarService, () => new BarService())
     *  )
     *
     *  const myContainer = Container.create().apply(MyModule)
     *
     *  const [fooService, barService] = myContainer.request([FooService, BarService])
     *  ```
     *
     * @example Apply function:
     *  ```ts
     *  const myContainer = Container.create().apply(ct => ct
     *    .provide(FooService, () => new FooService())
     *    .provide(BarService, () => new BarService())
     *  )
     *
     *  const [fooService, barService] = myContainer.request([FooService, BarService])
     *  ```
     *
     * @example Use `apply` to merge modules:
     *  ```ts
     *  const FooModule = Module(ct => ct
     *    .provide(FooService, () => new FooService())
     *  )
     *  const BarModule = Module(ct => ct
     *    .provide(FooService, () => new FooService())
     *  )
     *  const MyModule = Module(ct => ct
     *    .provide(BazService,
     *      Inject.construct(BazService, FooService, BarService))
     *    .apply(FooModule, BarModule)
     *  )
     *
     *  const myContainer = Container.create().apply(MyModule)
     *
     *  const [fooService, barService] = myContainer.request([FooService, BarService])
     *  ```
     *
     * @group Provide Methods
     */
    apply<M extends Module.Item[]>(...modules: M): Container<Merge<P, Module.Provides<M>>> {
        for (let mod of modules) {
            if (mod instanceof Array) {
                mod.forEach(m => this.apply(m as any))
            } else if (typeof mod == 'function') {
                mod(this as any)
            } else {
                mod.applyTo(this as any)
            }
        }
        return this as Container<any>
    }

    /**
     * Calls the given function with the requested dependencies and returns its output.
     *
     * @template Th - A this-type bound enforcing that {@link K} is safe to request
     * @param deps - A key object specifying which dependencies to request
     * @param f - A function that accepts the dependencies specified by {@link deps}
     *
     * @group Request Methods
     */
    inject<K extends DependencyKey, R, Th extends CanRequest<P, K>>(
        this: Container<P> & Th,
        deps: K,
        f: (deps: Target<K, P>) => R,
    ): R {
        return f(this.requestUnchecked(deps))
    }

    /**
     * Asynchronously calls the given function with the requested dependencies and returns its output.
     *
     * It is safe to call method when some dependencies cannot be resolved synchronously.
     *
     * @template Th - A this-type bound enforcing that {@link K} is safe to request
     * @param deps - A key object specifying which dependencies to request
     * @param f - A possibly async function that accepts the dependencies specified by {@link deps}
     * @returns A promise resolving to the output of {@link f}
     *
     * @group Request Methods
     */
    injectAsync<K extends DependencyKey, R, Th extends CanRequest<P, K, never>>(
        this: Container<P> & Th,
        deps: K,
        f: (deps: Target<K, P>) => R | Promise<R>,
    ): Promise<R> {
        return this.requestAsyncUnchecked(deps).then(f)
    }

    /**
     * Given a {@link FactoryKey} or similar, return the result of the factory function
     * after applying {@link args}.
     *
     * @template K - Type of the factory key
     * @template Th - A this-type bound enforcing that {@link K} is safe to request
     * @template Args - The factory's parameter list type
     * @template Out - The factory's return type
     * @param key - A {@link FactoryKey} or similar key that resolves to a function
     *
     * @group Request Methods
     */
    build<
        K extends DependencyKey.Of<(...args: Args) => any>,
        Th extends CanRequest<P, K>,
        Args extends Target<K, P> extends (...args: infer A) => Out ? A : never,
        Out = Target<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(
        this: Container<P> & Th,
        key: K,
        ...args: Args
    ): Out {
        return this.requestUnchecked(key)(...args)
    }

    /**
     * Given a {@link FactoryKey} or similar, asynchronously return the result of the factory function
     * after applying {@link args}.
     *
     * It is safe to call method when some dependencies cannot be resolved synchronously.
     *
     * @template K - Type of the factory key
     * @template Th - A this-type bound enforcing that {@link K} is safe to request
     * @template Args - The factory's parameter list type
     * @template Out - The factory's return type
     * @param key - A {@link FactoryKey} or similar key that resolves to a possibly async function
     *
     * @group Request Methods
     */
    buildAsync<
        K extends DependencyKey.Of<(...args: Args) => any>,
        Th extends CanRequest<P, K, never>,
        Args extends Target<K, P> extends (...args: infer A) => Out ? A : never,
        Out = Target<K, P> extends (...args: Args) => infer O ? O : unknown,
    >(
        this: Container<P> & Th,
        key: K,
        ...args: Args
    ): Promise<Awaited<Out>> {
        return this.requestAsyncUnchecked(key).then(f => f(...args))
    }
}

/**
 * @group Injection
 * @category Container
 */
export namespace Container {
    /** Key used to request an instance of {@link Container}. This is automatically provided to each container. */
    export class Key extends TypeKey<Container<Graph.Empty>>({ name: Container.name }) { private _: any }
    /** @ignore */
    export const inject = Inject.from(Key)

    /** A function that returns a new subcomponent instance using the given arguments. */
    export interface Subcomponent<Args extends any[], P extends Graph = never> {
        (...arg: Args): Container<P>
    }

    /**
     * A type representing the dependency graph of all {@link TypeKey | TypeKeys} and {@link InjectableClass | InjectableClasses}
     * that have been provided to a {@link Container}.
     */
    export type Graph = ProvideGraph

    export namespace Graph {
        /** A graph with no provided types. */
        export type Empty = FlatGraph<never>
        /** A graph with no parent container. */
        export type Flat = FlatGraph
        /** A graph for a container with graph {@link Parent}. */
        export type Child<Parent extends Graph> = ChildGraph<Parent>
        /**
         * A graph resulting from applying all provided types of {@link B} to {@link A}.
         */
        export type Merge<A extends Graph, B extends Graph> = import('./ProvideGraph').Merge<A, B>
    }

    /**
     * The {@link Graph} of a container returned by {@link Container.provide}
    */
    export type DefaultGraph<S extends Scope = never> = FlatGraph<
        | DepPair<typeof Singleton, never>
        | DepPair<typeof Scope.Local, never>
        | DepPair<typeof Container.Key, never>
        | DepPair<IsSync<typeof Container.Key>, never>
        | (S extends any ? DepPair<S, never> : never)
    >

    /**
     * A {@link Container}-like object used for providing values for a {@link Module}.
     */
    export interface Builder<P extends Graph = Graph.Empty> {
        /** @ignore */
        readonly [_depsTag]: ((d: P) => void) | null

        /**
         * {@inheritDoc Container.provide}
         * @see {@link Container.provide}
         */
        provide<
            K extends ResourceKey,
            SrcK extends DependencyKey = never,
            D extends Dependency = DepsOf<SrcK>,
            Sync extends Dependency = RequireSync<D>,
            S extends Scope = never,
        >(
            key: K,
            ...args: [
                ...scope: Opt<[scope: NonEmptyScopeList<S>]>,
                ...init:
                | [init: ComputedKey<Target<K>, any, D, Sync, P>]
                | [deps: SrcK, init: (deps: Target<SrcK, P>) => Target<K>]
                | [init: () => Target<K>]
            ]
        ): Builder<Provide<
            P,
            | PairForProvide<K, D, S>
            | PairForProvideIsSync<K, Sync, S>
        >>

        /**
         * {@inheritDoc Container.provideAsync}
         * @see {@link Container.provideAsync}
         */
        provideAsync<
            T,
            K extends ResourceKey<Awaited<T>>,
            SrcK extends DependencyKey = never,
            D extends Dependency = DepsOf<SrcK>,
            S extends Scope = never,
        >(
            key: K,
            ...args: [
                ...scope: Opt<[scope: NonEmptyScopeList<S>]>,
                ...init:
                | [init: ComputedKey<T, any, D, any, P>]
                | [deps: SrcK, init: (deps: Target<SrcK, P>) => T]
                | [init: () => T]
            ]
        ): Builder<Provide<P, PairForProvide<K, D, S> | DepPair<IsSync<K>, NotSync<K>>>>

        /**
         * {@inheritDoc Container.provideInstance}
         * @see {@link Container.provideInstance}
         */
        provideInstance<K extends ResourceKey>(key: K, instance: Target<K>): Builder<
            Provide<P, DepPair<IsSync<K>, never> | DepPair<K, never>>
        >

        /**
         * {@inheritDoc Container.bind}
         * @see {@link Container.bind}
         */
        bind<
            K extends ResourceKey,
            Src extends DependencyKey.Of<Target<K>>,
        >(key: K, src: Src): Builder<Provide<
            P,
            | DepPair<K, DepsOf<Src>>
            | DepPair<IsSync<K>, IsSyncDepsOf<Src>>
        >>

        /**
         * {@inheritDoc Container.addScope}
         * @see {@link Container.addScope}
         */
        addScope<S extends Scope>(...scope: S[]): Builder<Provide<P, S extends any ? DepPair<S, never> : never>>

        /**
         * {@inheritDoc Container.apply}
         * @see {@link Container.apply}
         */
        apply<M extends Module.Item[]>(...modules: M): Builder<Merge<P, Module.Provides<M>>>
    }
}

interface Invariant<in out T> { }

/**
 * @ignore
 * @internal
 */
export function _assertContainer<G extends Container.Graph>(ct: Container<G> | Module<G>) {
    return {
        async cannotRequestSync<K extends DependencyKey>(this: CanRequest<G, K, never>, key: K, _because?: Invariant<CanRequest<G, K>>) {
            try {
                ct.requestUnchecked(key)
                throw new Error('expected request to fail')
            } catch { }
            await ct.requestAsyncUnchecked(key)
        },
        async cannotRequest<K extends DependencyKey>(key: K, _because?: Invariant<CanRequest<G, K, never>>) {
            try {
                await ct.requestAsyncUnchecked(key)
                throw new Error('expected request to fail')
            } catch { }

            try {
                ct.requestUnchecked(key)
                throw new Error('expected requestAsync to fail')
            } catch { }
        },
    }
}

/**
 * @ignore
 * @internal
 */
export function _because<K, Sync extends ResourceKey = never>(): Invariant<RequestFailed<
    | K
    | (Sync extends infer S extends ResourceKey ? NotSync<S> : never)
>> | undefined { return undefined }
