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
  // instance of `ApiConfig` will be created and reused within the container
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

WIP

### Target Types

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
