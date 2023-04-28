const bumpChar = (ch) => {
    const code = ch.charCodeAt();
    if (code === 65535) return null;
    return String.fromCharCode(code + 1);
};

const bumper = (value,i,wideRangeKeyStrings) => {
    const type = typeof value;
    if(type==="function" || isRegExp(value)) {
        throw new TypeError(`[${value}] ${i!==undefined ? 'at index + i' : ''} is a function or RegExp, cannot bump value`)
    }
    if(value===null) {
        return false;
    }
    if (type === "boolean") {
        if (value === false) return true;
        else return Number.MIN_SAFE_INTEGER;
    }
    if (type === "number") {
        return value + Number.EPSILON;
    }
    if (type === "string") {
        if(wideRangeKeyStrings) {
            for (let i = value.length; i; i--) {
                const char = bumpChar(value[i - 1]);
                if (char) {
                    return value.substring(0, i - 1) + char;
                }
            }
            return null;
        }
        return value + String.fromCharCode(1);
    }
};
const isRegExp = (value) => {
    const type = typeof(value);
    if(type==="string") {
        if(value[0] === "/" && value.match(/\/.*\/[dgimsuy]+$/)) {
            const i = value.lastIndexOf("/");
            if (i > 1) {
                try {
                    // if a RegExp, then throw away
                    new RegExp(value.substring(1, i), value.substring(i + 1));
                    return true;
                } catch (e) {
                    return false;
                }
            }
        }
        return false;
    } else if(value && type==="object" && value instanceof RegExp) {
        return true;
    }
    return false;
}

const toRangeKey = (key,start,end) => {
    if(key===undefined) return;
    const rangeKey = [];
    let i = 0;
    for (let value of key) {
        if (start && (start[i] == null || isRegExp(start[i]))) break;
        const type = typeof value;
        if (value === null) {
            rangeKey.push(null)
        } else if(isRegExp(value)) {
            if(end) rangeKey.push(String.fromCharCode(65535))
            else rangeKey.push(String.fromCharCode(1))
        } else if (type === "string") {
            rangeKey.push(value);
        }  else if(type==="function") {
            if(end) rangeKey.push(String.fromCharCode(65535))
            else rangeKey.push(null)
        } else if(!["boolean", "number"].includes(type)) {
            if(end) rangeKey.push(String.fromCharCode(65535))
            else rangeKey.push(null)
        } else {
            rangeKey.push(value);
        }
        i++;
    }
    return rangeKey.length>0 ? rangeKey : undefined;
}

const ANY = (value) => value!==undefined ? value : undefined;
const NULL = (value) => value===null ? true : false;
const NOTNULL = (value) => value!==null ? value : undefined;
const DONE = Object.freeze({});

const limit = (f,number=1) => {
    return (value) => {
        const done = f(value);
        if(done) {
            number--;
            if(number<0) return DONE;
        }
        return done;
    }
}

const selector = (select,value,{key,object,root,as=key}={}) => {
    const type = typeof(select);
    if(type==="function") {
        return select(value,{key,object,root,as});
    }
    if(select && type==="object") {
        return Object.entries(select).reduce((result,[key,select]) => {
            if(isRegExp(key)) {
                const li = key.lastIndexOf("/");
                if (li > 1) {
                    let regexp;
                    try {
                        regexp = new RegExp(
                            key.substring(1, li),
                            key.substring(li + 1)
                        );
                    } catch (e) {};
                    if(regexp) {
                        return Object.entries(value).reduce((result,[key,v]) => {
                            const match = regexp.exec(key);
                            if(match) {
                                const as = match[1] || match[0],
                                    selection = selector(v,value[key],{key,object:value,root:root||=result,as});
                                if(selection!==undefined) result[as] = selection;
                            }
                            return result;
                        }, result);
                    }
                }
            }
            if(value[key]!==undefined) {
                const selection = selector(select,value[key],{key,object:value,root:root||=result,as});
                if(selection!==undefined) result[key] = selection;
            }
            return result;
        },Array.isArray(select) ? [] : {});
    }
    if(value===select) return value;
}

const matchPattern = (value,pattern) => {
    if(value===pattern) return true;
    if(!value || typeof(value)!=="object") return false;
    return Object.entries(pattern).every(([key,test]) => {
        if(isRegExp(key)) {
            const li = key.lastIndexOf("/");
            if (li > 1) {
                let regexp;
                try {
                    regexp = new RegExp(
                        key.substring(1, li),
                        key.substring(li + 1)
                    );
                } catch (e) {};
                if(regexp) {
                    return Object.keys(value).every((key) => {
                        if(regexp.test(key)) {
                            const type = typeof(test);
                            if(type==="function") return test(value[key],key,value)!==undefined;
                            if(test && type==="object") return matchPattern(value[key],test);
                            return value[key]===test
                        }
                        return true;
                    })
                }
            }
        }
        const type = typeof(test);
        if(type==="function") return test(value[key],key,value)!==undefined;
        if(test && type==="object") return matchPattern(value[key],test);
        return value[key]===test
    })
}

