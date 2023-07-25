/**
 * @packageDocumentation
 *
 * A dependency injection library that verifies all dependencies are met at compile time.
 * ```ts
 * class NameKey extends TypeKey<string>() { private _: any }
 * class IdKey extends TypeKey<number>() { private _: any }
 *
 * class User {
 *   name: string
 *   id: number
 *   constructor(name: string, id: number) {
 *     this.name = name; this.id = id
 *   }
 *
 *   static inject = Inject.construct(this, NameKey, IdKey)
 * }
 *
 * class App {
 *   user: User
 *   constructor(user: User) {
 *     this.user = user
 *   }
 * }
 *
 * const UserModule = Module(ct => ct
 *   .provideInstance(NameKey, 'Alice')
 *   .provideInstance(IdKey, 123)
 * )
 *
 * const AppModule = Module(UserModule, ct => ct
 *   .provide(App, { user: User }, ({ user }) => new App(user))
 * )
 *
 * AppModule.inject({ app: App }, ({ app }) => {
 *   console.log(`Welcome, ${app.user.name}`)
 * })
 * ```
 *
 * Dependencies are injected to/from a {@link Container}, and can be combined into {@link Module | Modules}.
 */

export { Container } from './Container'
export { TypeKey, FactoryKey } from './TypeKey'
export { Inject } from './Inject'
export { ComputedKey } from './ComputedKey'
export { Scope, ScopeList, Singleton } from './Scope'
export { Module } from './Module'
export { Dependency } from './Dependency'
export { DependencyKey, Target } from './DependencyKey'
export { InjectableClass, Injectable } from './InjectableClass'
export *  as Errors from './InjectError'
