abstract class PrivateConstruct {
    protected constructor(...args: any[]) { }
}

type AbstractClass<T> = abstract new (...args: any[]) => T

export type Class<T = any> = (typeof PrivateConstruct & { prototype: T }) | AbstractClass<T>
