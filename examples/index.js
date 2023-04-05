import {open} from "lmdb";
import {getRangeWhere,ANY} from "../index.js";

const db = open("test");
db.getRangeWhere = getRangeWhere;
db.clearSync();
db.putSync("hello","world1");
db.putSync(["hello"],"world2");
db.putSync(["hello",true], {message:"world3"});
console.log(db.get("hello"));
console.log(db.get(["hello"]));
for(const entry of db.getRange({start:[null],end:["hello",true]})) {
    console.log(0,entry);
}
for(const entry of db.getRange({start:[null,true],end:["hello",true]})) {
    console.log(1,entry);
}
for(const entry of db.getRange({start:[null,true]})) {
    console.log(1,entry);
}
for(const entry of db.getRange({start:[null,true]})) {
    console.log(1,entry);
}
for(const entry of db.getRangeWhere([null,true])) {
    console.log(2,entry);
}
for(const entry of db.getRangeWhere([ANY,true])) {
    console.log(3,entry);
}
for(const entry of db.getRangeWhere([null,ANY])) {
    console.log(4,entry);
}
for(const entry of db.getRangeWhere([null,ANY],{message:(value) => value!=null})) {
    console.log(5,entry);
}
for(const entry of db.getRangeWhere(["hello"])) {
    console.log(6,entry);
}

