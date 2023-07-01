abstract class PrivateConstructClass {
    protected constructor(...args: any[]) { }
}

type _PrivateConstruct = typeof PrivateConstructClass

export interface PrivateConstruct extends _PrivateConstruct {}

export type AbstractClass<T = any, Args extends any[] = any[]> = abstract new (...args: Args) => T

export type Class<T = any> = (PrivateConstruct & { prototype: T }) | AbstractClass<T>


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

interface MixinProto<C extends CanMixinFromClass<M>, M extends { prototype: any }> extends AbstractClass {
    prototype: MixedIn<C['prototype'], M['prototype']>
}

export type MixedInClass<C extends CanMixinFromClass<M>, M extends { prototype: any }> = MixedIn<C, M> & MixinProto<C, M> & (
    C extends new (...args: infer A) => C['prototype'] ? new (...args: A) => MixedIn<C['prototype'], M['prototype']> :
    C extends abstract new (...args: infer A) => C['prototype'] ? abstract new (...args: A) => MixedIn<C['prototype'], M['prototype']> :
    unknown
)

export function mixinClass<
    C extends CanMixinFromClass<M>,
    M extends { prototype: any },
    Args extends any[],
>(cls: C, rhs: abstract new (...args: Args) => M, ...args: Args): asserts cls is MixedInClass<C, M> {
    mixinObject(cls, rhs)
    cls.prototype = asMixin(cls.prototype, rhs.prototype)
}

export function asMixinClass<
    C extends CanMixinFromClass<M>,
    M extends abstract new () => any,
>(cls: C, rhs: M): MixedInClass<C, M> {
    mixinClass(cls, rhs)
    return new Proxy(cls, {
        construct(target, argArray, newTarget) {
            return asMixin(Reflect.construct(target, argArray, newTarget), rhs)
        }
    })
}
