const keySymbol: unique symbol = Symbol()

export type ObjectDependencies<T> = { [K in keyof T]: Dependencies<T[K]> }

export type Dependencies<T> = TypeKey<T> | ObjectDependencies<T>

export type Actual<D> = D extends Dependencies<infer T> ? T : never

export class TypeKey<out T> {
    private readonly [keySymbol]: T[] = []
}

export class FactoryKey<Args extends any[], T> extends TypeKey<(...args: Args) => T> { }
