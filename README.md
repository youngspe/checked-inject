# checked-inject

WIP

## Target types

<table>
<tr><th>Kind</th><th>Key</th><th> Target Type </th></tr>
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
<td>IdKey </td>
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
<table>
