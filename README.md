# lmdb-query
A higher level query mechanism for LMDB supporting functional, declarative and RegExp filters without the overhead of 
an entire database wrapper.

This is BETA software. The library is functionally complete for a v1 release. Edge case and error generating unit tests have not been written. 
Stress testing and cross-platform testing has not been done.

# Installation

```javascript
npm install lmdb-query
```

# Usage

`lmdb-query` exports five things:

1) a function called `getRangeWhere`, 
2) a constant `ANY` to support wild card queries,
3) a constant DONE to support stopping entry enumeration,
4) a function `count` to support stopping entry enumeration,
5) a convenience function `bumpValue` to assist with incrementing keys

`getRangeWhere` should be assigned to an open database instance or called with the database instance as its context, i.e. do one of the following:

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY,DONE,count,bumpValue} from "../index.js";
const db = open("test");
db.getRangeWhere = getRangeWhere;
```
 or

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY,DONE,count,bumpValue} from "../index.js";
const db = open("test");
const query = getRangeWhere.bind(db);
```

or

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY,DONE,count,bumpValue} from "../index.js";
const db = open("test");
getRangeWhere.call(db,keyMatch,valueMatch);
```

# API

`function* getRangeWhere(keyMatch: array|function|object, ?valueMatch: function|object)` - yields `{key, value}` pairs.

Warning, the explanation below are a bit dense! See the [examples](#examples) for a better understanding.

If `keyMatch` is an array, it is used to find all keys that match the array. The array items can be any literals that are valid as LMDB key components, plus functions and regular expressions (or strings that can be converted into regular expressions, i.e. matches the form `\/.*\/[dgimsuy]*` and can be compiled into a Regular Expression without error. The functions and regular expressions are used to test the nature of the key component at the same position as the function or regular expression. The functions should return truthy values for a match and falsy values for no match. Except, if a function returns DONE, enumeration will stop.

If `keyMatch` is a function, a scan of all entries in the database will occur, but only those entries with keys that that result in a truthy value from `keyMatch` when passed as an argument will be yielded. Except, if the function returns `DONE`, enumeration will stop.

If `keyMatch` is an object, it must satisfy the range specification conditions of LMDB, i.e. it should have a `start` and/or `end`. If it has neither a `start` or `end`, a scan of all entries in the database will occur.

`valueMatch` is optional and is used to filter out entries based on values. If it is a function, the function should return a truthy result for the value of the entry to be yielded or DONE. If it is an object, then the value property in the entry is expected to contain an object and for each entry, (`[property,test]`), in the `valueMatch` object the same property in the database entry value should be equal to `test` or if `test` is a function, calling it as `test(value[property],property,value)` should be truthy for the entry to be yielded. Note, `property` can also be a serialized regular expression. Finally, you can also use the utility function `count` to stop enumeration when a certain number of entries have been yielded or provide `count` as an option to `getRangeWhere`.

When `getRangeWhere` is called with an array it automatically computes an end by copying the start and bumping the last primitive value by one byte. This is not done when `keyMatch` is an object, so if you want to use an object to specify a range, with an end, you must specify the end. The ensures that `getRangeWhere` behaves identically to `getRange` with the exception of support for functional and regular expression matching. For convenience `bumpValue` is exported from the main module. If you provide a start key specification but no end key specification or you do provide an end key specification, and part of either the start or end is a filtering function, that function should return `DONE` if it can determine the key being processed is beyond the desired range; otherwise, a scan of all keys above the first might occur. A warning will be logged to the console if a scan is possible unless `getRangeWhere.SILENT` is set to `true`.

If you wish to provide a broader range, you can pass an options object to `getRangeWhere` with the property `bumpIndex` set to the index of the key component you wish to bump. If you wish to bump the first item, you can pass `bumpIndex: 0`. If you wish to bump the second component, you can pass `bumpIndex: 1` and so on. It is up to you to ensure the item at the index is not a filtering function, a regular expression, or a string that can be coerced into a regular expression. An `TypeError` will be thrown if you try to bump an illegal value.

# Examples

The best way to show examples is simply use our test cases:

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY,DONE,count,bumpValue} from "./index.js";

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
test("getRangeWhere filter object with function and count",() => {
    // Stops enumerating after N matches.
    const results = [...db.getRangeWhere(["hello"],count((value) => value.message?.endsWith("world"),2))];
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
test("getRangeWhere filter object with property test and count",() => {
    // Only yields objects with the message "my world".
    // This will yiled only the first 2 entries because `count` is set to 2.
    const results = [...db.getRangeWhere(["hello"],{message:(value) => value.endsWith("world")},{count:2})];
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
```

# Change History (Reverse Chronological Order)

2023-04-12 v0.1.2 Added `limit` as an alias for `count` since it is used in `lmdb`. The `count` options are still supported for backwards compatibility, but will be deprecated in a future version.

2023-04-07 v0.1.1 Documentation updates.

2023-04-07 v0.1.0 Added more test cases. Added `count` options and `DONE` constant. Added regular expression testing for object properties. Functionally complete for first version.

2023-04-06 v0.0.2 Added unit tests. Exposed `bumpValue`. Adjusted auto end to only bump the last primitive value. Added `bumpIndex` option to `getRangeWhere`.

2023-04-05 v0.0.1 Initial public release 
