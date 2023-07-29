import { AsyncFactoryKey, Container, FactoryKey, Inject, LazyKey, Module, Scope, Singleton, TypeKey } from '../lib'
import { _assertContainer, _because } from '../lib/Container'

class NumberKey extends TypeKey<number>() { private _: any }
class StringKey extends TypeKey<string>() { private _: any }
class ArrayKey extends TypeKey<string[]>() { private _: any }
class BooleanKey extends TypeKey<boolean>() { private _: any }

describe(Container, () => {
    test('provide and request', () => {
        const target = Container.create().provide(NumberKey, {}, () => 10)
        const out = target.request(NumberKey)

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
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {
                a: NumberKey,
                b: { c: StringKey },
            }, ({ a, b: { c } }) => [a.toString(), c])

        const out = target.request(ArrayKey)

        expect(out).toEqual(['10', 'foo'])
    })

    test('request optional structured dependencies', () => {
        const target = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {}, () => ['a', 'b'])

        target.request(Inject.async(BooleanKey.Optional()))

        const out = target.request({
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
        let sideEffect = 0
        const target = Container.create()
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

        const out = target.request(ArrayKey)

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
        class CustomKey extends TypeKey<{ num: number, str: string, bool: boolean }>() { private _: any }

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
        class MyScope extends Scope() { private _: any }

        const parent = Container.create()
            .provide(NumberKey, {}, () => 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, MyScope, { num: NumberKey, str: StringKey }, ({ num, str }) => [num.toString(), str])

        const child1 = parent.createChild()
            .addScope(MyScope)
            .provide(NumberKey, {}, () => 20)
        const grandChild1a = child1.createChild()
            .provide(StringKey, {}, () => 'bar')
        const grandChild1b = child1.createChild()
            .provide(NumberKey, {}, () => 30)

        const out1 = child1.request(ArrayKey)

        expect(out1).toEqual(['20', 'foo'])
        expect(grandChild1a.request(ArrayKey)).toBe(out1)
        expect(grandChild1b.request(ArrayKey)).toBe(out1)

        const child2 = parent.createChild()
            .addScope(MyScope)
            .provide(NumberKey, {}, () => 40)
        const grandChild2a = child2.createChild()
            .provide(StringKey, {}, () => 'baz')
        const grandChild2b = child2.createChild()
            .provide(NumberKey, {}, () => 50)

        const out2 = grandChild2a.request(ArrayKey)

        expect(out2).toEqual(['40', 'foo'])
        expect(child2.request(ArrayKey)).toBe(out2)
        expect(grandChild2b.request(ArrayKey)).toBe(out2)

        expect(parent.request(ArrayKey.Optional())).not.toBeDefined()
        expect(out2).not.toBe(out1)
    })

    test('TypeKey.default is function', () => {
        // Non-singleton
        class CustomKey1 extends TypeKey({ default: Inject.call(() => ({ a: 1 })) }) { private _: any }
        // Singleton
        class CustomKey2 extends TypeKey({ default: Inject.call(() => ({ b: 2 })) }) {
            private _: any
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
        }) { private _: any }
        // Singleton
        class CustomKey2 extends TypeKey({
            default: () => Inject.map({ str: StringKey }, ({ str }) => ({ b: str })),
        }) {
            private _: any
            static readonly scope = Singleton
        }

        const target = Container.create()
            .provideInstance(NumberKey, 1)
            .provideInstance(StringKey, 'foo')

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
        class CustomKey extends TypeKey({ default: Inject.value(instance) }) { private _: any }

        const target = Container.create()

        const out = target.request(CustomKey)

        expect(out).toBe(instance)
    })

    test('TypeKey.scope is respected when no scope is provided', async () => {
        class MyScope extends Scope() { private _: any }
        class CustomKey extends TypeKey<{ a: number }>() {
            private _: any
            static readonly scope = MyScope
        }

        const parent = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(CustomKey, { num: NumberKey }, ({ num }) => ({ a: num, }))

        const child1 = parent
            .createChild()
            .addScope(MyScope)
            .provideInstance(NumberKey, 20)
        const grandChild1 = child1
            .createChild()
            .addScope(MyScope)
            .provideInstance(NumberKey, 30)

        const out1 = child1.request(CustomKey)

        const child2 = parent
            .createChild()
            .addScope(MyScope)
            .provideInstance(NumberKey, 40)
        const grandChild2 = child2
            .createChild()
            .addScope(MyScope)
            .provideInstance(NumberKey, 50)

        const out2 = child2.request(CustomKey)

        await _assertContainer(parent).cannotRequest(CustomKey, _because<typeof MyScope>())
        expect(out1).toEqual({ a: 20 })
        expect(grandChild1.request(CustomKey)).toBe(out1)

        expect(out2).toEqual({ a: 40 })
        expect(grandChild2.request(CustomKey)).toBe(out2)
    })

    test('Provided scope added to TypeKey.scope', async () => {
        class MyScope extends Scope() { private _: any }
        class CustomKey extends TypeKey<{ a: number }>() {
            private _: any
            static readonly scope = Singleton
        }

        const parent = Container.create()
            .provideInstance(NumberKey, 10)
            .provide(CustomKey, MyScope, { num: NumberKey }, ({ num }) => ({ a: num, }))

        const child1 = parent
            .createChild()
            .addScope(MyScope)
            .provideInstance(NumberKey, 20)
        const grandChild1 = child1
            .createChild()
            .addScope(MyScope)
            .provideInstance(NumberKey, 30)

        const out = child1.request(CustomKey)

        await _assertContainer(parent).cannotRequest(CustomKey, _because<typeof MyScope>())
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
        class UserScope extends Scope() { private _: any }
        class Keys {
            static UserId = class UserId extends TypeKey<string>() { private _: any }
            static UserName = class UserName extends TypeKey<string>() { private _: any }
            static UserInfo = class UserInfo extends TypeKey<{ userName: string, userId: string }>() { private _: any }
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

    test('request async dependencies', async () => {
        const target = Container.create()
            .provideInstance(NumberKey, 10)
            .provideAsync(StringKey, {}, () => 'foo')
            .provide(ArrayKey, { str: StringKey }, ({ str }) => [str, 'b'])

        const out = target.request({
            a: NumberKey,
            b: StringKey.Async().Lazy(),
            c: Inject.async({ d: ArrayKey })
        })

        expect(out.a).toEqual(10)
        expect(await out.b()).toEqual('foo')
        expect((await out.c).d).toEqual(['foo', 'b'])
    })

    test('A FactoryKey returns the same instance per container', () => {
        class Fac extends FactoryKey(LazyKey(() => ({
            num: NumberKey,
            str: StringKey,
        })), ({ num, str }, num2: number, str2: string) => [num + num2, str + str2]) { private _: any }
        class AsyncFac extends AsyncFactoryKey({
            bool: BooleanKey,
        }, async ({ bool }, s1: string, s2: string) => bool ? s1 : s2) { private _: any }

        const parent = Container.create()
            .provideInstance(NumberKey, 123)
            .provideInstance(StringKey, 'foo')
            .provideAsync(BooleanKey, null, async () => true)

        const child = parent.createChild()

        const [sync1, async1] = parent.request([Fac, AsyncFac] as const)

        {
            const [sync1a, sync1b, async1a, async1b] = parent.request([Fac, Fac, AsyncFac, AsyncFac] as const)
            expect(sync1).toBe(sync1a)
            expect(sync1).toBe(sync1b)

            expect(async1).toBe(async1a)
            expect(async1).toBe(async1b)
        }

        const [sync2, async2] = child.request([Fac, AsyncFac] as const)

        {
            const [sync2a, sync2b, async2a, async2b] = child.request([Fac, Fac, AsyncFac, AsyncFac] as const)
            expect(sync2).toBe(sync2a)
            expect(sync2).toBe(sync2b)

            expect(async2).toBe(async2a)
            expect(async2).toBe(async2b)
        }

        expect(sync1).not.toBe(sync2)
        expect(async1).not.toBe(async2)
    })

    test('cyclic with Optional', async () => {
        interface Custom1 { a: Custom2 }
        interface Custom2 { b: () => Promise<Custom1 | undefined> }
        class CustomKey1 extends TypeKey<Custom1>() {
            private _: any
            static scope = Singleton
        }
        class CustomKey2 extends TypeKey<Custom2>() { private _: any }

        const MyModule = Module(ct => ct
            .provideAsync(CustomKey1, Inject.from({ a: CustomKey2 }))
            .provide(CustomKey2, Inject.from({ b: CustomKey1.Optional().Async().Lazy() }))
        )

        await MyModule.injectAsync([CustomKey1, CustomKey2] as const, async ([c1, c2]) => {
            expect(c1).toBe(await c2.b())
        })

        await MyModule.injectAsync([CustomKey2, CustomKey1] as const, async ([c2, c1]) => {
            expect(c1).toBe(await c2.b())
        })
    })

    test('cyclic with Unchecked', () => {
        interface Custom1 { a: Custom2 }
        interface Custom2 { b: () => Custom1 }
        class CustomKey1 extends TypeKey<Custom1>() {
            private _: any
            static scope = () => Singleton
        }
        class CustomKey2 extends TypeKey<Custom2>() { private _: any }

        const MyModule = Module(ct => ct
            .provide(CustomKey1, Inject.from({ a: CustomKey2 }))
            .provide(CustomKey2, Inject.from({ b: CustomKey1.Unchecked().Lazy() }))
        )

        MyModule.inject([CustomKey1, CustomKey2] as const, ([c1, c2]) => {
            expect(c1).toBe(c2.b())
        })

        MyModule.inject([CustomKey2, CustomKey1] as const, ([c2, c1]) => {
            expect(c1).toBe(c2.b())
        })
    })

    test('cyclic with Cyclic', () => {
        interface Custom1 { a: Custom2 }
        interface Custom2 { b: () => Custom1 }
        class CustomKey1 extends TypeKey<Custom1>() {
            private _: any
            static scope = Singleton
        }
        class CustomKey2 extends TypeKey<Custom2>() { private _: any }

        const MyModule = Module(ct => ct
            .provide(CustomKey1, Inject.from({ a: CustomKey2 }))
            .provide(CustomKey2, Inject.from({ b: CustomKey1.Cyclic().Lazy() }))
        )

        MyModule.inject([CustomKey1, CustomKey2] as const, ([c1, c2]) => {
            expect(c1).toBe(c2.b())
        })

        MyModule.inject([CustomKey2, CustomKey1] as const, ([c2, c1]) => {
            expect(c1).toBe(c2.b())
        })
    })

    test('README sample', () => {
        class NameKey extends TypeKey<string>() { private _: any }
        class IdKey extends TypeKey<number>() { private _: any }

        class User {
            name: string
            id: number
            constructor(name: string, id: number) {
                this.name = name; this.id = id
            }

            static inject = Inject.construct(this, NameKey, IdKey)
        }

        class App {
            user: User
            constructor(user: User) {
                this.user = user
            }
        }

        const UserModule = Module(ct => ct
            .provideInstance(NameKey, 'Alice')
            .provideInstance(IdKey, 123)
        )

        const AppModule = Module(UserModule, ct => ct
            .provide(App, { user: User }, ({ user }) => new App(user))
        )

        AppModule.inject({ app: App }, ({ app }) => {
            // console.log(`Welcome, ${app.user.name}`)
            expect(app.user.name).toEqual('Alice')
        })
    })
})
