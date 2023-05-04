import {open} from "lmdb";
import {ANY, DONE, limit, NOTNULL, withExtensions} from "./index.js";

const benchmark = await import("./node_modules/benchmark/benchmark.js"),
    Benchmark = benchmark.default,
    suite = new Benchmark.Suite;

const db = withExtensions(open("test.db",{useVersions:true}));
db.clearSync();
db.putSync("hello","world",1);
db.putSync(["hello",false], {message:"my world"},1);
db.putSync(["hello",true], {message:"your world"},1);
db.putSync(["hello",1], {message:"other world"},1);
db.putSync("person1",{name:"John",age:30,address:{city:"Seattle","stateOrProvince":"WA",country:"US"}});
db.putSync("person2",{age:30,address:{city:"Seattle","stateOrProvince":"WA",country:"US"}});
db.putSync("nested",{address:{city:"New York",zip:{code:"10001",plus4:"1234"}}});

suite.add("normal range",() => {
    // LMDB range queries are inclusive of the start key and exclusive of the end key.
    // Since Number.EPSILON is greater than `true` but less than `1`, it will not match "other world"
    [...db.getRange({start:["hello"],end:["hello",Number.EPSILON]})];
})
suite.add("getRangeWhere",() => {
    // LMDB does not distinguish between "hello" and ["hello"].
    // Since all keys start with "hello" and no end is specified, the results include all entries
    [...db.getRangeWhere(["hello"])];
})
suite.add("getRangeWhere with start",() => {
    // This is identical to the previous test, but the start key is specified.
    [...db.getRangeWhere({start:["hello"]})];
})
suite.add("getRangeWhere filter key",() => {
    // Returns all entries with a key that starts with "hello" followed by false
    // Stops enumerating when it finds something else, e.g. `true` or 1.
    [...db.getRangeWhere(["hello",(value) => value===false || DONE])];
})
suite.add("getRangeWhere filter key start and end",() => {
    // Returns all entries with a key that starts with "hello" followed by false or true
    // Stops enumerating after second key part is not true or false
    [...db.getRangeWhere({start:["hello",(value) => value===false||undefined],end:["hello",(value) => value===true ? true : DONE ]})];
})
suite.add("getRangeWhere filter key start and literal end",() => {
    // Effectively the same as the previous test, but the end key is specified as a literal
    // The smallest number is just above `true` from a sort perspective
    [...db.getRangeWhere({start:["hello",(value) => value===false],end:["hello",Number.EPSILON]})];
})
suite.add("getRangeWhere filter object with function",() => {
    // Returns all entries with a key that starts with "hello" and a value with the message "my world"
    [...db.getRangeWhere(["hello"],(value) => value.message==="my world" ? value : undefined)];
})
suite.add("getRangeWhere filter object with function and DONE",() => {
    // Slighty more efficient than the previous test
    // It stops enumerating after when the message is greater than "my world"
   [...db.getRangeWhere(["hello"],(value) => value.message==="my world" ? true : value.message>"my world" ? DONE : undefined)];
})
suite.add("getRangeWhere filter object with function and limit",() => {
    // It stops enumerating after N matches
   [...db.getRangeWhere(["hello"],limit((value) => value.message?.endsWith("world"),2))];
})
suite.add("getRangeWhere filter object",() => {
    // only yields objects with the message "my world"
    // note this will test ALL entries with a key starting with "hello"
   [...db.getRangeWhere(["hello"],{message:"my world"})];
})
suite.add("getRangeWhere filter nested object",() => {
   [...db.getRangeWhere(["nested"],{address: {zip:{code:"10001"}}})];
})
suite.add("getRangeWhere filter object with property value test and limit",() => {
    // only yields objects with the message "my world"
    // note this will test only 2 entries with a key starting with "hello"
   [...db.getRangeWhere(["hello"],{message:(value) => value.endsWith("world") ? value : undefined},null,{limit:2})];
})
suite.add("getRangeWhere filter object with property as regular expression",() => {
    // only yields objects with the message "my world"
    // note this will test ALL entries with a key starting with "hello"
    // and check that properties on values match the regular expression
   [...db.getRangeWhere(["hello"],{[/mess.*/g]:(value) => value.endsWith("world") ? value : undefined})];
})
suite.add("getRangeWhere select portion of object",() => {
   [...db.getRangeWhere(
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
})
suite.add("getRangeWhere string not RegExp",() => {
   [...db.getRangeWhere(["/hello/there/"],{},null)];
})
suite.add("getRangeWhere bump null",() => {
   [...db.getRangeWhere([null],{},null)];
})
suite.add("getRangeWhere bump false boolean",() => {
   [...db.getRangeWhere([false],{},null)];
})
suite.add("getRangeWhere bump true boolean",() => {
   [...db.getRangeWhere([true],{},null)];
})
suite.add("getRangeWhere bump number",() => {
   [...db.getRangeWhere([0],{},null)];
})
suite.add("getRangeWhere keyMatch causes scan",() => {
   [...db.getRangeWhere({start:[() =>{}]},null,null)];
})
suite.add("getRangeWhere keyMatch causes scan, no start or end",() => {
   [...db.getRangeWhere({},null,null)];
})
suite.add("getRangeWhere RegExp key match",() => {
   [...db.getRangeWhere([/hello/g])];
})  
    .on('cycle', function(event) {
        console.log(String(event.target));
    })
    .on('complete', function() {
        console.log('Fastest is ' + this.filter('fastest').map('name'));
    })
    .run({ maxTime:5 });