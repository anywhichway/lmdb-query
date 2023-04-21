# lmdb-query

ALERT: Breaking change from v1.0.3 to v1.1.0. Read [key matching](#key-matching).

A higher level query mechanism for LMDB supporting functional, declarative and RegExp filters without the overhead of an entire database wrapper.

Queries can match against keys, key fragments, values and value fragments and change result values or return just a subset of the top level/renamed/moved properties or nested/renamed/moved properties.

For example:

```javascript
    db.putSync("person1",{name:"John",age:30,address:{city:"Seattle","stateOrProvince":"WA",country:"US"}});
    db.putSync("person2",{age:30,address:{city:"Seattle","stateOrProvince":"WA",country:"US"}});
    const results = [...db.getRangeWhere(
        [/person.*/g], // match key starting with person
        {name:NOTNULL}, // match object with non-null name
        { // selected values
            age:30, // select age, you could modify this also (age) => age >= 21 ? age - 21 : undefined;
            address:{
                city(value,{root}) { root.city = value.toUpperCase(); }, // selects upper case city into root object
                [/.*(state).*/g]:(value) => value, // selects stateProvince as state because of RegExp group match
                country:ANY
            }
        })];
    // returns [{key:"person1",value:{age:30,city:"SEATTLE",address:{state:"WA",country:"US"}}}]
    expect(results.length).toBe(1);
    expect(results[0].key).toBe("person1");
    expect(results[0].value.name).toBe(undefined);
    expect(results[0].value.age).toBe(30);
    expect(results[0].value.city).toBe("SEATTLE");
    expect(results[0].value.address.state).toBe("WA");
    expect(results[0].value.address.country).toBe("US");
```

With the exception of the nested address for state and country, in SQL terms, this query would be:

```sql
SELECT age, UPPERCASE(address.city) as city
FROM PERSON, ADDRESS WHERE PERSON.id = ADDRESS.personId  AND id LIKE "person%" AND name IS NOT NULL AND age = 30
```

See also:

[LMDB Cluster](https://github.com/anywhichway/lmdb-cluster) - A clustered version of LMDB that supports a REST API with sockets planned.

[LMDB IndexedDB](https://github.com/anywhichway/lmdb-indexeddb) - An IndexedDB wrapper for LMDB that supports the full IndexedDB API.

# Installation

```javascript
npm install lmdb-query
```

# Usage

`lmdb-query` exports:

1) a function called `getRangeWhere`, 
2) a constant `ANY` to support wild card queries,
3) a constant `NOTNULL` to support non-null queries,
4) a constant `NULL` to support null queries,
5) a constant `DONE` to support stopping result enumeration,
6) a function `limit` to support stopping result enumeration,
7) a convenience function `bumpValue` to assist with incrementing keys
8) a convenience function `withExtensions` that is used to extend an LMDB database to support `getRangeWhere`

`getRangeWhere` should be assigned to an open database instance or called with the database instance as its context. Te best approach is:

```javascript
import {open} from "lmdb";
import {getRangeWhere,withExtensions} from "lmdb-query";
const db = withExtensions(open("test"),{getRangeWhere});
```

This adds `getRangeWhere` to the database and any child databases it opens.

You could also assign `getRangeWhere` directly to a database yourself or call it with a database as its context.

# API

## * getRangeWhere(keyMatch: array|function|object, ?valueMatch: function|object,?select: function|object,?options: object) - yields `{key, value}` pairs.

