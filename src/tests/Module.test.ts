import { FactoryKey, Inject, Injectable, LazyKey, Module, Scope, Singleton, Target, TypeKey } from '../lib'
import { _assertContainer, _because } from '../lib/Container'
import { sleep } from './utils'

namespace Keys {
    export class UserName extends TypeKey<string>() { private _: any }
    export class UserId extends TypeKey<string>() { private _: any }
}

class User {
    userName: string
    userId: string

    constructor(userName: string, userId: string) {
        this.userName = userName
        this.userId = userId
    }

    static readonly inject = Inject.construct(this, Keys.UserName, Keys.UserId)
}

class FooService {
    private foo = 'foo'
}

class BarService {
    private bar = 'bar'
}

describe(Module, () => {
    test('inject from Module', () => {
        const ServiceModule = Module(ct => ct
            .provide(FooService, () => new FooService())
            .provideInstance(BarService, new BarService())
        )
        const UserModule = Module(ct => ct
            .provideInstance(Keys.UserName, 'alice')
            .provideInstance(Keys.UserId, '123')
        )

        interface App {
            fooService: FooService,
            barService: BarService,
            user: User,
        }

        class AppKey extends TypeKey<App>() { private _: any }

        const AppModule = Module(ServiceModule, UserModule, ct => ct
            .provide(AppKey, { FooService, BarService, User }, deps => ({
                fooService: deps.FooService,
                barService: deps.BarService,
                user: deps.User,
            }))
        )

        const out = AppModule.inject({ AppKey }, deps => deps.AppKey)

        expect(out).toEqual({
            fooService: new FooService(),
            barService: new BarService(),
            user: new User('alice', '123'),
        })
    })

    test('injectAsync from Module', async () => {
        const ServiceModule = Module(ct => ct
            .provideAsync(FooService, () => sleep(5).then(() => new FooService()))
            .provideInstance(BarService, new BarService())
        )
        const UserModule = Module(ct => ct
            .provideInstance(Keys.UserName, 'alice')
            .provideAsync(Keys.UserId, () => sleep(7).then(() => '123'))
        )

        interface App {
            fooService: FooService,
            barService: BarService,
            user: User,
        }

        class AppKey extends TypeKey<App>() { private _: any }

        const AppModule = Module(ServiceModule, UserModule, ct => ct
            .provide(AppKey, { FooService, BarService, User }, deps => ({
                fooService: deps.FooService,
                barService: deps.BarService,
                user: deps.User,
            }))
        )

        await _assertContainer(AppModule).cannotRequestSync(AppKey, _because<never, typeof FooService | typeof Keys.UserId>())
        const out = await AppModule.injectAsync({ AppKey }, deps => deps.AppKey)

        expect(out).toEqual({
            fooService: new FooService(),
            barService: new BarService(),
            user: new User('alice', '123'),
        })
    })

    test('SubcomponentDefinition.Resolve()', () => {
        class UserScope extends Scope() { private _: any }

        function Keys() { }
        Keys.Subcomponent = Inject.subcomponent((ct, userName: string, userId: string) => ct
            .addScope(UserScope)
            .provideInstance(Keys.UserName, userName)
            .provideInstance(Keys.UserId, userId)
        )
        Keys.UserId = class extends TypeKey<string>() { private _: any }
        Keys.UserName = class extends TypeKey<string>() { private _: any }
        Keys.UserInfo = class extends TypeKey<{ userName: string, userId: string }>() { private _: any }
        Keys.UserInfo2 = class extends TypeKey<Target<typeof Keys.UserInfo>>() { private _: any }
        Keys.UserInfo1 = Inject.map(Keys.Subcomponent.Resolve(Keys.UserInfo), f => f('alice', '123'))

        const UserModule = Module(ct => ct
            .provide(Keys.UserInfo2, Keys.Subcomponent.Resolve(Keys.UserInfo), f => f('bob', '456'))
        )

        const MyModule = Module(UserModule, ct => ct
            .provide(Keys.UserInfo, UserScope, Inject.from({ userId: Keys.UserId, userName: Keys.UserName }))
        )

        MyModule.inject({
            out1: Keys.UserInfo1,
            out2: Keys.UserInfo2,
        }, ({ out1, out2 }) => {
            expect(out1).toEqual({ userName: 'alice', userId: '123' })
            expect(out2).toEqual({ userName: 'bob', userId: '456' })
        })
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
                b: Keys.UserInfo1.Cyclic().Lazy(),
            }), f => {
                const { a, b } = f('alice', '123')
                return { a, get b() { return b().a } }
            })
            .provide(Keys.UserInfo2, UserScope, {
                a: Keys.UserInfo,
                b: Keys.UserInfo2.Cyclic().Lazy(),
            }, ({ a, b }) => ({ a, get b() { return b().a } })
            )
        )

        const MyModule = Module(UserModule, ct => ct
            .provide(Keys.UserInfo, UserScope, Inject.from({ userId: Keys.UserId, userName: Keys.UserName }))
        )

        MyModule.inject({
            out1: Keys.UserInfo1,
            out2: Keys.Subcomponent.Resolve(Keys.UserInfo2).Build('bob', '456'),
        }, ({ out1: { a: a1, b: b1 }, out2: { a: a2, b: b2 } }) => {
            expect(a1).toEqual({ userName: 'alice', userId: '123' })
            expect(b1).toEqual(a1)

            expect(a2).toEqual({ userName: 'bob', userId: '456' })
            expect(b2).toBe(a2)
        })
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
            .bind(BaseFoo, Foo.Cyclic())
            .bind(BarKey, Bar.Factory)
        )

        _assertContainer(MyModule).canRequest(Foo)
    })
})
