import { Container, Errors, Inject, Scope, Singleton, TypeKey } from '../lib'
import { _assertContainer, _because } from '../lib/Container'

class NumberKey extends TypeKey<number>() { private _: any }
class StringKey extends TypeKey<string>() { private _: any }
class ArrayKey extends TypeKey<string[]>() { private _: any }
class BooleanKey extends TypeKey<boolean>() { private _: any }

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

        await _assertContainer(parent).cannotRequest(CustomKey, _because<typeof MyScope | typeof NumberKey>())
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

        await _assertContainer(parent).cannotRequest(CustomKey, _because<typeof MyScope | typeof NumberKey>())
        await _assertContainer(child1).cannotRequest(CustomKey, _because<typeof NumberKey>())
        await _assertContainer(grandChild1).cannotRequest(CustomKey, _because<typeof NumberKey>())
    })
})
