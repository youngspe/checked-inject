import { Inject, Module, TypeKey } from '../lib'
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

        _assertContainer(AppModule).cannotRequestSync(AppKey, _because<never, typeof FooService | typeof Keys.UserId>())
        const out = await AppModule.injectAsync({ AppKey }, deps => deps.AppKey)

        expect(out).toEqual({
            fooService: new FooService(),
            barService: new BarService(),
            user: new User('alice', '123'),
        })
    })
})
