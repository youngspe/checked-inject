export * from './Container'
export * from './TypeKey'

const _scopeKey: unique symbol = Symbol()

export class Scope {
    readonly name?: string
    private readonly [_scopeKey] = null
    constructor(name?: string) {
        this.name = name
    }
}

export const Singleton = new Scope('Singleton')
