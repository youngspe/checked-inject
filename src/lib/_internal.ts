abstract class PrivateConstructClass {
    protected constructor(...args: any[]) { }
}

type _PrivateConstruct = typeof PrivateConstructClass

export interface PrivateConstruct extends _PrivateConstruct { }

export type AbstractClass<T = any, Args extends any[] = any[]> = abstract new (...args: Args) => T

export interface Class<T = any> extends PrivateConstruct { prototype: T }

export type CanMixinFrom<M> = object & { readonly [K in keyof M]?: M[K] }

interface ProtoCanMixin<M extends { prototype: any }> extends AbstractClass {
    prototype: CanMixinFrom<M['prototype']>
}

export type CanMixinFromClass<M extends { prototype: any }> = ProtoCanMixin<M> & CanMixinFrom<Omit<M, 'prototype'>>

export type MixedIn<T extends CanMixinFrom<M>, M> = T & Omit<M, keyof T>

export function mixinObject<T extends CanMixinFrom<M>, M extends {}>(target: T, rhs: M): asserts target is MixedIn<T, M> {
    const descriptors: PropertyDescriptorMap = {}
    for (let src: object | null = rhs; src != null; src = Object.getPrototypeOf(src)) {
        [...Object.getOwnPropertyNames(src), ...Object.getOwnPropertySymbols(src)].forEach(p => {
            descriptors[p] ??= { get: () => (rhs as any)[p] }
        })
    }

    const newProto = Object.defineProperties(Object.create(Object.getPrototypeOf(target)), descriptors)
    Object.setPrototypeOf(target, newProto)
}

export function mixin<T extends CanMixinFrom<M>, M extends {}, Args extends any[]>(target: T, rhs: abstract new (...args: Args) => M, ...args: Args): asserts target is MixedIn<T, M> {
    mixinObject(target, new class extends rhs { }(...args))
}

export function asMixin<T extends CanMixinFrom<M>, M extends {}, Args extends any[]>(target: T, rhs: abstract new (...args: Args) => M, ...args: Args): MixedIn<T, M> {
    mixin(target, rhs, ...args)
    return target
}

export interface Initializer<T, Arg = void> {
    (arg: Arg): Initializer.Out<T>
}

export namespace Initializer {
    export interface Sync<T, Arg = void> extends Initializer<T, Arg> {
        (arg: Arg): Initializer.Ref<T>
    }
    export interface Ref<T> { readonly value: T }
    export type Out<T> = Ref<T> | Promise<Ref<T>>
    export function flatMap<T, U, Arg = void>(
        init: Initializer<T, Arg>,
        transform: (value: T) => Initializer<U>,
    ): Initializer<U, Arg> {
        return (arg: Arg) => {
            const ref = init(arg)
            if ('value' in ref) { return transform(ref.value)() }
            return ref.then(({ value }) => transform(value)())
        }
    }
    export function chain<T, U, Arg = void>(
        init: Initializer<T, Arg>,
        transform: Initializer<U, T>
    ): Initializer<U, Arg> {
        return (arg: Arg) => {
            const ref = init(arg)
            if ('value' in ref) { return transform(ref.value) }
            return ref.then(({ value }) => transform(value))
        }
    }
}

export function isObject(x: unknown): x is object {
    return x !== null && (typeof x == 'object' || typeof x == 'function')
}

export function nullable<T>(x: T): T | null {
    return x
}

export function nameFunction<F extends (...any: any[]) => any>(f: F, name: string): F {
    if (f.name == name) return f
    if (!f.name) {
        try {
            Object.defineProperty(f, 'name', { value: name })
            return f
        } catch { }
    }
    return { [name]: ((...args) => f(...args)) as F }[name]
}
