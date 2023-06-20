import { Container, InjectError, InjectableClass, Scope } from "."
import { Class } from "./_internal"

type OnlyObject = { [k: keyof any]: unknown } | unknown[]

/** An object representing a structured set of type keys to produce type `T`. */
export type StructuredKey<T> = { readonly [K in keyof T]: DependencyKey<T[K]> }
/** A dependency key that, when requested, resolves to a value of type `T`. */
export type DependencyKey<T = any> = TypeKey<T> | AbstractKey<T> | (OnlyObject & StructuredKey<T>) | InjectableClass<T, any>
/** The actual type that a dependency key of type `D` resolves to. */


type KeysWhere<D, E> = { [P in keyof D]: D[P] extends E ? { [_ in P]: D[P] } : never }[keyof D]

export type Actual<D, S = never> =
    & (D extends DependencyKey<infer T> ? T : unknown)
    & (D extends OnlyObject ? { [K in keyof KeysWhere<D, OnlyObject>]: Actual<D> } : unknown)
    & (D extends SubcomponentKey<infer A, infer S2> ? Container.Subcomponent<A, S | S2> : unknown)
    & (D extends typeof Container ? Container<S> : unknown)

// Use this to prevent library consumers from generating types equivalent to `AbstractKey`.
const _abstractKeySymbol: unique symbol = Symbol()

/** Implementation detail--extend `BaseKey` instead. */
export abstract class AbstractKey<T> {
    private readonly [_abstractKeySymbol]: T[] = []
    constructor(_sealed: typeof _abstractKeySymbol) { }


    private _Lazy?: GetLazy<this, T>
    /** Requests a function returning a lazily-computed value of `T`. */
    get Lazy(): GetLazy<this, T> { return this._Lazy ??= new GetLazy(this) }

    private _Provider?: GetProvider<this, T>
    /** Requests a function returning a value of `T`. */
    get Provider(): GetProvider<this, T> { return this._Provider ??= new GetProvider(this) }

    private _Optional?: Optional<this, T>
    /** Requests a value of type `T` if provided, otherwise `undefined`. */
    get Optional(): Optional<this, T> { return this._Optional ??= new Optional(this) }

    Build<
        F extends ((...args: any[]) => any) = this extends AbstractKey<infer F extends (...args: any[]) => any> ? F : never,
    >(...args: Parameters<F>): Build<AbstractKey<F>, F> {
        return new Build(this as AbstractKey<any>, ...args)
    }
}

// Use this to prevent library consumers from generating types equivalent to `TypeKey`.
const _keySymbol: unique symbol = Symbol()

export const keyTag: unique symbol = Symbol('keyTag')

type ClassLike<T> = Class<T> | ((...args: any[]) => T)

export interface TypeKey<out T = unknown, D = never> {
    readonly [_keySymbol]: readonly [T] | null
    readonly [keyTag]: symbol
    readonly scope?: Scope
    readonly name: string
}

const MISSING_KEY_TAG = 'add `static readonly [keyTag] = Symbol()` to TypeKey implementation' as const

// TODO: support default impl
export function TypeKey<T, D = never>() {
    return class TypeKeyClass {
        static readonly [_keySymbol]: readonly [T] | null
        static readonly [keyTag]: symbol | typeof MISSING_KEY_TAG = MISSING_KEY_TAG

        // private static _Lazy?: GetLazy<any>
        // /** Requests a function returning a lazily-computed value of `T`. */
        // static get Lazy(): GetLazy<typeof this> { return this._Lazy ??= new GetLazy(this) }

        // private static _Provider?: GetProvider<any>
        // /** Requests a function returning a value of `T`. */
        // static get Provider(): GetProvider<typeof this> { return this._Provider ??= new GetProvider(this) }

        // private static _Optional?: Optional<any>
        // /** Requests a value of type `T` if provided, otherwise `undefined`. */
        // static get Optional(): Optional<typeof this> { return this._Optional ??= new Optional(this) }

        // Build(
        //     ...args: T extends (...args: infer A) => infer R ? A : never
        // ): T extends (...args: infer A) => infer R ? Build<A, R> : never {
        //     return new Build(this as any) as any
        // }
    }
}

// /** A key used to provide and request instances of type `T`. */
// export class TypeKey<out T = unknown, D = any> extends AbstractKey<T> {
//     readonly name?: string
//     readonly class?: ClassLike<T>
//     readonly scope?: Scope
//     readonly defaultInit?: TypeKey.Options<T, D>['default']

//     private readonly [_keySymbol]: T[] = []

//     constructor(
//         { of, name = of?.name, scope, default: defaultInit }: TypeKey.Options<T, D> = {},
//     ) {
//         super(_abstractKeySymbol)
//         this.class = of
//         this.name = name
//         this.scope = scope
//         this.defaultInit = defaultInit
//     }
// }


export namespace TypeKey {
    export interface Options<T, D> {
        name?: string,
        of?: ClassLike<T>,
        scope?: Scope,
        default?: { deps: DependencyKey<D>, init: (deps: D) => T } | { instance: T } | (() => T)
    }

    export function isTypeKey(target: any): target is TypeKey {
        return _keySymbol in target
    }
}



/** Convenience for a TypeKey that specifically resolves to a a function that, given `Args`, returns `T`. */
// export class FactoryKey<Args extends any[], T, D = any> extends TypeKey<(...args: Args) => T, D> { }

export type FactoryKey<Args extends any[], T, D = never> = TypeKey<(...args: Args) => T, D>

export type SubcomponentKey<Args extends any[], S = never> = TypeKey<Container.Subcomponent<Args>>

/** A key that, upon request, transforms a provider of `D` into a provider of `T`. */
export abstract class BaseKey<T, K extends DependencyKey<D>, D = Actual<K>> extends AbstractKey<T> {
    /** This key determines the dependencies that will be passed to `this.init()`. */
    readonly inner: K

    constructor(inner: K) {
        super(_abstractKeySymbol)
        this.inner = inner
    }

    /** Given a provide of `D` or an error, return a provider of `T` or an error. */
    abstract init(deps: (() => D) | InjectError): (() => T) | InjectError
}

/** Requests a function returning a lazily-computed value of `T`. */
export class GetLazy<K extends DependencyKey<T>, T = Actual<K>> extends BaseKey<() => T, K, T> {
    override init(deps: (() => T) | InjectError): (() => () => T) | InjectError {
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
export class GetProvider<K extends DependencyKey<T>, T = Actual<K>> extends BaseKey<() => T, K, T> {
    override init(deps: (() => T) | InjectError): (() => () => T) | InjectError {
        if (deps instanceof InjectError) return deps
        return () => deps
    }
}

/** Requests a value of type `T` if provided, otherwise `undefined`. */
export class Optional<K extends DependencyKey<T>, T = Actual<K>> extends BaseKey<T | undefined, K, T> {
    override init(deps: (() => T) | InjectError): () => (T | undefined) {
        if (deps instanceof InjectError) return () => undefined
        return deps
    }
}

export class Build<
    K extends DependencyKey<F>,
    F extends (...args: Args) => any = Actual<K> extends (...args: any[]) => any ? Actual<K> : never,
    Args extends any[] = F extends (...args: infer A) => any ? A : never,
    Out = F extends (...args: any[]) => infer T ? T : unknown
> extends BaseKey<Out, K, F> {
    readonly args: Args
    override init(deps: (() => F)): (() => Out) | InjectError {
        if (deps instanceof InjectError) return deps
        return () => deps()(...this.args)
    }

    constructor(inner: K, ...args: Args) {
        super(inner)
        this.args = args
    }
}
