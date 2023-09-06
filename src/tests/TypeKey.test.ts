import { Target, TypeKey } from '@lib'
import { Equal, StaticAssert } from './utils'

describe(TypeKey, () => {
    test('dependency resolves to correct type', () => {
        StaticAssert<Equal<[
            Target<{
                a: TypeKey<1>,
                b: TypeKey<2>,
                c: [TypeKey<3>, TypeKey<4>],
                d: TypeKey<5>[]
                e: { f: { g: { h: TypeKey<6> } } }
            }>,
            {
                a: 1,
                b: 2,
                c: [3, 4],
                d: 5[],
                e: { f: { g: { h: 6 } } }
            },
        ]>>()
    })
})
