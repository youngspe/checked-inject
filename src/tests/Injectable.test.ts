import { Inject, Injectable, Module, TypeKey } from "../lib";
import { sleep } from "./utils";

const Keys = {
    UserName: class extends TypeKey<string>() { static readonly keyTag = Symbol() },
    UserId: class extends TypeKey<string>() { static readonly keyTag = Symbol() },
} as const

describe(Injectable, () => {
    test('Injectable subclass operators using default', async () => {
        class User extends Injectable {
            name: string;
            id: string;
            constructor(name: string, id: string) {
                super()
                this.name = name
                this.id = id
            }
            static readonly inject = Inject.construct(this, Keys.UserName, Keys.UserId)
        }

        const { a, b, c } = await Module(ct => ct
            .provideInstance(Keys.UserName, 'alice')
            .provideAsync(Keys.UserId, () => sleep(5).then(() => '123'))
        ).container().requestAsync({
            a: User.Optional(),
            b: User.Async(),
            c: User.Map(u => u.name),
        })

        expect(a).toEqual({ name: 'alice', id: '123' })
        expect(b).toHaveProperty('then')
        expect(await b).toEqual({ name: 'alice', id: '123' })
        expect(c).toEqual('alice')
    })

    test('Injectable subclass operators using provide', async () => {
        class User extends Injectable {
            name: string;
            id: string;
            constructor(name: string, id: string) {
                super()
                this.name = name
                this.id = id
            }
        }

        const { a, b, c } = await Module(ct => ct
            .provideInstance(Keys.UserName, 'alice')
            .provideAsync(Keys.UserId, () => sleep(5).then(() => '123'))
            .provide(User, Inject.construct(User, Keys.UserName, Keys.UserId))
        ).container().requestAsync({
            a: User.Optional(),
            b: User.Async(),
            c: User.Map(u => u.name),
        })

        expect(a).toEqual({ name: 'alice', id: '123' })
        expect(b).toHaveProperty('then')
        expect(await b).toEqual({ name: 'alice', id: '123' })
        expect(c).toEqual('alice')
    })
})
