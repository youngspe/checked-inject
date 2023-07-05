import { Actual, BaseTypeKeyWithDefault, ClassWithDefault, ClassWithoutDefault, Container, ContainerActual, DependencyKey, DepsOf, Inject, InjectableClass, Module, Scope, Singleton, TypeKey, UnresolvedKeys, } from '../lib'

class NumberKey extends TypeKey<number>() { static readonly keyTag = Symbol() }
class StringKey extends TypeKey<string>() { static readonly keyTag = Symbol() }
class ArrayKey extends TypeKey<string[]>() { static readonly keyTag = Symbol() }
class BooleanKey extends TypeKey<boolean>() { static readonly keyTag = Symbol() }

describe(Container, () => {
    test('provide and request', () => {
        const target = Container.create().provide(NumberKey, {}, () => 10)

        const out = target.request(NumberKey);

        expect(out).toEqual(10)
    })

    test('provideInstance and request', () => {
        const target = Container.create().provideInstance(NumberKey, 10)

        const out = target.request(NumberKey)

        expect(out).toEqual(10)
    })

    test('request structured dependencies', () => {
        const target = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {}, () => ['a', 'b'])

        const out = target.request({
            a: NumberKey,
            b: StringKey,
            c: { d: ArrayKey }
        })

        expect(out).toEqual({
            a: 10,
            b: 'foo',
            c: { d: ['a', 'b'] }
        })
    })

    test('inject structured dependencies', () => {
        const target = Container.create()

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {
                a: NumberKey,
                b: { c: StringKey },
            }, ({ a, b: { c } }) => [a.toString(), c])
            .request(ArrayKey)

        expect(out).toEqual(['10', 'foo'])
    })

    test('request optional structured dependencies', () => {
        const target = Container.create()

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {}, () => ['a', 'b'])
            .request({
                a: NumberKey,
                b: StringKey,
                c: { d: ArrayKey, e: BooleanKey.Optional() }
            })

        expect(out).toEqual({
            a: 10,
            b: 'foo',
            c: { d: ['a', 'b'], e: undefined }
        })
    })

    test('inject lazy structured dependencies', () => {
        const target = Container.create()

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provideInstance(BooleanKey, true)
            .provide(ArrayKey, {
                a: NumberKey.Lazy(),
                b: Inject.lazy({ c: StringKey }),
                d: BooleanKey,
            }, ({ a, b, d }) => [a().toString(), b().c, d.toString()])
            .request(ArrayKey)

        expect(out).toEqual(['10', 'foo', 'true'])
    })

    test('inject structured provider dependencies', () => {
        const target = Container.create()
        let sideEffect = 0

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => {
                sideEffect += 1
                return 'foo'
            })
            .provideInstance(BooleanKey, true)
            .provide(ArrayKey, {
                a: NumberKey,
                b: { c: StringKey.Provider() },
                c: BooleanKey,
            }, ({ a, b: { c } }) => [a.toString(), c(), c()])
            .request(ArrayKey)

        expect(out).toEqual(['10', 'foo', 'foo'])
        expect(sideEffect).toEqual(2)
    })

    test('child container defers to parent to get missing dependencies', () => {
        const target = Container.create()
            .provideInstance(NumberKey, 10)
            .provideInstance(BooleanKey, false)
            .provide(ArrayKey, {
                a: NumberKey,
                b: { c: StringKey },
                d: BooleanKey,
            }, ({ a, b: { c }, d }) => [a.toString(), c, d.toString()])

        const child = target
            .createChild()
            .provide(StringKey, {}, () => 'foo')
            .provideInstance(BooleanKey, true)

        const out = child.request(ArrayKey)
        expect(out).toEqual(['10', 'foo', 'true'])
    })

    test('singleton returns the same instance every time', () => {
        class CustomKey extends TypeKey<{ num: number, str: string, bool: boolean }>() { static readonly keyTag = Symbol() }

        const target = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provideInstance(BooleanKey, false)
            .provide(CustomKey, Singleton, {
                num: NumberKey,
                str: StringKey,
                bool: BooleanKey,
            }, (deps) => deps)
            .provide(ArrayKey, { num: NumberKey, str: StringKey }, ({ num, str }) => [num.toString(), str])

        const custom1 = target.request(CustomKey)
        const custom2 = target.request(CustomKey)

        // Test that custom1 and custom2 are the same instance:
        expect(custom1).toBe(custom2)

        const array1 = target.request(ArrayKey)
        const array2 = target.request(ArrayKey)

        // Test that array1 and array2 are NOT the same instance since they don't have the Singleton scope:
        expect(array1).not.toBe(array2)
    })

    test('dependencies are resolved from the appropriate scope', () => {
        class MyScope extends Scope() { static readonly scopeTag = Symbol() }

        const parent = Container.create()
            .provide(NumberKey, {}, () => 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, MyScope, { num: NumberKey, str: StringKey }, ({ num, str }) => [num.toString(), str])

        const child1 = parent.createChild({ scope: MyScope }).provide(NumberKey, {}, () => 20)
        const grandChild1a = child1.createChild().provide(StringKey, {}, () => 'bar')
        const grandChild1b = child1.createChild().provide(NumberKey, {}, () => 30)

        const out1 = child1.request(ArrayKey)

        expect(out1).toEqual(['20', 'foo'])
        expect(grandChild1a.request(ArrayKey)).toBe(out1)
        expect(grandChild1b.request(ArrayKey)).toBe(out1)

        const child2 = parent.createChild({ scope: MyScope }).provide(NumberKey, {}, () => 40)
        const grandChild2a = child2.createChild().provide(StringKey, {}, () => 'baz')
        const grandChild2b = child2.createChild().provide(NumberKey, {}, () => 50)

        const out2 = grandChild2a.request(ArrayKey)

        expect(out2).toEqual(['40', 'foo'])
        expect(child2.request(ArrayKey)).toBe(out2)
        expect(grandChild2b.request(ArrayKey)).toBe(out2)

        expect(parent.request(ArrayKey.Optional())).not.toBeDefined()
        expect(out2).not.toBe(out1)
    })

    test('TypeKey.default is function', () => {
        // Non-singleton
        class CustomKey1 extends TypeKey({ default: Inject.call(() => ({ a: 1 })) }) { static readonly keyTag = Symbol() }
        // Singleton
        class CustomKey2 extends TypeKey({ default: Inject.call(() => ({ b: 2 })) }) {
            static readonly keyTag = Symbol()
            static readonly scope = Singleton
        }
        const target = Container.create()

        const out1a = target.request(CustomKey1)
        const out1b = target.request(CustomKey1)

        const out2a = target.request(CustomKey2)
        const out2b = target.request(CustomKey2)

        expect(out1a).toEqual({ a: 1 })
        expect(out1b).toEqual({ a: 1 })
        // Test that a new instance is created since this isn't a singleton:
        expect(out1a).not.toBe(out1b)

        expect(out2a).toEqual({ b: 2 })
        expect(out2b).toEqual({ b: 2 })
        // Test that a new instance isn't created since this is a singleton:
        expect(out2a).toBe(out2b)
    })

    test('TypeKey.default is Inject.map', () => {
        // Non-singleton
        class CustomKey1 extends TypeKey({
            default: Inject.map({ num: NumberKey }, ({ num }) => ({ a: num })),
        }) { static readonly keyTag = Symbol() }
        // Singleton
        class CustomKey2 extends TypeKey({
            default: Inject.map({ str: StringKey }, ({ str }) => ({ b: str })),
        }) {
            static readonly keyTag = Symbol()
            static readonly scope = Singleton
        }

        const target = Container.create()
            .provideInstance(NumberKey, 1)
            .provideInstance(StringKey, 'foo')

        type Foo = Actual<typeof CustomKey1>

        const out1a = target.request(CustomKey1)
        const out1b = target.request(CustomKey1)

        const out2a = target.request(CustomKey2)
        const out2b = target.request(CustomKey2)

        expect(out1a).toEqual({ a: 1 })
        expect(out1b).toEqual({ a: 1 })
        // Test that a new instance is created since this isn't a singleton:
        expect(out1a).not.toBe(out1b)

        expect(out2a).toEqual({ b: 'foo' })
        expect(out2b).toEqual({ b: 'foo' })
        // Test that a new instance isn't created since this is a singleton:
        expect(out2a).toBe(out2b)
    })

    test('TypeKey.default is instance', () => {
        const instance = { a: 1 }
        class CustomKey extends TypeKey({ default: Inject.value(instance) }) { static readonly keyTag = Symbol() }

        const target = Container.create()

        const out = target.request(CustomKey)

        expect(out).toBe(instance)
    })

    test('TypeKey.scope is respected when no scope is provided', () => {
        class MyScope extends Scope() { static readonly scopeTag = Symbol() }
        class CustomKey extends TypeKey<{ a: number }>() {
            static readonly keyTag = Symbol()
            static readonly scope = MyScope
        }

        const parent = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(CustomKey, { num: NumberKey }, ({ num }) => ({ a: num, }))

        const child1 = parent.createChild({ scope: MyScope }).provideInstance(NumberKey, 20)
        const grandChild1 = child1.createChild({ scope: MyScope }).provideInstance(NumberKey, 30)

        const out1 = child1.request(CustomKey)

        const child2 = parent.createChild({ scope: MyScope }).provideInstance(NumberKey, 40)
        const grandChild2 = child2.createChild({ scope: MyScope }).provideInstance(NumberKey, 50)

        const out2 = child2.request(CustomKey)

        expect(parent.request(CustomKey.Optional())).toBeUndefined()
        expect(out1).toEqual({ a: 20 })
        expect(grandChild1.request(CustomKey)).toBe(out1)

        expect(out2).toEqual({ a: 40 })
        expect(grandChild2.request(CustomKey)).toBe(out2)
    })

    test('Provided scope overrides TypeKey.Scope', () => {
        class MyScope extends Scope() { static readonly scopeTag = Symbol() }
        class CustomKey extends TypeKey<{ a: number }>() {
            static readonly keyTag = Symbol()
            static readonly scope = Singleton
        }

        const parent = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(CustomKey, MyScope, { num: NumberKey }, ({ num }) => ({ a: num, }))

        const child1 = parent.createChild({ scope: MyScope }).provideInstance(NumberKey, 20)
        const grandChild1 = child1.createChild({ scope: MyScope }).provideInstance(NumberKey, 30)

        const out = child1.request(CustomKey)

        expect(parent.request(CustomKey.Optional())).toBeUndefined()
        expect(out).toEqual({ a: 20 })
        expect(grandChild1.request(CustomKey)).toBe(out)
    })

    test('apply a single functional module', () => {
        const MyModule = Module(ct => ct
            .provideInstance(NumberKey, 10)
            .provideInstance(StringKey, 'foo')
            .provide(ArrayKey, { num: NumberKey, str: StringKey }, ({ num, str }) => [num.toString(), str])
        )

        const target = Container.create().apply(MyModule)

        const out = target.request(ArrayKey)

        expect(out).toEqual(['10', 'foo'])
    })

    test('apply compound modules', () => {
        const NumericModule = Module(ct => ct
            .provideInstance(NumberKey, 10)
            .provideInstance(BooleanKey, true)
        )

        const StringModule = Module(ct => ct
            .provideInstance(StringKey, 'foo')
        )

        const PrimitiveModule = Module(NumericModule, StringModule)

        const ArrayModule = Module(ct => ct
            .provide(ArrayKey, {
                num: NumberKey,
                str: StringKey,
                bool: BooleanKey,
            }, ({ num, str, bool }) => [num.toString(), str, bool.toString()])
        )

        const target = Container.create().apply(ArrayModule, PrimitiveModule)

        const out = target.request(ArrayKey)

        expect(out).toEqual(['10', 'foo', 'true'])
    })

    test('Injectable class provide', () => {
        class MyClass1 {
            num: number
            str: string
            bool: boolean
            constructor(num: number, str: string, bool: boolean) {
                this.num = num; this.str = str; this.bool = bool
            }

            static inject = Inject.construct(this, NumberKey, StringKey, BooleanKey)
        }

        class MyClass2<T> {
            private x: T
            constructor(x: T) {
                this.x = x
            }
        }

        const target = Container.create()
            .provideInstance(MyClass1, new MyClass1(20, 'bar', false))
            .provide(MyClass2, Inject.value(new MyClass2(30)))

        const out1 = target.request(MyClass1)
        const out2 = target.request(MyClass2)

        expect(out1).toEqual(new MyClass1(20, 'bar', false))
        expect(out2).toEqual(new MyClass2(30))
    })

    test('Injectable class default', () => {
        class MyClass1 {
            num: number
            str: string
            bool: boolean
            constructor(num: number, str: string, bool: boolean) {
                this.num = num; this.str = str; this.bool = bool
            }

            static inject = Inject.construct(this, NumberKey, StringKey, BooleanKey)
        }

        const target = Container.create()
            .provideInstance(NumberKey, 10)
            .provideInstance(StringKey, 'foo')
            .provideInstance(BooleanKey, true)

        const out = target.request(MyClass1)

        expect(out).toEqual(new MyClass1(10, 'foo', true))
    })

    test('Inject.subcomponent', () => {
        class UserScope extends Scope() { static readonly scopeTag = Symbol() }
        class Keys {
            static UserId = class UserId extends TypeKey<string>() { static readonly keyTag = Symbol() }
            static UserName = class UserName extends TypeKey<string>() { static readonly keyTag = Symbol() }
            static UserInfo = class UserInfo extends TypeKey<{ userName: string, userId: string }>() { static readonly keyTag = Symbol() }
            static Subcomponent = Inject.subcomponent((ct, userName: string, userId: string) => ct
                .addScope(UserScope)
                .provideInstance(this.UserName, userName)
                .provideInstance(this.UserId, userId)
            )
        }

        const target = Container.create()
            .provide(Keys.UserInfo, UserScope, { userId: Keys.UserId, userName: Keys.UserName }, x => x)

        const sub1 = target.build(Keys.Subcomponent, 'alice', '123')
        const sub2 = target.build(Keys.Subcomponent, 'bob', '456')

        expect(sub1.request(Keys.UserInfo)).toEqual({ userName: 'alice', userId: '123' })
        expect(sub2.request(Keys.UserInfo)).toEqual({ userName: 'bob', userId: '456' })
    })
})
