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
    // This is identical to the previous test, but the start key is specified.
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
    // Returns all entries with a key that starts with "hello" followed by false
    // Stops enumerating when it finds something else, e.g. `true` or 1.
    const results = [...db.getRangeWhere(["hello",(value) => value===false || DONE])];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter key start and end",() => {
    // Returns all entries with a key that starts with "hello" followed by false or true
    // Stops enumerating after second key part is not true or false
    const results = [...db.getRangeWhere({start:["hello",(value) => value===false],end:["hello",(value) => value===true ? true : DONE ]})];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter key start and literal end",() => {
    // Effectively the same as the previous test, but the end key is specified as a literal
    // The smallest number is just above `true` from a sort perspective
    const results = [...db.getRangeWhere({start:["hello",(value) => value===false],end:["hello",Number.EPSILON]})];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter object with function",() => {
    // Returns all entries with a key that starts with "hello" and a value with the message "my world"
    const results = [...db.getRangeWhere(["hello"],(value) => value.message==="my world")];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter object with function and DONE",() => {
    // Slighty more efficient than the previous test
    // It stops enumerating after when the message is greater than "my world"
    const results = [...db.getRangeWhere(["hello"],(value) => value.message==="my world" ? true : value.message>"my world" ? DONE : false)];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter object with function and limit",() => {
    // It stops enumerating after N matches
    const results = [...db.getRangeWhere(["hello"],limit((value) => value.message?.endsWith("world"),2))];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter object",() => {
    // only yields objects with the message "my world"
    // note this will test ALL entries with a key starting with "hello"
    const results = [...db.getRangeWhere(["hello"],{message:"my world"})];
    expect(results.length).toBe(1);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
})
test("getRangeWhere filter object with property value test and limit",() => {
    // only yields objects with the message "my world"
    // note this will test only 2 entries with a key starting with "hello"
    const results = [...db.getRangeWhere(["hello"],{message:(value) => value.endsWith("world")},{limit:2})];
    expect(results.length).toBe(2);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
})
test("getRangeWhere filter object with property as regular expression",() => {
    // only yields objects with the message "my world"
    // note this will test ALL entries with a key starting with "hello"
    // and check that properties on values match the regular expression
    const results = [...db.getRangeWhere(["hello"],{[/mess.*/]:(value) => value.endsWith("world")})];
    expect(results.length).toBe(3);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
    expect(results[2].key[0]).toBe("hello");
    expect(results[2].value.message).toBe("other world");
})
