# checked-inject

WIP

## Injection

### Containers

A [Container](https://youngspe.github.io/checked-inject/classes/Container.html)
is used to provide injections and request resources, solving the dependency graph at compile time and runtime.
An empty container is obtained through
[`Container.create()`](https://youngspe.github.io/checked-inject/classes/Container.html#create)

#### Providing Resources

You can build a container by creating it, then providing resources in a method chain.
It's important to use the last container returned from the method chain so the
type system is aware of the full dependency graph.

In the following methods, `key` is either a TypeKey or a class.

`provideInstance(key, value)` specifies a value to directly return when the given key is requested.

`provide(key, [scope], dep, init)` supplies a function that will be called when the given key is requested.
`dep` specifies the dependencies of the resource you're providing.
The dependencies are passed to the function `init`, which returns the resources' value.
`scope` is an optional parameter. It can either be a Scope or an arbitrarily-nested list of Scopes.
When provided, the provided resource is bound to the given Scope(s).

`provider(key, [scope], computedKey)`
supplied a `ComputedKey` that resolves to the resource to be returns when `key` is requested.

```ts
const container = Container.create()
  .provideInstance(NameKey, 'Alice')
  .provideInstance(IdKey, 123)
  .provide(User,
    { name: NameKey, id: IdKey }, ({ name, id }) => new User(name, id))
  .provide(Foo, Inject.map(IdKey, id => new Foo(id)))
```

#### Requesting Resources

```ts
// 'request' returns the resource
let user: User = container.request(User)
// 'inject' calls the given function with the resource as an argument
container.inject(User, user => console.log(user.name, user.id))
```

#### Compile-Time Checks

This library is centered around verifying all dependencies are met within the type system.

If you request a resource and any of its transitive dependencies are unavailable,
there will be a compile error ending with something like:
`Type 'void' is not assignable to type 'typeof Foo | typeof Bar'.`
where Foo and Bar are resources that are needed but not provided.

### Scopes, Child Containers, and Subcomponents

A _child container_ is a container that inherits all of its parent's provided resources.
It can be created with
[`Container#createChild`](https://youngspe.github.io/checked-inject/classes/Container.html#createChild).

A container can be assigned one or more
[Scopes](https://youngspe.github.io/checked-inject/interfaces/Scope-1.html),
and a provided resource can be associated with one or more Scopes.
When a resource is scoped, its value is stored in the nearest container in the ancestor chain
that either:
* Has a provider for the resource
* Contains one or more of the requested scopes

Because of this rule, if you provide a scoped resource to a child container of the one assigned the scope,
the stored value will not be visible to consumers of the parent container or its sibling containers, and it will be safe to depend on resources also provided to the child container:


In the following example,
it's safe for the 'Baz' to reference 'Bar' even though 'Bar' isn't in the parent container or bound to 'MyScope
 because it's provided in the child container rather than the parent:

```ts
const parent = Container.create()
  .addScope(MyScope)
  .provide(Foo, {}, () => new Foo())

const child = parent.createChild()
  .provide(Bar, { foo: Foo }, ({ foo }) => new Bar(foo))
  .provide(Baz, MyScope, { bar: Bar }, ({ bar }) => new Baz(bar))

const baz1 = child.request(Baz)
const baz2 = child.request(Baz)

console.log(baz1 === baz2) // prints 'true'
```

This example will fail to compile with:
`Type 'void' is not assignable to type 'typeof Bar'.`
because Bar is not found in MyScope from the container where Baz is provided:

```ts
const parent = Container.create()
  .addScope(MyScope)
  .provide(Foo, {}, () => new Foo())
  .provide(Baz, MyScope, { bar: Bar }, ({ bar }) => new Baz(bar))

const child = parent.createChild()
  .provide(Bar, { foo: Foo }, ({ foo }) => new Bar(foo))

const baz = child.request(Baz)
```

If you request a resource and any Scope it's bound to is not assigned to this container or its ancestors,
there will be a compile error ending with something like:
`Type 'void' is not assignable to type 'typeof MyScope'.`
where `MyScope` is a Scope a dependency is bound to but is not available.

### Modules

You can group providers into
[Modules](https://youngspe.github.io/checked-inject/interfaces/Module-1.html) using the
[`Module()`](https://youngspe.github.io/checked-inject/functions/Module.html) function.
This function takes a lambda that accepts a Container.Builder to which
you can provide resources just like a Container.
`Container#apply(module)` applies all providers in the Module to the container.
Modules also have a `container()` method that returns a new container with the Module applied to it.
Additionally, Modules have `request[Async]` and `inject[Async]` methods
that internally creates a Container and calls the respective Container method.

```ts
const UserModule = Module(ct => ct
  .provideInstance(NameKey, 'Alice')
  .provideInstance(IdKey, 123)
  .provide(User, Inject.construct(User, NameKey, IdKey))
)

// These two lines are equivalent:
const container1 = Container.create().apply(UserModule)
const container2 = UserModule.container()

// You also call 'request[Async]' or 'inject[Async]' without directly creating
// a 'Container':
UserModule.inject(User, user => {
  console.log(user.name, user.id)
})
```

Modules can be combined into a single module:

```ts
const AppModule = Module(UserModule, DataModule, FooModule)

AppModule.inject(App, app => {
  // ...
})
```

### Asynchronous Resources

Not all resources are available immediately.
Using [`Container#provideAsync`](https://youngspe.github.io/checked-inject/classes/Container.html#provideAsync),
you can provide a Promise that will eventually resolve to the provided resource.
Any resource depending on an asynchronous resource is itself resolved asynchronously.

Asynchronous resources can be resolved with
[`Container#requestAsync`](https://youngspe.github.io/checked-inject/classes/Container.html#requestAsync)
or
[`Container#injectAsync`](https://youngspe.github.io/checked-inject/classes/Container.html#injectAsync).
These methods are analogous to their non-async counterparts. The only differences are:
- The async versions can resolve asynchronous resources
- They return a Promise rather than directly returning the value
- injectAsync's function can be an async function

```ts
let container = Container.create()
  .provideInstance(NameKey, 'Alice')
  .provideAsync(IdKey, {}, async () => 123)
  .provide(User, Inject.construct(User, NameKey, IdKey))

// This is okay since 'NameKey' is available synchronously:
let name1: string = container.request(NameKey)

// This will fail since 'IdKey' is an asynchronous resource:
// let id1: number = container.request(IdKey)

// This will fail since 'User' depends on 'IdKey', which is asynchronous:
// let user1: User = container.request(User)

// The following are all allowed:
let name2: Promise<string> = container.requestAsync(NameKey)
let id2: Promise<number> = container.requestAsync(IdKey)
let user2: Promise<User> = container.requestAsync(User)
```

To synchronously resolve a Promise for the resource rather than asynchronously waiting for the resource to complete, use
[`Inject.async`](https://youngspe.github.io/checked-inject/functions/Inject.async-1.html)
or [`(TypeKey|ComputedKey|typeof Injectable)#Async()`](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html#Async):

```ts
let user1: Promise<User> = container.request(Inject.async(User))
// This works if 'User' extends 'Injectable':
let user2: Promise<User> = container.request(User.Async())
```


If you request an asynchronous resource synchronously,
there will be a compile error ending with something like:
`Type 'void' is not assignable to type 'NotSync<typeof Foo>'.`
where `Foo` is an asynchronous resource.


## DependencyKey

A [DependencyKey](https://youngspe.github.io/checked-inject/types/DependencyKey.html)
identifies a resource that can be injected. It may be a dependency of another resource
or requested directly from a container.

There are multiple kinds of DependencyKeys:

### Class

An [InjectableClass](https://youngspe.github.io/checked-inject/interfaces/InjectableClass.html)\<T>
is any class object that optionally has a
`static scope: extends `
[`ScopeList`](https://youngspe.github.io/checked-inject/types/ScopeList.html)
and/or a
`static inject: extends `
[`ComputedKey`](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)
`<T>` property.

#### Examples

```ts
class User {
  name: string
  id: number
  constructor(name: string, id: number) {
    this.name = name; this.id = id
  }
}
```

```ts
class UserManager {
  private userApiClient: UserApiClient
  constructor(userApiClient: UserApiClient) {
    this.userApiClient
  }
  // If 'UserManager' is not explicitly provided to the container, the value of
  // 'inject' will be used to resolve it instead.
  static inject = Inject.construct(this, UserApiClient)
}
```

```ts
abstract class UserApiClient {
  abstract getUser(id: number): Promise<User>

  // Instances of 'UserApiClient' will be stored and reused for all containers
  // marked with the scope called 'UserScope'
  static scope: UserScope
}
```

```ts
class ApiConfig {
  appId: string
  apiKey: string

  // All root containers are automatically marked with 'Singleton', so a single
  // instance of 'ApiConfig' will be created and reused within the container
  // it's provided to.
  static scope: Singleton
}
```

#### Injectable

Though optional, classes can extend
[Injectable](https://youngspe.github.io/checked-inject/classes/Injectable.html),
which does the following:
- Prevent `static scope` from being assigned a value that does not extend
  [ScopeList](https://youngspe.github.io/checked-inject/types/ScopeList.html)
- Prevent `static inject` from being assigned a value that does not extend
  [ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)
  `<T>`
- Add static operator methods equivalent to those on
  [TypeKey](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html)
  and [ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)
  and analogous to the methods on
  [Inject](https://youngspe.github.io/checked-inject/modules/Inject.html)
  like `Lazy()`, `Provider()`, `Async()`, `Optional()`

```ts
class User extends Injectable {
  name: string
  id: number
  constructor(name: string, id: number) {
    super(); this.name = name; this.id = id
  }
}

// Later, we can use operators like 'Optional()' when requesting 'User':

const MyModule = Module(ct => ct
  .provide(Foo, { user: User.Optional() }, ({ user }) => new Foo(user))
)
```

### TypeKey

A [TypeKey](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html)
specifies a resource not tied to a specific class object--like a named dependency.

To ensure each TypeKey has its own distinct type, a `TypeKey<T>` is declared as a class extending `TypeKey<T>()` with at least one private member:

```ts
class NameKey extends TypeKey<string>() { private _: any }
class IdKey extends TypeKey<number>() { private _: any }

// You can set a 'ComputedKey' like `Inject.map(...)' as a default provider.
// If 'CurrentUser' is not explicitly provided to a container, the default
// provider will be used to resolve it.
class CurrentUserKey extends TypeKey({
  default: Inject.map([NameKey, IdKey], ([name, id]) => new User(name, id)),
}) { private _: any }
```

A TypeKey may also have a `static scope: extends`
[`ScopeList`](https://youngspe.github.io/checked-inject/types/ScopeList.html)
that binds its resource to one or more scopes:

```ts
class MyKey extends TypeKey<string>() {
  private _: any
  static scope = Singleton
}
```

### Structured Keys:

DependencyKeys can also be structured into arrays or objects
of the form `DependencyKey[]` or `{ [k: string]: DependencyKey }` like so:

```ts
const [name, id, user] = container.request([NameKey, IdKey.Provider(), User])
```

```ts
const { name, id, user } = container.request({
  name: NameKey,
  id: IdKey.Provider(),
  user: User,
})
```

If you want you can even nest structured keys:

```ts
const { userInfo: { name, id } }  = container.request({
  userInfo: { name: NameKey, id: IdKey },
})
```

### ComputedKey

A [ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)
transforms a dependency into another type.
Implementations are found in the
[Inject](https://youngspe.github.io/checked-inject/modules/Inject.html)
namespace.

These methods can operate over any DependencyKey, even structured keys:

```ts
const f = container.request(Inject.provider({
  name: NameKey,
  id: IdKey,
}))

const { name, id } = f()
```

Some common ComputedKeys include the following:

#### Lazy, Provider

[`Inject.lazy(src)`](https://youngspe.github.io/checked-inject/functions/Inject.lazy.html)
and
[`Inject.provider(src)`](https://youngspe.github.io/checked-inject/functions/Inject.provider.html)
both resolve to a function returning the target type of `src`.
`lazy` caches the result after the first call, whereas `provider` resolves
the resource every time it's called.
TypeKeys, ComputedKeys, and class objects that
extends Injectable have analogous methods called
[`Lazy()`](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html#Lazy)
and
[`Provider()`](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html#Provider).

Because the resulting function returns synchronously,
these methods can only be used on dependencies that can be resolved synchronously.
To resolve asynchronously, use `Inject.async(MyKey).Lazy()/Provider()`
or (if MyKey is a TypeKey or class object that extends Injectable)
`MyKey.Async().Lazy()/Provider()`.

This will yield a value of type `() => Promise<Target<MyKey>>`.

#### Async

[`Inject.async(src)`](https://youngspe.github.io/checked-inject/functions/Inject.async-1.html)
resolves the given dependency as a `Promise`.
This allows you to request dependencies that cannot be resolved synchronously
without having to use `requestAsync` or `injectAsync`.
Instead the dependent resource can await the promises independently.

See also
[`Async()`](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html#Async)

```ts
class UserInfo {
  name: string
  private _id: Promise<number>
  getIdAsync() { return _id }

  constructor(name: string, id: Promise<number>) {
    this.name = name; this._id = id
  }
}

const ct = Container.create()
//.provide(UserService, ...)
  .provideAsync(IdKey,
    { service: UserService}, ({ service }) => service.getIdAsync())
  .provide(UserInfo, Inject.construct(UserInfo, NameKey, IdKey.Async()))

// This would be a compile error because IdKey is not provided synchronously:
// const id = container.request(IdKey)

// This is okay because Async() provides the value synchronously as a promise:
let id = await container.request(IdKey.Async())
// It's equivalent to this:
id = await container.requestAsync()

// This is okay even though it requires IdKey because it uses Async():
const userInfo = container.request(UserInfo)

// userInfo is created but we still have to await IdKey's promise to get the id:
id = await userInfo.getIdAsync()
```

#### Map

[`Inject.map(dep, transform)`](https://youngspe.github.io/checked-inject/functions/Inject.map-1.html)
resolves to a transformation over another dependency.

See also
[`Map(transform)`](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html#Map).

```ts
const user: User = container.request(Inject.map({
  name: NameKey,
  id: IdKey,
}), ({ name, id}) => new User(name, id))
```

This is useful for default injections:

```ts
class User {
  name: string
  id: number
  constructor(name: string, id: number) {
    this.name = name; this.id = id
  }

  static inject = Inject.map({
    name: NameKey,
    id: IdKey,
  }, ({ name, id }) => new User(name, id))
}

class UserKey extends TypeKey({
  default: Inject.map({
    name: NameKey,
    id: IdKey,
  }, ({ name, id }) => new User(name, id))
}) { private _: any }
```

#### Construct

[`Inject.construct(ctor, ...deps)`](https://youngspe.github.io/checked-inject/functions/Inject.construct.html)
resolves to the instantiation of the given class contructor given the following dependencies.
It's equivalent to `Inject.map(ctor, [...deps], ([...args]) => new ctor(...args))`.


```ts
const user: User = container.request(Inject.construct(User, NameKey, IdKey))
```

This is useful for default injections:

```ts
class User {
  name: string
  id: number
  constructor(name: string, id: number) {
    this.name = name; this.id = id
  }

  static inject = Inject.construct(this, NameKey, IdKey)
}

class UserKey extends TypeKey({
  default: Inject.construct(User, NameKey, IdKey)
}) { private _: any }
```

or dependency providers:

```ts
const container = Container.create()
  .provide(User, Inject.construct(User, NameKey, IdKey))
```

### Target Types

[Target](https://youngspe.github.io/checked-inject/types/Target.html)\<K>,
where K extends DependencyKey, indicates what type the K resolves to when requested
from a container:

<table>
<tr><th>Kind</th><th>Key</th><th> Target Type</th></tr>


<!-- TypeKey examples: -->
<tr>
<td>

[TypeKey](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html)
\<string>

</td>
<td>NameKey</td>
<td>string</td>
</tr>

<tr>
<td>

[TypeKey](https://youngspe.github.io/checked-inject/interfaces/TypeKey-1.html)
\<number>

</td>
<td>IdKey</td>
<td>number</td>
</tr>


<!-- InjectableClass examples: -->
<tr>
<td>

[InjectableClass](https://youngspe.github.io/checked-inject/interfaces/InjectableClass.html)
\<User>

</td>
<td>User</td>
<td>User</td>
</tr>


<!-- ComputedKey examples: -->
<tr>
<td>

[ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)

</td>
<td>

One of:

```ts
NameKey.Provider()
Inject.provider(NameKey)
```

</td>
<td>

`() => string`

</td>
</tr>

<tr>
<td>

[ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)

</td>
<td>

One of:

```ts
IdKey.Map(id => id.toString())
Inject.map(IdKey, id => id.toString())
```

</td>
<td>

string

</td>
</tr>

<tr>
<td>

[ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)

</td>
<td>

One of:

```ts
Inject.async(User).Lazy()
Inject.lazy(Inject.async(User))
// If 'User' extends 'Injectable':
User.Async().Lazy()
```

</td>
<td>

`() => Promise<User>`

</td>
</tr>


<!-- Structued key examples: -->
<tr>
<td>Object key</td>
<td>

```ts
{
  name: NameKey,
  id: IdKey.Provider(),
  user: User,
}
```

</td>
<td>

```ts
{
  name: string,
  id: () => number,
  user: User,
}
```

</td>
</tr>

<tr>
<td>Array key</td>
<td>

```ts
[NameKey, IdKey.Provider(), User]
```

</td>
<td>

```ts
[string, () => number, User]
```

</td>
</tr>
</table>
