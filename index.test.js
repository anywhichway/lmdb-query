import {open} from "lmdb";
import {withExtensions,ANY,NULL,NOTNULL,DONE,limit,bumpValue} from "./index.js";

const db = withExtensions(open("test.db",{useVersions:true})),
    child = db.openDB("child");
db.clearSync()
db.putSync("hello","world",1);
db.putSync(["hello",false], {message:"my world"},1);
db.putSync(["hello",true], {message:"your world"},1);
db.putSync(["hello",1], {message:"other world"},1);

test("extended",() => {
    expect(typeof(db.getRangeWhere)).toEqual("function");
    expect(typeof(child.getRangeWhere)).toEqual("function");
})
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
    const results = [...db.getRangeWhere({start:["hello",(value) => value===false||undefined],end:["hello",(value) => value===true ? true : DONE ]})];
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
test("getRangeWhere filter nested object",() => {
    db.putSync("nested",{address:{city:"New York",zip:{code:"10001",plus4:"1234"}}});
    const results = [...db.getRangeWhere(["nested"],{address: {zip:{code:"10001"}}})];
    expect(results.length).toBe(1);
    expect(results[0].key).toBe("nested");
    expect(results[0].value).toEqual({address:{city:"New York",zip:{code:"10001",plus4:"1234"}}});
})
test("getRangeWhere filter object with property value test and limit",() => {
    // only yields objects with the message "my world"
    // note this will test only 2 entries with a key starting with "hello"
    const results = [...db.getRangeWhere(["hello"],{message:(value) => value.endsWith("world")},null,{limit:2})];
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
    const results = [...db.getRangeWhere(["hello"],{[/mess.*/g]:(value) => value.endsWith("world")})];
    expect(results.length).toBe(3);
    expect(results[0].key[0]).toBe("hello");
    expect(results[0].value.message).toBe("my world");
    expect(results[1].key[0]).toBe("hello");
    expect(results[1].value.message).toBe("your world");
    expect(results[2].key[0]).toBe("hello");
    expect(results[2].value.message).toBe("other world");
})
test("getRangeWhere select portion of object",() => {
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
})
test("getRangeWhere string not RegExp",() => {
    const results = [...db.getRangeWhere(["/hello/there/"],{},null)];
    expect(results.length).toBe(0);
});
test("getRangeWhere bump null",() => {
    const results = [...db.getRangeWhere([null],{},null)];
    expect(results.length).toBeGreaterThan(0)
});
test("getRangeWhere bump false boolean",() => {
    const results = [...db.getRangeWhere([false],{},null)];
    expect(results.length).toBe(0);
});
test("getRangeWhere bump true boolean",() => {
    const results = [...db.getRangeWhere([true],{},null)];
    expect(results.length).toBe(0);
});
test("getRangeWhere bump number",() => {
    const results = [...db.getRangeWhere([0],{},null)];
    expect(results.length).toBe(0);
});
test("getRangeWhere keyMatch causes scan",() => {
    const results = [...db.getRangeWhere({start:[() =>{}]},null,null)];
    expect(results.length).toBe(0);
});
test("getRangeWhere keyMatch causes scan, no start or end",() => {
    const results = [...db.getRangeWhere({},null,null)];
    expect(results.length).toBe(0);
});
test("getRangeWhere RegExp key match",() => {
    const results = [...db.getRangeWhere([/hello/g])];
    expect(results.length).toBe(4);
});
describe("errors",() => {
    test("getRangeWhere invalid bumpIndex",() => {
        expect(() => [...db.getRangeWhere(1,undefined,undefined,{bumpIndex:"a"})]).toThrow();
        expect(() => [...db.getRangeWhere(1,undefined,undefined,{count:"a"})]).toThrow();
        expect(() => [...db.getRangeWhere(1,undefined,undefined,{limit:"a"})]).toThrow();
        expect(() => [...db.getRangeWhere([()=>{}],undefined,undefined,{bumpIndex:1})]).toThrow();
        expect(() => [...db.getRangeWhere([/a/g],undefined,undefined,{bumpIndex:1})]).toThrow();
        expect(() => [...db.getRangeWhere(1)]).toThrow();
    })
})
describe("wide and narrow key strings",() => {
    db.putSync("book","joe");
    db.putSync("book1","joe");
    db.putSync("book2","joe");
    test("getRangeWhere wide",() => {
        const results = [...db.getRangeWhere(["book"],undefined,undefined,{wideRangeKeyStrings:true,versions:true})];
        expect(results.length).toBe(3);
    })
    test("getRangeWhere narrow",() => {
        const results = [...db.getRangeWhere(["book"],undefined,undefined,{ersions:true})];
        expect(results.length).toBe(1);
    })
    test("getRangeWhere like",() => {
        const results = [...db.getRangeWhere([/book.*/g],undefined,undefined,{ersions:true})];
        expect(results.length).toBe(3);
    })
})