Warning, the explanation below are a bit dense! See the [examples](#examples) for a better understanding.

If `keyMatch` is an array, it is used to find all keys lexically starting at the array and ending one byte higher (not inclusive). The array items can be any literals that are valid as LMDB key components, plus functions and regular expressions (or strings that can be converted into regular expressions, i.e. matches the form `\/.*\/[dgimsuy]*` and can be compiled into a Regular Expression without error. The functions and regular expressions are used to test the nature of the key component at the same position as the function or regular expression. The functions should return truthy values for a match and falsy values for no match. Except, if a function returns DONE, enumeration will stop.

If `keyMatch` is a function, a scan of all entries in the database will occur, but only those entries with keys that that result in a truthy value from `keyMatch` when passed as an argument will be yielded. Except, if the function returns `DONE`, enumeration will stop.

If `keyMatch` is an object, it must satisfy the range specification conditions of LMDB, i.e. it should have a `start` and/or `end`. If it has neither a `start` or `end`, a scan of all entries in the database will occur.

`valueMatch` is optional and is used to filter out entries based on values. If it is a function, the function should return a truthy result for the value of the entry to be yielded or DONE. If it is an object, then the value property in the entry is expected to contain an object and for each entry, (`[property,test]`), in the `valueMatch` object the same property in the database entry value should be equal to `test` or if `test` is a function, calling it as `test(value[property],property,value)` should be truthy for the entry to be yielded. Note, `property` can also be a serialized regular expression. Finally, you can also use the utility function `limit` to stop enumeration when a certain number of entries have been yielded or provide `limit` as an option to `getRangeWhere`.

`select` is optional and used to reduce (or rarely increase) the size of yielded values by deleting. modifying, or adding properties. By default, entire values are returned. If `select` is a function if gets the value right before yield and can modify it in any manner chosen. If `select` is an object it behaves similar to `valueMatch` except that if the property value is a function it is called as `select[property](object[property],{key,object,root,as})` and the result is used as the value of the property in the yielded value. If the function returns `undefined`, the property is deleted from the yielded value. Otherwise, if the property value does not equal the value of the property in the yielding value, the property is deleted. The options argument provided to selection functions defined on the select object get the current `key`, the `object` being tested, the `root` object (i.e. the value being yielded), a key alias `as` if a regular expression with a selection group was used to match the `key`. Here is an example selection object:

```javascript
    {
        age:30, // select age
        address:{
            // selects upper case city into root object and drops from address, return value would keep it in address also
            city(value,{root}) { root.city = value.toUpperCase(); }
            // selects stateProvince as state with auotmatic alias because of RegExp group match
            [/.*(state).*/g]:(value) => value,
            // could also do this to elevate as alias,  [/.*(state).*/g]:(value,{root,as}) => { root[as] = value}, 
            country:ANY
        }
    }
```

## withExtensions(db:lmdbDatabase,extenstions:object) - returns lmdbDatabase`

Extends an LMDB database and any child databases it opens to have the `extensions` provided as well as any child databases it opens. This utility is common to other `lmdb` extensions like `lmdb-patch`, `lmdb-copy`, `lmdb-move`.

## Key Matching

When `getRangeWhere` is called with an array, it uses the array as the `start` after replacing functions and regular expressions and automatically computes an `end` by copying the start and bumping the last primitive value by one ordering point. With the exception of strings, this means by one byte. For strings it means adding one character at the lowest string byte, `\x0` ( `\x00` is reserved by LMDB as a special delimiter). For example, `hello` becomes `hello\x0`. In version v1.0.3 and earlier, strings also had one byte added. Too frequently, this resulted in range results that were unexpectedly large. If you still want this behavior, use the options flag `wideRangeKeyStrings` set to `true`. A better way to match a wide range for the string portion of a key is to use a regular expression. For example `/person.*/g` is the same as `LIKE person%` in SQL and will match any string starting with `person`.

For convenience `bumpValue` is exported from the main module.

In v1.0.3 and earlier, regular expressions could be passed as strings as key parts and an attempt was made to treat strings that looked like regular expressions as though they were regular expressions. This functionality has been removed for key parts. If regular expressions are represented as strings elsewhere, they must be converted to regular expressions before using them in keys.

If you wish to provide a broader range for an entire key, you can pass an`options` object to `getRangeWhere` with the property `bumpIndex` set to the index of the key component you wish to bump. If you wish to bump the first item, you can pass `bumpIndex: 0`. If you wish to bump the second component, you can pass `bumpIndex: 1` and so on. It is up to you to ensure the item at the index is not a filtering function, a regular expression, or a string that can be coerced into a regular expression. An `TypeError` will be thrown if you try to bump an illegal value.

When `keyMatch` is an object it has optional `start` and `end` properties. The `end` IS NOT inferred, so if you want to use an object to specify a range, with an `end`, you must specify the `end`. The ensures that `getRangeWhere` behaves identically to `getRange` with the exception of support for functional and regular expression matching.

If you provide a `start` key specification but no end key specification or you do provide an end key specification, and part of either the `start` or `end` is a filtering function, that function should return `DONE` if it can determine the key being processed is beyond the desired range; otherwise, a scan of all keys above start might occur. A warning will be logged to the console if a scan is possible unless `getRangeWhere.SILENT` is set to `true`.

Internally, `lmdb-query` replaces functions and regular expressions in key specifications with either `null` or `\x0` respectively. The core LMDB function `getRange` then returns potential matches that are filtered out unless they satisfy the functional or regular expression constraints.

# Examples

The best way to show examples is simply use our test cases, some but not all of which are below.

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY,DONE,limit,bumpValue} from "./index.js";

const db = open("test.db");
db.getRangeWhere = getRangeWhere;
db.clearSync()
db.putSync("hello","world");
db.putSync(["hello",false], {message:"my world"});
db.putSync(["hello",true], {message:"your world"});
db.putSync(["hello",1], {message:"other world"});

test("normal range",() => {
    // LMDB range queries are inclusive of the start key and exclusive of the end key.
    // Since Number.EPSILON is greater than `true` but less than `1`, it will not match "other world"
    const results = [...db.getRange({start:["hello"],end:["hello",Number.EPSILON]})];
    expect(results.length).toBe(3);
    expect(results[0].key).toBe("hello");
    expect(results[0].value).toBe("world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message.endsWith("world")).toBe(true);
    expect(results[2].key[0]).toBe("hello");
    expect(results[2].value.message.endsWith("world")).toBe(true);
})
test("getRangeWhere",() => {
    // LMDB does not distinguish between "hello" and ["hello"].
    // Since all keys start with "hello" and no end is specified, the results include all entries
    const results = [...db.getRangeWhere(["hello"])];
    expect(results.length).toBe(4);
    expect(results[0].key).toBe("hello");
    expect(results[0].value).toBe("world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message.endsWith("world")).toBe(true);
    expect(results[2].key[0]).toBe("hello");
    expect(results[2].value.message.endsWith("world")).toBe(true);
    expect(results[3].key[0]).toBe("hello");
    expect(results[3].value.message.endsWith("other world")).toBe(true);
})
test("getRangeWhere with start",() => {
    // This is identical to the previous test, but the start is specified using an object as in LMDB.
    const results = [...db.getRangeWhere({start:["hello"]})];
    expect(results.length).toBe(4);
    expect(results[0].key).toBe("hello");
    expect(results[0].value).toBe("world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message.endsWith("world")).toBe(true);
    expect(results[2].key[0]).toBe("hello");
    expect(results[2].value.message.endsWith("world")).toBe(true);
    expect(results[3].key[0]).toBe("hello");
    expect(results[3].value.message.endsWith("other world")).toBe(true);
})
test("getRangeWhere filter key",() => {
    // Returns all entries with a key that starts with "hello" followed by false.
    // Stops enumerating when it finds something else, e.g. `true` or 1.
    const results = [...db.getRangeWhere(["hello",(value) => value===false || DONE])];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter key start and end",() => {
    // Returns all entries with a key that starts with "hello" followed by false or true.
    // Stops enumerating after second key part is not true or false.
    const results = [...db.getRangeWhere({start:["hello",(value) => value===false],end:["hello",(value) => value===true ? true : DONE ]})];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter key start and literal end",() => {
    // Effectively the same as the previous test, but the end key is specified as a literal.
    // The smallest number, Number.EPSILON, is just above `true` from a sort perspective.
    const results = [...db.getRangeWhere({start:["hello",(value) => value===false],end:["hello",Number.EPSILON]})];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter object with function",() => {
    // Returns all entries with a key that starts with "hello" and a value with the message "my world".
    const results = [...db.getRangeWhere(["hello"],(value) => value.message==="my world")];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter object with function and DONE",() => {
    // Slighty more efficient than the previous test.
    // It stops enumerating after when the message is greater than "my world".
    const results = [...db.getRangeWhere(["hello"],(value) => value.message==="my world" ? true : value.message>"my world" ? DONE : false)];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter object with function and limit",() => {
    // Stops enumerating after N matches.
    const results = [...db.getRangeWhere(["hello"],limit((value) => value.message?.endsWith("world"),2))];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter object",() => {
    // Only yields objects with the message "my world".
    // Note, this will test ALL entries with a key starting with "hello".
    const results = [...db.getRangeWhere(["hello"],{message:"my world"})];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter object with property test and limit",() => {
    // Only yields objects with the message "my world".
    // This will yiled only the first 2 entries because `limit` is set to 2.
    const results = [...db.getRangeWhere(["hello"],{message:(value) => value.endsWith("world")},{limit:2})];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter object with property as regular expression",() => {
    // Only yields objects with the message "my world".
    // Note, this will test ALL entries with a key starting with "hello"
    // and check that properties on entry values match the regular expression
    // before checking the value of the property itself.
    const results = [...db.getRangeWhere(["hello"],{[/mess.*/]:(value) => value.endsWith("world")})];
    expect(results.length).toBe(3);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
    expect(results[2].key[0]).toBe("hello");
    expect(results[2].value.message).toBe("other world");
})
test("getRangeWhere select portion of object",() => {
    db.putSync("person",{name:"John",age:30,address:{city:"London",country:"UK"}});
    let results = [...db.getRangeWhere(["person"],{name:"John"},{age:(value) => value})];
    expect(results.length).toBe(1);
    expect(results[0].key).toBe("person");
    expect(results[0].value.name).toBe(undefined);
    expect(results[0].value.age).toBe(30);
    db.removeSync("person");
})
```

# Testing

Testing is conducted using Jest.

                                               
File      | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
----------|---------|----------|---------|---------|-------------------
All files |   94.94 |    84.13 |   96.15 |   96.91 |
index.js |   94.94 |    84.13 |   96.15 |   96.91 | 30,46,70,165,204


# Change History (Reverse Chronological Order)

2023-04-21 v1.1.3 Automatically created range ends were at times too restrictive, relaxed them a little. Code walkthrough also found a bug with RegExp matching which was fixed.

2023-04-19 v1.1.2 Simplified database augmentation by adding `withExtensions` from `lmdb-extend`.

2023-04-17 v1.1.1 Enhanced documentation. Adjusted unit tests.

2023-04-17 v1.1.0 WARNING: Breaking change to key matching for strings. Read (key matching)(#key-matching). Optimized regular expression matching.

2023-04-15 v1.0.3 Enhanced documentation.

2023-04-14 v1.0.2 Enhanced documentation.

2023-04-13 v1.0.1 NPM dropped README.md, although GitHUb did not. Trying a republish.

2023-04-13 v1.0.0 Improved documentation. Improved test coverage to over 95%.

2023-04-12 v0.2.0 BREAKING CHANGE! A third argument `select` was added to support extraction of just the components of an object that are desired.

2023-04-12 v0.1.2 Added `limit` as an alias for `count` since it is used in `lmdb`. The `count` options are still supported for backwards compatibility, but will be deprecated in a future version.

2023-04-07 v0.1.1 Documentation updates.

2023-04-07 v0.1.0 Added more test cases. Added `count` options and `DONE` constant. Added regular expression testing for object properties. Functionally complete for first version.

2023-04-06 v0.0.2 Added unit tests. Exposed `bumpValue`. Adjusted auto end to only bump the last primitive value. Added `bumpIndex` option to `getRangeWhere`.

2023-04-05 v0.0.1 Initial public release 
