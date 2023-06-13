import { Dependencies, TypeKey } from "."

type Entry<T, D> = {
    value: {
        deps: Dependencies<D>,
        init: (deps: D) => T,
    } | { instance: T }
}

export abstract class InjectError extends Error { }
export class TypeKeyNotProvidedError extends InjectError {
    constructor() {
        super('TypeKey not provided.')
    }
}

export class DependencyFailedError extends InjectError {
    readonly cause: InjectError

    constructor(cause: InjectError) {
        super(`Dependency failed: ${cause.message}`)
        this.cause = cause
    }
}



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

export class Container {
    private _providers = new Map<TypeKey<any>, Entry<any, any>>()

    private _setKeyProvider<T, D = {}>(key: TypeKey<T>, entry: Entry<T, D>) {
        this._providers.set(key, entry)
    }

    private _getKeyProvider<T, D = any>(key: TypeKey<T>): (() => T) | DependencyFailedError | TypeKeyNotProvidedError {
        const entry = this._providers.get(key) as Entry<T, D> | undefined
        if (entry == undefined) return new TypeKeyNotProvidedError()
        const value = entry.value

        {
            // If this dependency is just an instance, return that
            if ('instance' in value) return () => value.instance
        }

        const depsResult: (() => D) | InjectError = this._getProvider(value.deps)
        if (depsResult instanceof InjectError) return new DependencyFailedError(depsResult)
        let deps: (() => D) | null = depsResult

        return () => {
            const value = entry.value
            // Assuming entry won't change from 'instance' to 'init', deps should be defined at this point
            if ('init' in value) return value.init(deps!())
            // Since there's an instance available, we don't need deps anymore
            deps = null
            return value.instance
        }
    }

    private _getProvider<T>(deps: Dependencies<T>): (() => T) | InjectError {
        if (deps instanceof TypeKey) return this._getKeyProvider(deps)
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

    provide<T, D>(key: TypeKey<T>, deps: Dependencies<D>, init: (deps: D) => T): this {
        this._setKeyProvider(key, { value: { deps, init: init } })
        return this
    }

    provideInstance<T>(key: TypeKey<T>, instance: T): this {
        this._setKeyProvider(key, { value: { instance } })
        return this
    }

    request<T>(deps: Dependencies<T>): T {
        const provider = this._getProvider(deps)
        if (provider instanceof InjectError) {
            throw provider
        }
        return provider()
    }
}
