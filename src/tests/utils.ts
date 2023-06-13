export function StaticAssert<_T extends true>() { }


export type And<A> = A extends true[] ? true : A extends boolean[] ? false : unknown
export type Or<A> = A extends false[] ? false : A extends boolean[] ? true : unknown

export type Equal<A> =
    A extends [] ? true :
    A extends [infer X, ...infer Rest] ? ([X, ...Rest] extends [...Rest, X] ? true : false) :
    unknown

export type Extends<Sub, Super> = Sub extends Super ? true : false
