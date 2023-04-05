# lmdb-query
A higher level query mechanism for LMDB supporting functional, declarative and RegExp filters without the overhead of an entire database wrapper.

This is ALPHA software. Unit tests have not been written.

# Installation

```javascript
npm install lmdb-query
```

# Usage

`lmdb-query` exports two things, a function called `getRangeWhere` and a constant `ANY` to support wild card queries.

`getRangeWhere` should be assigned to an open database instance or called with the database instance as its context, i.e. do one of the following:

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY} from "../index.js";
const db = open("test");
db.getRangeWhere = getRangeWhere;
```
 or

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY} from "../index.js";
const db = open("test");
const query = getRangeWhere.bind(db);
```

or

```javascript
import {open} from "lmdb";
import {getRangeWhere,ANY} from "../index.js";
const db = open("test");
getRangeWhere.call(db,keyMatch,valueMatch);
```

# API

`function* getRangeWhere(keyMatch: array|function|object, ?valueMatch: function|object)` - returns `{key, value}`

If `keyMatch` is an array, it is used to find all keys that match the array. The array entries can be any literals that are valid as LMDB key components, plus functions and Regular Expressions (or strings that can be converted into Regular Expressions). The functions and Regular Expressions are used to test the nature of the key component at the same position as the function or Regular Expression.

If `keyMatch` is a function, a scan of all values in the database will occur, but only those values with keys that that result in a truthy value from `keyMatch` when passed as an argument will be yielded.

If `keyMatch` is an object, it must satisfy the range specification conditions of LMDB, i.e. it should have a `start` and/or `end`. If it has neither a `start` or `end`, a scan of all values in the database will occur.

`valueMatch` is optional and is used to filter out values. If it is a function, the function should return a truthy result for the value to be yielded. If it is an object, then the value is expected to be an object and for each entry, (`[property,test]`), in the `valueMatch` the same property in the database value should be equal to `test` or if `test` is a function calling it as `test(value[property],property,value)` should be truthy for the value to be yielded.

# Change History (Reverse Chronological Order)

2023-04-05 v0.0.1 Initial public release 
