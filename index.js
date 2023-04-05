const bumpChar = (ch) => {
    const code = ch.charCodeAt();
    if (code === 65535) return null;
    return String.fromCharCode(code + 1);
};

const bump = (value) => {
    const type = typeof value;
    if(value===null) {
        return false;
    }
    if (type === "boolean") {
        if (value === false) return true;
        else return Number.MIN_SAFE_INTEGER;
    }
    if (type === "number") {
        return value + 0.0000000000000001;
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

function* getRangeWhere(keyMatch, valueMatch) {
    if(valueMatch && typeof(valueMatch)==="object") {
        const entries = Object.entries(valueMatch);
        valueMatch = (value) => {
            if(!value || typeof(value)!=="object") {
                return false;
            }
            return entries.every(([key,test]) => {
                return typeof(test)==="function" ? test(value[key],key,value) : value[key]===test
            })
        }
    }
    let start, end;
    const keyMatchType = typeof(keyMatch);
    if (Array.isArray(keyMatch)) {
        start = [...keyMatch];
        end = start.map((value) => bump(value));
    } else if(keyMatchType==="object" && keyMatch) {
        start = where.start;
        end = where.end;
        if(where.start===undefined && where.end===undefined) {
            console.warn("keyMatch object has neither `start` or `end`, scanning all database values")
        }
    } else if(keyMatchType!=="function") {
        throw new TypeError(`keyMatch for getRangeWhere must be an Array, an object, or function not ${keyMatchType}`)
    }
    const options = {
        start:toRangeKey(start)
    }
    options.end = toRangeKey(end, options.start);
    if(!options.start) delete options.start;
    if(!options.end) delete options.end;
    for (let { key, value } of this.getRange(options)) {
        if ((keyMatchType!=="function" || keyMatch(key)) &&
            (!valueMatch || valueMatch(value)) &&
            start.every((part, i) => {
                const type = typeof part;
                if (type === "function") return part(key[i]);
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
        ) {
            yield { key, value };
        }
    }
}

export {getRangeWhere, ANY}