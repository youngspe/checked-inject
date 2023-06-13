import { Container, GetLazy, Scope, Singleton, TypeKey } from '../lib'

const NumberKey = new TypeKey<number>()
const StringKey = new TypeKey<string>()
const ArrayKey = new TypeKey<string[]>()
const BooleanKey = new TypeKey<boolean>()

describe(Container, () => {
    test('provide and request', () => {
        const target = new Container()

        const out = target.provide(NumberKey, {}, () => 10).request(NumberKey);

        expect(out).toEqual(10)
    })

    test('provideInstance and request', () => {
        const target = new Container()

        const out = target.provideInstance(NumberKey, 10).request(NumberKey)

        expect(out).toEqual(10)
    })

    test('request structured dependencies', () => {
        const target = new Container()

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {}, () => ['a', 'b'])
            .request({
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
        const target = new Container()

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
        const target = new Container()

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, {}, () => ['a', 'b'])
            .request({
                a: NumberKey,
                b: StringKey,
                c: { d: ArrayKey, e: BooleanKey.Optional }
            })

        expect(out).toEqual({
            a: 10,
            b: 'foo',
            c: { d: ['a', 'b'], e: undefined }
        })
    })

    test('inject lazy structured dependencies', () => {
        const target = new Container()

        const out = target
            .provideInstance(NumberKey, 10)
            .provide(StringKey, {}, () => 'foo')
            .provideInstance(BooleanKey, true)
            .provide(ArrayKey, {
                a: NumberKey.Lazy,
                b: new GetLazy({ c: StringKey }),
                c: BooleanKey,
            }, ({ a, b }) => [a().toString(), b().c])
            .request(ArrayKey)

        expect(out).toEqual(['10', 'foo'])
    })

    test('inject structured provider dependencies', () => {
        const target = new Container()
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
                b: { c: StringKey.Provider },
                c: BooleanKey,
            }, ({ a, b: { c } }) => [a.toString(), c(), c()])
            .request(ArrayKey)

        expect(out).toEqual(['10', 'foo', 'foo'])
        expect(sideEffect).toEqual(2)
    })

    test('child container defers to parent to get missing dependencies', () => {
        const target = new Container()
            .provideInstance(NumberKey, 10)
            .provideInstance(BooleanKey, false)
            .provide(ArrayKey, {
                a: NumberKey,
                b: { c: StringKey },
                d: BooleanKey,
            }, ({ a, b: { c }, d }) => [a.toString(), c, d.toString()])

        const child = target.createChild({}, ct => ct
            .provide(StringKey, {}, () => 'foo')
            .provideInstance(BooleanKey, true)
        )

        const out = child.request(ArrayKey)
        expect(out).toEqual(['10', 'foo', 'true'])
    })

    test('singleton returns the same instance every time', () => {
        const target = new Container()
        const CustomKey = new TypeKey<{ num: number, str: string, bool: boolean }>()

        target
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
        const MyScope = new Scope()

        const parent = new Container()
            .provide(NumberKey, {}, () => 10)
            .provide(StringKey, {}, () => 'foo')
            .provide(ArrayKey, MyScope, { num: NumberKey, str: StringKey }, ({ num, str }) => [num.toString(), str])

        const child1 = parent.createChild({ scope: MyScope }, ct => ct.provide(NumberKey, {}, () => 20))
        const grandChild1a = child1.createChild({}, ct => ct.provide(StringKey, {}, () => 'bar'))
        const grandChild1b = child1.createChild({}, ct => ct.provide(NumberKey, {}, () => 30))

        const out1 = child1.request(ArrayKey)

        expect(out1).toEqual(['20', 'foo'])
        expect(grandChild1a.request(ArrayKey)).toBe(out1)
        expect(grandChild1b.request(ArrayKey)).toBe(out1)

        const child2 = parent.createChild({ scope: MyScope }, ct => ct.provide(NumberKey, {}, () => 40))
        const grandChild2a = child2.createChild({}, ct => ct.provide(StringKey, {}, () => 'baz'))
        const grandChild2b = child2.createChild({}, ct => ct.provide(NumberKey, {}, () => 50))

        const out2 = grandChild2a.request(ArrayKey)

        expect(out2).toEqual(['40', 'foo'])
        expect(child2.request(ArrayKey)).toBe(out2)
        expect(grandChild2b.request(ArrayKey)).toBe(out2)

        expect(parent.request(ArrayKey.Optional)).not.toBeDefined()
        expect(out2).not.toBe(out1)
    })
})
