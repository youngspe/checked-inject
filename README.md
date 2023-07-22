# checked-inject

WIP

## DependencyKey

A [DependencyKey](https://youngspe.github.io/checked-inject/types/DependencyKey.html)
identifies a resource may be a dependency of another resource
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
    super()
    this.name = name; this.id = id
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
class CurrentUser extends TypeKey({
  default: Inject.map([NameKey, IdKey], ([name, id]) => new User(name, id)),
}) { private _: any }
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

[`Inject.async(src)`](https://youngspe.github.io/checked-inject/functions/Inject.async.html)
resolves the given dependency as a `Promise`.
This allows you to request dependencies that cannot be resolved synchronously
without having to use `requestAsync` or `injectAsync`.
Instead the dependent resource can await the promises independently.


### Target Types

[Target](https://youngspe.github.io/checked-inject/types/Target.html)\<K>,
where K extends DependencyKey, indicates what type the K resolves to when requested
from a container:


<table>
<tr><th>Kind</th><th>Key</th><th> Target Type</th></tr>
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
<tr>
<td>

[InjectableClass](https://youngspe.github.io/checked-inject/interfaces/InjectableClass.html)
\<User>

</td>
<td>User</td>
<td>User</td>
</tr>
<tr>
<td>

[ComputedKey](https://youngspe.github.io/checked-inject/classes/ComputedKey.html)

</td>
<td>

```ts
Inject.async(User).Lazy()
```
or
```ts
Inject.lazy(Inject.async(User))
```
or (if `User` extends `Injectable`)
```ts
User.Async().Lazy()
```

</td>
<td>

`() => Promise<User>`

</td>
</tr>
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
