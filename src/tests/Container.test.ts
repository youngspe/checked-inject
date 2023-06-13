import { Container, GetLazy, TypeKey } from '../lib'

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

        const child = target.createChild(ct => ct
            .provide(StringKey, {}, () => 'foo')
            .provideInstance(BooleanKey, true)
        )

        const out = child.request(ArrayKey)
        expect(out).toEqual(['10', 'foo', 'true'])
    })
})