function* getRangeWhere(keyMatch, valueMatch=(value)=>value,select=(value)=>value,{wideRangeKeyStrings,versions,offset,bumpIndex,bump=bumper,limit=Infinity}={}) {
    if(bumpIndex!==undefined && typeof(bumpIndex)!=="number") throw new TypeError(`bumpIndex must be a number for getRangeWhere, got ${typeof(bumpIndex)} : ${bumpIndex}`);
    if(limit && typeof(limit)!=="number") throw new TypeError(`limit must be a number for getRangeWhere, got ${typeof(limit)} : ${limit}`);
    valueMatch ||= (value) => value;
    select ||= (value) => value;
    if(typeof(valueMatch)==="object") {
        const pattern = valueMatch;
        valueMatch = (value) => matchPattern(value,pattern)!==false ? value : undefined;
    }
    let start, end, optionEnd;
    const keyMatchType = typeof(keyMatch);
    if (Array.isArray(keyMatch)) {
        start = [...keyMatch];
        optionEnd = toRangeKey(keyMatch,keyMatch,true);
        if(optionEnd) {
            if(bumpIndex===undefined) bumpIndex = optionEnd.findLastIndex((value) => { const type = typeof(value); return type!=="function" && !isRegExp(value) });
            else if(bumpIndex>=optionEnd.length) throw new RangeError(`bumpIndex ${bumpIndex} is >= the length,  ${optionEnd.length}`);
            optionEnd = optionEnd.map((value,i) => i===bumpIndex ? bump(value,i,wideRangeKeyStrings) : value);
        } else if(bumpIndex!==undefined) {
            throw new RangeError(`bumpIndex ${bumpIndex} is greater than the length, 0, of the keyMatch array after functions and RegExp are removed`);
        }
    } else if(keyMatchType==="object" && keyMatch) {
        start = keyMatch.start;
        end = keyMatch.end;
        optionEnd = toRangeKey(keyMatch.end,keyMatch.end||keyMatch.start,true);
        if(!getRangeWhere.SILENT && keyMatch.start===undefined && keyMatch.end===undefined) {
            console.warn("keyMatch object has neither `start` or `end`, scanning all database values")
        }
    } else if(keyMatchType!=="function") {
        throw new TypeError(`keyMatch for getRangeWhere must be an Array, an object, or function not ${keyMatchType}`)
    }
    const options = {
        start:toRangeKey(start),
        end:optionEnd
    };
    if(versions) options.versions = true;
    //options.end = toRangeKey(end, keyMatch.end ? undefined : options.start);
    if(!options.start) delete options.start;
    if(!options.end) delete options.end;
    const conditions = [];
    if(start) conditions.push(start);
    if(end) conditions.push(end);
    if(!getRangeWhere.SILENT) {
        const checkKey = keyMatch && typeof(keyMatch)==="object" ? (Array.isArray(keyMatch) ? keyMatch : Object.values(keyMatch)) : null;
        if(checkKey) {
            if (checkKey.some((value) => typeof (value) === "function")) {
                if (!checkKey.some((value) => typeof (value) === "function" && (value + "").includes("DONE"))) {
                    console.warn("getRangeWhere does not include a function that returns DONE, this may cause a long scan of the database")
                }
            }
        }
    }

    let done;
    for (let { key, value, version } of this.getRange(options)) {
        let wasPrimitive;
        if(!Array.isArray(key)) {
            wasPrimitive = true;
            key = [key];
        }
        if ((keyMatchType!=="function" || keyMatch(key)!==undefined) &&
            (done = valueMatch(value))!==undefined &&
            (done===DONE || conditions.some((condition) => {
                return condition.every((part, i) => {
                    const type = typeof part;
                    if (type === "function") return ![DONE,undefined].includes(done = part(key[i]));
                    if (part && type === "object") {
                        if (part instanceof RegExp) {
                            return typeof(key[i])==="string" && !!key[i].match(part);
                        }
                    }
                    return true;
                })
            }))
        ) {
            if(done===DONE) return;
            value = selector(select,value);
            if(value===undefined) continue;
            if(offset && offset-->0) continue;
            if(wasPrimitive) {
                key = key[0];
            }
            const result = {key, value};
            if(version!==undefined) result.version =  version;
            yield result;
            if(--limit===0) return;
        }
    }
}

import {withExtensions as lmdbExtend} from "lmdb-extend";

const withExtensions = (db,extensions={}) => {
    return lmdbExtend(db,{getRangeWhere,...extensions})
}

export {getRangeWhere, ANY, NULL, NOTNULL, DONE, bumper as bumpValue, limit, matchPattern,selector,withExtensions}