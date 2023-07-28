import { Inject, Module, Scope, Target, TypeKey } from '../lib'
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
        class Keys {
            static UserId = class UserId extends TypeKey<string>() { private _: any }
            static UserName = class UserName extends TypeKey<string>() { private _: any }
            static UserInfo = class UserInfo extends TypeKey<{ userName: string, userId: string }>() { private _: any }
            static Subcomponent = Inject.subcomponent((ct, userName: string, userId: string) => ct
                .addScope(UserScope)
                .provideInstance(this.UserName, userName)
                .provideInstance(this.UserId, userId)
            )
            static UserInfo1 = Inject.map(this.Subcomponent.Resolve(this.UserInfo), f => f('alice', '123'))
            static UserInfo2 = class UserInfo extends TypeKey<Target<typeof this.UserInfo>>() { private _: any }
        }

        const UserModule = Module(ct => ct
            .provide(Keys.UserInfo2, Keys.Subcomponent.Resolve(Keys.UserInfo), f => f('bob', '456'))
        )

        const MyModule = Module(UserModule, ct => ct
            .provide(Keys.UserInfo, UserScope, { userId: Keys.UserId, userName: Keys.UserName }, x => x)
        )

        MyModule.inject({
            out1: Keys.UserInfo1,
            out2: Keys.UserInfo2
        }, ({ out1, out2 }) => {
            expect(out1).toEqual({ userName: 'alice', userId: '123' })
            expect(out2).toEqual({ userName: 'bob', userId: '456' })
        })
    })
})
