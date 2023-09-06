import { Container, Errors, Inject, Module, Scope, Singleton, TypeKey, FactoryKey, Injectable, LazyKey } from '@lib'
import { _assertContainer, _because } from '@lib/Container'
import { CycleDetected } from '@lib/Dependency'

class NumberKey extends TypeKey<number>() { private _: any }
class StringKey extends TypeKey<string>() { private _: any }
class ArrayKey extends TypeKey<string[]>() { private _: any }

// Tests that verify requests fail at compile-time and runtime when dependencies are not met
describe(Errors.InjectError, () => {
    test('inject structured dependencies', async () => {
        const target = Container.create()
            .provideInstance(NumberKey, 10)
            // .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {
                a: NumberKey,
                b: { c: StringKey },
            }, ({ a, b: { c } }) => [a.toString(), c])

        await _assertContainer(target).cannotRequest(StringKey, _because<typeof StringKey>())
        await _assertContainer(target).cannotRequest(ArrayKey, _because<typeof StringKey>())
    })

    test('TypeKey.default is Inject.map', async () => {
        // Non-singleton
        class CustomKey1 extends TypeKey({
            default: Inject.map({ num: NumberKey }, ({ num }) => ({ a: num })),
        }) { private _: any }
        // Singleton
        class CustomKey2 extends TypeKey({
            default: Inject.map({ str: StringKey }, ({ str }) => ({ b: str })),
        }) {
            private _: any
            static readonly scope = Singleton
        }

        const target = Container.create()
        // .provideInstance(NumberKey, 1)
        // .provideInstance(StringKey, 'foo')

        await _assertContainer(target).cannotRequest(CustomKey1, _because<typeof NumberKey>())
        await _assertContainer(target).cannotRequest(CustomKey2, _because<typeof StringKey>())
    })

    test('TypeKey.Optional() is async but has missing dependencies', async () => {
        class CustomKey1 extends TypeKey({
            default: Inject.map({ str: StringKey }, ({ str }) => ({ b: str })),
        }) { private _: any }

        const target = Container.create()
            .provideAsync(StringKey, { num: NumberKey }, ({ num }) => num.toString())
        // .provideInstance(NumberKey, 123)

        await _assertContainer(target).cannotRequest(CustomKey1, _because<typeof NumberKey>())
        await _assertContainer(target).cannotRequestSync(CustomKey1.Optional(), _because<never, typeof StringKey>())
        await _assertContainer(target).cannotRequest(CustomKey1.Optional().Lazy(), _because<never, typeof StringKey>())
        await _assertContainer(target).cannotRequest(CustomKey1.Optional().Provider(), _because<never, typeof StringKey>())
        await _assertContainer(target).canRequest(CustomKey1.Optional().Async().Lazy())
    })

    test('TypeKey.scope is respected when no scope is provided', async () => {
        class MyScope extends Scope() { private _: any }
        class CustomKey extends TypeKey<{ a: number }>() {
            private _: any
            static readonly scope = MyScope
        }

        const parent = Container.create()
            .provide(CustomKey, { num: NumberKey }, ({ num }) => ({ a: num, }))

        const child1 = parent
            .createChild()
            .addScope(MyScope)
        // .provideInstance(NumberKey, 20)
        const grandChild1 = child1
            .createChild()
            // .addScope(MyScope)
            .provideInstance(NumberKey, 30)

        await _assertContainer(parent).cannotRequest(CustomKey, _because<typeof MyScope>())
        await _assertContainer(child1).cannotRequest(CustomKey, _because<typeof NumberKey>())
        await _assertContainer(grandChild1).cannotRequest(CustomKey, _because<typeof NumberKey>())
    })

    test('Provided scope added to TypeKey.scope', async () => {
        class MyScope extends Scope() { private _: any }
        class CustomKey extends TypeKey<{ a: number }>() {
            private _: any
            static readonly scope = Singleton
        }

        const parent = Container.create()
            .provide(CustomKey, MyScope, { num: NumberKey }, ({ num }) => ({ a: num, }))

        const child1 = parent
            .createChild()
            .addScope(MyScope)
        // .provideInstance(NumberKey, 20)
        const grandChild1 = child1
            .createChild()
            // .addScope(MyScope)
            .provideInstance(NumberKey, 30)

        await _assertContainer(parent).cannotRequest(CustomKey, _because<typeof MyScope>())
        await _assertContainer(child1).cannotRequest(CustomKey, _because<typeof NumberKey>())
        await _assertContainer(grandChild1).cannotRequest(CustomKey, _because<typeof NumberKey>())
    })

    test('basic cycle', async () => {
        const MyModule = Module(ct => ct
            .provide(StringKey, { num: NumberKey }, ({ num }) => num.toString())
            .provide(NumberKey, { str: StringKey }, ({ str }) => str.length)
        )

        await _assertContainer(MyModule).cannotRequest(StringKey, _because<CycleDetected<StringKey>>())
        await _assertContainer(MyModule).cannotRequest(NumberKey, _because<CycleDetected<NumberKey>>())
    })

    test('SubcomponentDefinition.Resolve() with cycles', () => {
        class UserScope extends Scope() { private _: any }
        interface UserInfo { userName: string, userId: string }

        function Keys() { }
        Keys.Subcomponent = Inject.subcomponent((ct, userName: string, userId: string) => ct
            .addScope(UserScope)
            .provideInstance(Keys.UserName, userName)
            .provideInstance(Keys.UserId, userId)
        )
        Keys.UserId = class extends TypeKey<string>() { private _: any }
        Keys.UserName = class extends TypeKey<string>() { private _: any }
        Keys.UserInfo = class extends TypeKey<UserInfo>() { private _: any }
        Keys.UserInfo1 = class extends TypeKey<{ a: UserInfo, b: UserInfo }>() { private _: any }
        Keys.UserInfo2 = class extends TypeKey<{ a: UserInfo, b: UserInfo }>() { private _: any }

        const UserModule = Module(ct => ct
            .provide(Keys.UserInfo1, Keys.Subcomponent.Resolve({
                a: Keys.UserInfo,
                b: Keys.UserInfo1.Lazy(),
            }), f => {
                const { a, b } = f('alice', '123')
                return { a, get b() { return b().a } }
            })
            .provide(Keys.UserInfo2, UserScope, {
                a: Keys.UserInfo,
                b: Keys.UserInfo2.Lazy(),
            }, ({ a, b }) => ({ a, get b() { return b().a } })
            )
        )

        const MyModule = Module(UserModule, ct => ct
            .provide(Keys.UserInfo, UserScope, Inject.from({ userId: Keys.UserId, userName: Keys.UserName }))
        )

        _assertContainer(MyModule).cannotRequest(Keys.UserInfo1, _because<CycleDetected<typeof Keys.UserInfo1>>())
        _assertContainer(MyModule).cannotRequest(
            Keys.Subcomponent.Resolve(Keys.UserInfo2).Build('bob', '456'),
            _because<CycleDetected<typeof Keys.UserInfo2>>(),
        )
    })

    test('SubcomponentDefinition.Resolve() with cycles (more complex)', () => {
        class MyScope extends Scope() { private _: any }
        const MySubcomponent = Inject.subcomponent((ct, num: number) => ct
            .addScope(MyScope)
            .provideInstance(NumberKey, num)
        )

        class NumberKey extends TypeKey<number>() { private _: any }
        class BaseFoo extends Injectable { private a: any }
        class Foo extends BaseFoo {
            private b: any
            static scope = Singleton
            static inject = () => Inject.map({ bar: BarKey }, () => new Foo())
        }

        class BarKey extends TypeKey<() => Bar>() { private _: any }
        class Bar {
            private _: any
            static Factory = class BarFactory extends FactoryKey(LazyKey(() => ({
                foo: BaseFoo.Lazy(),
                baz: MySubcomponent.Resolve(Baz).Lazy(),
            })), () => new Bar()) { private _: any }
        }

        class Baz {
            private _: any
            static scope = MyScope
            static inject = Inject.lazy(BaseFoo)
        }

        const MyModule = Module(ct => ct
            .bind(BaseFoo, Foo)
            .bind(BarKey, Bar.Factory)
        )

        _assertContainer(MyModule).cannotRequest(Foo, _because<CycleDetected<any>>())
    })
})
