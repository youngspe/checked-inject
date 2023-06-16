import { Actual, DependencyKey, TypeKey } from './TypeKey'

export * from './Container'
export * from './TypeKey'
export * from './Inject'
import { Inject } from './Inject'

const _scopeKey: unique symbol = Symbol()

export class Scope {
    readonly name?: string
    private readonly [_scopeKey] = null
    constructor(name?: string) {
        this.name = name
    }
}

export const Singleton = new Scope('Singleton')

type AbstractClass<T> = abstract new (...args: any[]) => T

interface DefaultConstructor<T> {
    new(): T
    [Inject.scope]?: Scope
}

interface ClassWithBinding<T> extends AbstractClass<T> {
    [Inject.scope]?: Scope
    [Inject.binding]: Inject.Binding<T>
}

export type InjectableClass<T> = DefaultConstructor<T> | ClassWithBinding<T>
