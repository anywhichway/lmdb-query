const bumpChar = (ch) => {
    const code = ch.charCodeAt();
    if (code === 65535) return null;
    return String.fromCharCode(code + 1);
};

const bump = (value,i) => {
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
        for (let i = value.length; i; i--) {
            const char = bumpChar(value[i - 1]);
            if (char) {
                return value.substring(0, i - 1) + char;
            }
        }
        return null;
    }
};

const isRegExp = (value) => {
    const type = typeof(value);
    if(type==="string") {
        if(value[0] === "/") {
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
    } else if(value && type==="object" && value instanceof RegExp) {
        return true;
    }
    return false;
}

const toRangeKey = (key = [],start) => {
    if(key===undefined) return;
    const rangeKey = [];
    let i = 0;
    for (let value of key) {
        if(start && start[i]===null) break;
        const type = typeof value;
        if(value===null) {
            rangeKey.push(null)
        } else if (type === "string") {
            if(value[0] === "/") {
                const i = value.lastIndexOf("/");
                if (i > 1) {
                    try {
                        // if a RegExp, then throw away
                        new RegExp(value.substring(1, i), value.substring(i + 1));
                        value = null;
                    } catch (e) {}
                }
            }
            rangeKey.push(value)
        } else if(!["boolean", "number"].includes(type)) {
            rangeKey.push(null)
        } else {
            rangeKey.push(value);
        }
        i++;
    }
    return rangeKey.length>0 ? rangeKey : undefined;
}

const ANY = () => true;

const DONE = -1;

const count = (f,number=1) => {
   return (value) => {
        const done = f(value);
        if(done) {
            number--;
            if(number<0) return DONE;
        }
        return done;
    }
}

function* getRangeWhere(keyMatch, valueMatch,{bumpIndex,count=Infinity}={}) {
    if(valueMatch && typeof(valueMatch)==="object") {
        const entries = Object.entries(valueMatch);
        valueMatch = (value) => {
            if(!value || typeof(value)!=="object") {
                return false;
            }
            return entries.every(([key,test]) => {
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
                                    return typeof(test)==="function" ? test(value[key],key,value) : value[key]===test
                                }
                                return true;
                            })
                        }
                    }
                }
                return typeof(test)==="function" ? test(value[key],key,value) : value[key]===test
            })
        }
    }
    let start, end;
    const keyMatchType = typeof(keyMatch);
    if (Array.isArray(keyMatch)) {
        if(bumpIndex===undefined) bumpIndex = keyMatch.findLastIndex((value) => { const type = typeof(value); return type!=="function" && !isRegExp(value) });
        start = [...keyMatch];
        end = start.map((value,i) => i===bumpIndex ? bump(value,i) : value);
    } else if(keyMatchType==="object" && keyMatch) {
        start = keyMatch.start;
        end = keyMatch.end;
        if(!getRangeWhere.SILENT && keyMatch.start===undefined && keyMatch.end===undefined) {
            console.warn("keyMatch object has neither `start` or `end`, scanning all database values")
        }
    } else if(keyMatchType!=="function") {
        throw new TypeError(`keyMatch for getRangeWhere must be an Array, an object, or function not ${keyMatchType}`)
    }
    const options = {
        start:toRangeKey(start)
    }
    options.end = toRangeKey(end, keyMatch.end ? undefined : options.start);
    if(!options.start) delete options.start;
    if(!options.end || options.end.includes(null)) delete options.end;
    const conditions = [];
    if(start) conditions.push(start);
    if(end) conditions.push(end);
    if(!getRangeWhere.SILENT) {
        const checkKey = keyMatch?.end || keyMatch?.start || keyMatch
        if(checkKey) {
            if (checkKey.some((value) => typeof (value) === "function")) {
                if (!checkKey.some((value) => typeof (value) === "function" && (value + "").includes("DONE"))) {
                    console.warn("getRangeWhere does not include a function that returns DONE, this may cause a long scan of the database")
                }
            }
        }
    }

    let done;
    for (let { key, value } of this.getRange(options)) {
        if ((keyMatchType!=="function" || keyMatch(key)) &&
            (!valueMatch || (done = valueMatch(value))) &&
            (done===DONE || conditions.some((condition) => {
               return condition.every((part, i) => {
                    const type = typeof part;
                    if (type === "function") return done = part(key[i]);
                    if (type === "string" && part[0] === "/") {
                        const li = part.lastIndexOf("/");
                        if (li > 1) {
                            try {
                                return new RegExp(
                                    part.substring(1, li),
                                    part.substring(li + 1)
                                ).test(key[i]);
                            } catch (e) {}
                        }
                    }
                    if (part && type === "object") {
                        if (
                            part instanceof RegExp &&
                            typeof key[i] === "string"
                        ) {
                            return part.test(key[i]);
                        }
                        // todo deepEqual?
                    }
                    key[i] === part;
                    return true;
                })
            }))
        ) {
            if(done===DONE) return;
            yield { key, value };
            if(--count===0) return;
        }
    }
}

export {getRangeWhere, ANY, DONE, bump as bumpValue, count}