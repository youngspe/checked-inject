import { InjectError, InjectableClass, Scope } from "."

type OnlyObject = { [k: keyof any]: unknown } | unknown[]

/** An object representing a structured set of type keys to produce type `T`. */
export type StructuredKey<out T> = { readonly [K in keyof T]: DependencyKey<T[K]> }
/** A dependency key that, when requested, resolves to a value of type `T`. */
export type DependencyKey<T> = TypeKey<T> | AbstractKey<T> | (OnlyObject & StructuredKey<T>) | InjectableClass<T>
/** The actual type that a dependency key of type `D` resolves to. */
export type Actual<D> = D extends DependencyKey<infer T> ? T : never

// Use this to prevent library consumers from generating types equivalent to `TypeKey`.
const _keySymbol: unique symbol = Symbol()

type ClassLike<T> = (abstract new (...args: any[]) => T) | ((...args: any[]) => T)


/** A key used to provide and request instances of type `T`. */
export class TypeKey<out T = unknown, D = any> {
    readonly name?: string
    readonly class?: ClassLike<T>
    readonly scope?: Scope
    readonly defaultInit?: TypeKey.Options<T, D>['default']

    private readonly [_keySymbol]: T[] = []
    /** Requests a function returning a lazily-computed value of `T`. */
    readonly Lazy = new GetLazy<T>(this)
    /** Requests a function returning a value of `T`. */
    readonly Provider = new GetProvider<T>(this)
    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    readonly Optional = new Optional<T>(this)

    constructor(
        { of, name = of?.name, scope, default: defaultInit }: TypeKey.Options<T, D> = {},
    ) {
        this.class = of
        this.name = name
        this.scope = scope
        this.defaultInit = defaultInit
    }
}


export namespace TypeKey {
    export interface Options<T, D> {
        name?: string,
        of?: ClassLike<T>,
        scope?: Scope,
        default?: { deps: DependencyKey<D>, init: (deps: D) => T } | { instance: T } | (() => T)
    }
}

/** Convenience for a TypeKey that specifically resolves to a a function that, given `Args`, returns `T`. */
export class FactoryKey<Args extends any[], T> extends TypeKey<(...args: Args) => T> { }

// Use this to prevent library consumers from generating types equivalent to `AbstractKey`.
const _abstractKeySymbol: unique symbol = Symbol()

/** Implementation detail--extend `BaseKey` instead. */
export abstract class AbstractKey<out T> {
    private readonly [_abstractKeySymbol]: T[] = []
    constructor(_sealed: typeof _abstractKeySymbol) { }
}

/** A key that, upon request, transforms a provider of `D` into a provider of `T`. */
export abstract class BaseKey<out T, D> extends AbstractKey<T> {
    /** This key determines the dependencies that will be passed to `this.init()`. */
    readonly inner: DependencyKey<D>

    constructor(inner: DependencyKey<D>) {
        super(_abstractKeySymbol)
        this.inner = inner
    }

    /** Given a provide of `D` or an error, return a provider of `T` or an error. */
    abstract init(deps: (() => D) | InjectError): (() => T) | InjectError
}

/** Requests a function returning a lazily-computed value of `T`. */
export class GetLazy<out T> extends BaseKey<() => T, T> {
    override init(deps: (() => T) | InjectError) {
        if (deps instanceof InjectError) return deps
        let d: (() => T) | null = deps
        let value: T | null = null

        const f = () => {
            if (d != null) {
                value = d()
                d = null
            }
            return value as T
        }

        return () => f
    }
}

/** Requests a function returning a value of `T`. */
export class GetProvider<out T> extends BaseKey<() => T, T> {
    override init(deps: (() => T) | InjectError) {
        if (deps instanceof InjectError) return deps
        return () => deps
    }
}

/** Requests a value of type `T` if provided, otherwise `undefined`. */
export class Optional<out T> extends BaseKey<T | undefined, T> {
    override init(deps: (() => T) | InjectError) {
        if (deps instanceof InjectError) return () => undefined
        return deps
    }
}
