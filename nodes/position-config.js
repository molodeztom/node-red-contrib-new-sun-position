/********************************************
 * position-config:
 *********************************************/
'use strict';

const path = require('path');

const hlp = require(path.join(__dirname, '/lib/dateTimeHelper.js'));
const util = require('util');

const sunCalc = require(path.join(__dirname, '/lib/suncalc.js'));

/*******************************************************************************************************/
const moonPhases = [{
    emoji: '🌚',
    code: ':new_moon_with_face:',
    name: 'New Moon',
    weight: 1
},
{
    emoji: '🌒',
    code: ':waxing_crescent_moon:',
    name: 'Waxing Crescent',
    weight: 6.3825
},
{
    emoji: '🌓',
    code: ':first_quarter_moon:',
    name: 'First Quarter',
    weight: 1
},
{
    emoji: '🌔',
    code: ':waxing_gibbous_moon:',
    name: 'Waxing Gibbous',
    weight: 6.3825
},
{
    emoji: '🌝',
    code: ':full_moon_with_face:',
    name: 'Full Moon',
    weight: 1
},
{
    emoji: '🌖',
    code: ':waning_gibbous_moon:',
    name: 'Waning Gibbous',
    weight: 6.3825
},
{
    emoji: '🌗',
    code: ':last_quarter_moon:',
    name: 'Last Quarter',
    weight: 1
},
{
    emoji: '🌘',
    code: ':waning_crescent_moon:',
    name: 'Waning Crescent',
    weight: 6.3825
}];

Date.prototype.addDays = function (days) {
    const date = new Date(this.valueOf());
    date.setUTCDate(date.getUTCDate() + days);
    return date;
};

module.exports = function (RED) {
    'use strict';

    class positionConfigurationNode {
        /**
         *
         * @param config
         */
        constructor(config) {
            RED.nodes.createNode(this, config);
            try {
                this.debug('initialize');
                this.name = config.name;
                this.longitude = parseFloat(this.credentials.posLongitude || config.longitude);
                this.latitude = parseFloat(this.credentials.posLatitude || config.latitude);
                this.angleType = config.angleType;
                this.tzOffset = (config.timezoneOffset * -60) || 0;
                // this.debug('load position-config ' + this.name + ' long:' + this.longitude + ' latitude:' + this.latitude + ' angelt:' + this.angleType + ' TZ:' + this.tzOffset);
                this.lastSunCalc = {
                    ts: 0
                };
                this.lastMoonCalc = {
                    ts: 0
                };

                const today = new Date();
                const dayId = this._getUTCDayId(today);
                const tomorrow = today.addDays(1);
                this._sunTimesRefresh(today, tomorrow, dayId);
                this._moonTimesRefresh(today, tomorrow, dayId);
                hlp.initializeParser(RED._('common.days', { returnObjects: true}), RED._('common.month', { returnObjects: true}), RED._('common.dayDiffNames', { returnObjects: true}));
            } catch (err) {
                this.debug(util.inspect(err, Object.getOwnPropertyNames(err)));
                this.status({
                    fill: 'red',
                    shape: 'ring',
                    text: RED._('errors.error-title')
                });
                throw err;
            }
        }

        /**
         *
         * @param node
         */
        register(node) {
            this.users[node.id] = node;
        }

        /**
         *
         * @param node
         * @param done
         * @returns {*}
         */
        deregister(node, done) {
            delete node.users[node.id];
            return done();
        }
        /*******************************************************************************************************/
        getSunTime(now, value, offset, multiplier, next, days) {
            // this.debug('getSunTime value=' + value + ' offset=' + offset + ' multiplier=' + multiplier + ' next=' + next + ' days=' + days);
            let result = this._sunTimesCheck(now);
            result = Object.assign(result, this.sunTimesToday[value]);
            result.value = hlp.addOffset(new Date(result.value), offset, multiplier);
            if (next && !isNaN(next) && result.value.getTime() <= now.getTime()) {
                if (next === 1) {
                    result = Object.assign(result, this.sunTimesTomorow[value]);
                } else if (next > 1) {
                    this._checkCoordinates();
                    const date = (new Date()).addDays(next);
                    result = Object.assign(result, sunCalc.getTimes(date, this.latitude, this.longitude)[value]);
                }

                result.value = hlp.addOffset(new Date(result.value), offset, multiplier);
            }

            if (days && (days !== '*') && (days !== '')) {
                // this.debug('move days ' + days + ' result=' + util.inspect(result));
                const dayx = hlp.calcDayOffset(days, result.value.getDay());
                if (dayx > 0) {
                    this._checkCoordinates();
                    const date = result.value.addDays(dayx);
                    // let times = sunCalc.getTimes(date, this.latitude, this.longitude);
                    result = Object.assign(result, sunCalc.getTimes(date, this.latitude, this.longitude)[value]);
                    result.value = hlp.addOffset(new Date(result.value), offset, multiplier);
                } else if (dayx < 0) {
                    // this.debug('getSunTime - no valid day of week found value=' + value + ' - next=' + next + ' - days=' + days + ' result=' + util.inspect(result));
                    result.error = 'No valid day of week found!';
                }
            }

            // this.debug('getSunTime result=' + util.inspect(result));
            return result;
        }
        /*******************************************************************************************************/
        getMoonTime(now, value, offset, multiplier, next, days) {
            this.debug('getMoonTime value=' + value + ' offset=' + offset + ' next=' + next + ' days=' + days);
            const result = this._moonTimesCheck( now);
            this.debug('getMoonTime moonTimesToday=' + util.inspect(this.moonTimesToday));
            result.value = hlp.addOffset(new Date(this.moonTimesToday[value]), offset, multiplier);
            if (next && !isNaN(next) && result.value.getTime() <= now.getTime()) {
                if (next === 1) {
                    result.value = hlp.addOffset(new Date(this.moonTimesTomorow[value]), offset, multiplier);
                    this.debug('Moon Times tomorrow =' + util.inspect(this.moonTimesTomorow));
                } else if (next > 1) {
                    this._checkCoordinates();
                    const date = (new Date()).addDays(next);
                    const times = sunCalc.getMoonTimes(date, this.latitude, this.longitude, true);
                    result.value = hlp.addOffset(new Date(times[value]), offset, multiplier);
                    // this.debug('Moon Times for ' + date + ' =' + util.inspect(times));
                }
            }

            if (days && (days !== '*') && (days !== '')) {
                const dayx = hlp.calcDayOffset(days, result.value.getDay());
                if (dayx > 0) {
                    this._checkCoordinates();
                    const date = (new Date()).addDays(dayx);
                    const times = sunCalc.getMoonTimes(date, this.latitude, this.longitude, true);
                    result.value = hlp.addOffset(new Date(times[value]), offset, multiplier);
                } else if (dayx < 0) {
                    result.error = 'No valid day of week found!';
                    // this.debug('getMoonTime - no valid week day found value=' + value + ' - next=' + next + ' - days=' + days + ' result=' + result.value);
                }
            }
            if (isNaN(result.value)) {
                result.error = 'No valid time for moon ' + value + ' found!';
            }
            // this.debug('getMoonTime result' + util.inspect(result));
            return result;
        }
        /*******************************************************************************************************/
        getFloatProp(_srcNode, msg, type, value, def) {
            // _srcNode.debug('getFloatProp type='+type+' value='+value);
            let data; // 'msg', 'flow', 'global', 'num', 'bin', 'env', 'jsonata'
            if (type === 'num') {
                data = value;
            } else if (type === '' || (typeof type === 'undefined') || type === null) {
                if (isNaN(value)) {
                    return def || NaN;
                }
                data = value;
            } else if (type === 'none') {
                return def || NaN;
            } else if (type === 'msgPayload') {
                data = msg.payload;
            } else if (type === 'msgValue') {
                data = msg.value;
            } else {
                data = RED.util.evaluateNodeProperty(value, type, _srcNode, msg);
            }
            if (data === null || typeof data === 'undefined') {
                throw new Error(RED._('errors.notEvaluableProperty', {type:type, value:value}));
            }
            data = parseFloat(data);
            if (isNaN(data)) {
                throw new Error('the value of ' + type + '.' + value + ' is not a valid Number!');
            }
            return data;
        }
        /*******************************************************************************************************/
        getOutDataProp(_srcNode, msg, vType, value, format, offset, offsetType, multiplier, days) {
            // _srcNode.debug('getOutDataProp type='+vType+' value='+value+' format='+format+' offset='+offset+' offset='+offsetType+' multiplier='+multiplier);
            let result = null;
            if (vType === null || vType === 'none' || vType === '' || (typeof vType === 'undefined')) {
                if (value === '' || (typeof value === 'undefined')) {
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = hlp.addOffset((new Date()), offsetX, multiplier);
                    return hlp.getFormattedDateOut(result, format);
                }
                return value;
            } else if (vType === 'date') {
                return Date.now();
            } else if (vType === 'dateSpecific') {
                const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                result = hlp.addOffset((new Date()), offsetX, multiplier);
                return hlp.getFormattedDateOut(result, format);
            } else if (vType === 'msgPayload') {
                return msg.payload;
            } else if (vType === 'msgTs') {
                return msg.ts;
            } else if (vType === 'msgLc') {
                return msg.lc;
            } else if (vType === 'msgValue') {
                return msg.value;
            } else if (vType === 'pdsCalcData') {
                return this.getSunCalc(msg.ts);
            } else if (vType === 'pdmCalcData') {
                return this.getMoonCalc(msg.ts);
            } else if ((vType === 'pdsTime') || (vType === 'pdmTime')) {
                if (vType === 'pdsTime') { // sun
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = this.getSunTime((new Date()), value, offsetX, multiplier, undefined, days);
                } else if (vType === 'pdmTime') { // moon
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = this.getMoonTime((new Date()), value, offsetX, multiplier, undefined, days);
                }
                if (result && result.value && !result.error) {
                    return hlp.getFormattedDateOut(result.value, format);
                }
                return null;
            } else if (vType === 'entered' || vType === 'dateEntered') {
                result = hlp.getDateOfText(String(value));
                const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                result = hlp.normalizeDate(result, offsetX, multiplier, undefined, days);
                return hlp.getFormattedDateOut(result, format);
            } else if (vType === 'dayOfMonth') {
                result = new Date();
                result = hlp.getSpecialDayOfMonth(result.getFullYear(),result.getMonth(), value);
                if (result !== null && typeof result !== 'undefined') {
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = hlp.addOffset(result, offsetX, multiplier);
                    return hlp.getFormattedDateOut(result, format);
                }
                return null;
            }
            return RED.util.evaluateNodeProperty(value, vType, _srcNode, msg);
        }
        /*******************************************************************************************************/
        getDateFromProp(_srcNode, msg, vType, value, format, offset, offsetType, multiplier) {
            // _srcNode.debug('getDateFromProp type='+vType+' value='+value+' format='+format+' offset='+offset+ ' offsetType=' + offsetType +' multiplier='+multiplier);
            let result = null;
            try {
                if (vType === null || vType === 'none' || vType === '') {
                    return new Date();
                } else if (vType === 'date') {
                    return new Date();
                } else if (vType === 'dateSpecific') {
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    return hlp.addOffset((new Date()), offsetX, multiplier);
                } else if (vType === 'dayOfMonth') {
                    let d = new Date();
                    d = hlp.getSpecialDayOfMonth(d.getFullYear(),d.getMonth(), value);
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    return hlp.addOffset(d, offsetX, multiplier);
                } else if ((vType === 'pdsTime') || (vType === 'pdmTime')) {
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    if (vType === 'pdsTime') {
                        // sun
                        result = this.getSunTime((new Date()), value, offsetX, multiplier);
                        result.fix = true;
                    } else if (vType === 'pdmTime') {
                        // moon
                        result = this.getMoonTime((new Date()), value, offsetX, multiplier);
                        result.fix = true;
                    }
                    if (result && result.value && !result.error) {
                        return result.value;
                    }
                    throw new Error(RED._('errors.notEvaluablePropertyAdd', {type:vType, value:value, err:result.error}));
                } else if (vType === 'entered' || vType === 'dateEntered') {
                    result = hlp.getDateOfText(String(value));
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    return hlp.addOffset(result, offsetX, multiplier);
                } else if (vType === 'msgPayload') {
                    result = msg.payload;
                } else if (vType === 'msgTs') {
                    result = msg.ts;
                } else if (vType === 'msgLc') {
                    return msg.lc;
                } else if (vType === 'msgValue') {
                    result = msg.value;
                } else {
                    // msg, flow, global, str, num, env
                    result = RED.util.evaluateNodeProperty(value, vType, _srcNode, msg);
                }
                if (result !== null && typeof result !== 'undefined') {
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = hlp.parseDateFromFormat(result, format, RED._('position-config.days'), RED._('position-config.month'), RED._('position-config.dayDiffNames'));
                    return hlp.addOffset(result, offsetX, multiplier);
                }
            } catch (err) {
                this.debug(util.inspect(err, Object.getOwnPropertyNames(err)));
                const e = new Error(`Exception "${err.message}", on try to evaluate ${vType}.${value}`);
                e.original = err;
                e.stack = e.stack.split('\n').slice(0,2).join('\n')+'\n'+err.stack;
                throw e;
            }
        }
        /*******************************************************************************************************/
        getTimeProp(_srcNode, msg, vType, value, offset, offsetType, multiplier, next, days) {
            // this.debug('getTimeProp [' + hlp.getNodeId(_srcNode) + '] vType=' + vType + ' value=' + value + ' offset=' + offset + ' offsetType=' + offsetType + ' multiplier=' + multiplier + ' next=' + next + ' days=' + days);
            let result = {
                value: null,
                error: null,
                fix: true
            };
            try {
                if (days === '') {
                    result.error = 'No valid Days given!';
                } else if (vType === '' || vType === 'none') {
                    result.error = 'wrong type "' + vType + '"="' + value+'"';
                } else if (vType === 'date') {
                    result.value = new Date();
                    result.fix = true;
                } else if (vType === 'dateSpecific') {
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result.value = hlp.normalizeDate((new Date()), offsetX, multiplier, next, days);
                    result.fix = true;
                } else if (vType === 'entered') {
                    result.value = hlp.getTimeOfText(String(value), (new Date()));
                    if (result.value !== null) {
                        const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                        result.value = hlp.normalizeDate(result.value, offsetX, multiplier, next, days);
                    }
                    result.fix = true;
                } else if (vType === 'pdsTime') {
                    // sun
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = this.getSunTime((new Date()), value, offsetX, multiplier, next, days);
                    result.fix = true;
                } else if (vType === 'pdmTime') {
                    // moon
                    const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                    result = this.getMoonTime((new Date()), value, offsetX, multiplier, next, days);
                    result.fix = true;
                } else {
                    // can handle context, json, jsonata, env, ...
                    result.fix = (vType === 'json'); // is not a fixed time if can be changed
                    const res = RED.util.evaluateNodeProperty(value, vType, _srcNode, msg);
                    if (res) {
                        result.value = hlp.getDateOfText(res);
                        const offsetX = this.getFloatProp(_srcNode, msg, offsetType, offset, 0);
                        result.value = hlp.normalizeDate(result.value, offsetX, multiplier, next, days);
                        // this.debug(String(res) + '  --  ' + result.value);
                    } else {
                        result.error = RED._('errors.notEvaluableProperty', {type:vType, value:value});
                    }
                }
            } catch (err) {
                this.debug(util.inspect(err, Object.getOwnPropertyNames(err)));
                const e = new Error(RED._('errors.notEvaluablePropertyAdd', {type:vType, value:value, err:result.error}));
                e.original = err;
                e.stack = e.stack.split('\n').slice(0,2).join('\n')+'\n'+err.stack;
                throw e;
            }

            if (!result.value) {
                if (!result.error) {
                    result.error = 'Can not get time for ' + vType + '=' + value;
                }
                result.value = new Date();
            }

            // this.debug('getTimeProp result' + util.inspect(result));
            return result;
        }
        /*******************************************************************************************************/
        getPropValue(_srcNode, msg, type, value, callback, addID) {
            // _srcNode.debug(`getPropValue ${type}.${value} (${addID})`);
            let result = null;
            if (type === '' || type === 'none' || typeof type === 'undefined' || type === null) {
                return null;
            } else if (type === 'num') {
                result = Number(value);
            } else if (type === 'msgPayload') {
                result = msg.payload;
            } else if (type === 'msgValue') {
                result = msg.value;
            } else if (type === 'DayOfMonth') {
                const d = new Date();
                const nd = hlp.getSpecialDayOfMonth(d.getFullYear(), d.getMonth(), value);
                if (nd === null) {
                    result = false;
                } else {
                    result = (nd.getDate() === d.getDate());
                }
            } else {
                try {
                    result = RED.util.evaluateNodeProperty(value, type, _srcNode, msg);
                } catch (err) {
                    _srcNode.debug(util.inspect(err, Object.getOwnPropertyNames(err)));
                }
            }
            if (typeof callback === 'function') {
                return callback(type, value, result, addID);
            } else if (result === null || typeof result === 'undefined') {
                _srcNode.error(RED._('errors.notEvaluableProperty', { type: type, value: value }));
                return null;
            }
            return result;
        }
        /*******************************************************************************************************/
        comparePropValue(_srcNode, msg, opTypeA, opValueA, compare, opTypeB, opValueB, opCallback) {
            // _srcNode.debug(`getComparablePropValue opTypeA='${opTypeA}' opValueA='${opValueA}' compare='${compare}' opTypeB='${opTypeB}' opValueB='${opValueB}'`);
            if (opTypeA === 'none' || opTypeA === '' || typeof opTypeA === 'undefined' || opTypeA === null) {
                return false;
            }

            const a = this.getPropValue(_srcNode, msg, opTypeA, opValueA, opCallback, 1);
            switch (compare) {
                case 'true':
                    return (a === true);
                case 'false':
                    return (a === false);
                case 'null':
                    return (typeof a == 'undefined' || a === null); // eslint-disable-line eqeqeq
                case 'nnull':
                    return (typeof a != 'undefined' && a !== null); // eslint-disable-line eqeqeq
                case 'empty':
                    if (typeof a === 'string' || Array.isArray(a) || Buffer.isBuffer(a)) {
                        return a.length === 0;
                    } else if (typeof a === 'object' && a !== null) {
                        return Object.keys(a).length === 0;
                    }
                    return false;
                case 'nempty':
                    if (typeof a === 'string' || Array.isArray(a) || Buffer.isBuffer(a)) {
                        return a.length !== 0;
                    } else if (typeof a === 'object' && a !== null) {
                        return Object.keys(a).length !== 0;
                    }
                    return false;
                case 'true_expr':
                    return hlp.isTrue(a);
                case 'false_expr':
                    return hlp.isFalse(a);
                case 'ntrue_expr':
                    return !hlp.isTrue(a);
                case 'nfalse_expr':
                    return !hlp.isFalse(a);
                case 'equal':
                    return (a == this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2));  // eslint-disable-line eqeqeq
                case 'nequal':
                    return (a != this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2));  // eslint-disable-line eqeqeq
                case 'lt':
                    return (a < this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2));
                case 'lte':
                    return (a <= this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2));
                case 'gt':
                    return (a > this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2));
                case 'gte':
                    return (a >= this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2));
                case 'contain':
                    return ((a + '').includes(this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2)));
                case 'containSome': {
                    const vals = this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2).split(/,;\|/);
                    const txt = (a + '');
                    return vals.some(v => txt.includes(v));
                }
                case 'containEvery': {
                    const vals = this.getPropValue(_srcNode, msg, opTypeB, opValueB, opCallback, 2).split(/,;\|/);
                    const txt = (a + '');
                    return vals.every(v => txt.includes(v));
                }
                default:
                    _srcNode.error(RED._('errors.unknownCompareOperator', { operator: compare }));
                    return hlp.isTrue(a);
            }
        }
        /**************************************************************************************************************/
        getSunCalc(date, noTimes) {
            // this.debug(`getSunCalc for date="${date}" noTimes="${noTimes}"`);
            if (typeof date === 'string') {
                // this.debug('getSunCalc for date ' + date);
                const dto = new Date(date);
                if (dto !== 'Invalid Date' && !isNaN(dto)) {
                    date = dto;
                }
            }

            if ((typeof date === 'undefined') || !(date instanceof Date)) {
                this.debug('getSunCalc, no valid date ' + date + ' given');
                date = new Date();
                if (this.lastSunCalc && (Math.abs(date.getTime() - this.lastSunCalc.ts) < 4000)) {
                    this.debug('getSunCalc, time difference since last output to low, do no calculation');
                    return this.lastSunCalc;
                }
            }

            const sunPos = sunCalc.getPosition(date, this.latitude, this.longitude);
            const azimuthDegrees = 180 + 180 / Math.PI * sunPos.azimuth;
            const altitudeDegrees = 180 / Math.PI * sunPos.altitude; // elevation = altitude

            const result = {
                ts: date.getTime(),
                lastUpdate: date,
                latitude: this.latitude,
                longitude: this.longitude,
                angleType: this.angleType,
                azimuth: (this.angleType === 'deg') ? azimuthDegrees : sunPos.azimuth,
                altitude: (this.angleType === 'deg') ? altitudeDegrees : sunPos.altitude, // elevation = altitude
                altitudeDegrees: altitudeDegrees,
                azimuthDegrees: azimuthDegrees,
                altitudeRadians: sunPos.altitude,
                azimuthRadians: sunPos.azimuth
            };

            if (noTimes) {
                // this.debug('no times result= ' + util.inspect(result));
                return result;
            }
            this._sunTimesCheck();
            result.times = this.sunTimesToday;
            this.lastSunCalc = result;
            // this.debug('result= ' + util.inspect(result));
            return result;
        }

        /**************************************************************************************************************/
        getMoonCalc(date, noTimes) {
            if (typeof date === 'string') {
                const dto = new Date(date);
                if (dto !== 'Invalid Date' && !isNaN(dto)) {
                    date = dto;
                }
            }

            if ((typeof date === 'undefined') || !(date instanceof Date)) {
                date = new Date();
                if (this.lastMoonCalc (Math.abs(date.getTime() - this.lastMoonCalc.ts) < 3000)) {
                    return this.lastMoonCalc;
                }
            }

            const moonPos = sunCalc.getMoonPosition(date, this.latitude, this.longitude);
            const moonIllum = sunCalc.getMoonIllumination(date);

            const result = {
                ts: date.getTime(),
                lastUpdate: date,
                latitude: this.latitude,
                longitude: this.longitude,
                angleType: this.angleType,
                azimuth: (this.angleType === 'deg') ? 180 + 180 / Math.PI * moonPos.azimuth : moonPos.azimuth,
                altitude: (this.angleType === 'deg') ? 180 / Math.PI * moonPos.altitude : moonPos.altitude, // elevation = altitude
                distance: moonPos.distance,
                parallacticAngle: (this.angleType === 'deg') ? 180 / Math.PI * moonPos.parallacticAngle : moonPos.parallacticAngle,
                illumination: {
                    angle: (this.angleType === 'deg') ? 180 / Math.PI * moonIllum.angle : moonIllum.angle,
                    fraction: moonIllum.fraction,
                    phase: {},
                    zenithAngle: (this.angleType === 'deg') ? 180 / Math.PI * (moonIllum.angle - moonPos.parallacticAngle) : moonIllum.angle - moonPos.parallacticAngle
                }
            };

            if (moonIllum.phase < 0.01) {
                // 0            New Moon            -   Neumond(Phasenwinkel = 0°)
                result.illumination.phase = moonPhases[0];
            } else if (moonIllum.phase < 0.25) {
                // 0 - 0.25     Waxing Crescent     -   erstes Viertel bzw. zunehmende Sichel(0° < Phasenwinkel < 90°),
                result.illumination.phase = moonPhases[1];
            } else if (moonIllum.phase < 0.26) {
                // 0.25	        First Quarter       -   zunehmender Halbmond(astronomisch: erstes Viertel, Phasenwinkel = 90°),
                result.illumination.phase = moonPhases[2];
            } else if (moonIllum.phase < 0.50) {
                // 0.25 - 0.5   Waxing Gibbous      -   zweites Viertel(90° < Phasenwinkel < 180°),
                result.illumination.phase = moonPhases[3];
            } else if (moonIllum.phase < 0.51) {
                // 0.5	        Full Moon           -   Vollmond(Phasenwinkel = 180°),
                result.illumination.phase = moonPhases[4];
            } else if (moonIllum.phase <= 0.75) {
                // 0.5 - 0.75    Waning Gibbous     -   drittes Viertel (180° < Phasenwinkel < 270°),
                result.illumination.phase = moonPhases[5];
            } else if (moonIllum.phase < 0.76) {
                // 0.75	        Last Quarter        -   abnehmender Halbmond(astronomisch: letztes Viertel, Phasenwinkel = 270°),
                result.illumination.phase = moonPhases[6];
            } else {
                // Waning Crescent                  -   letztes Viertel bzw. abnehmende Sichel(Phasenwinkel > 270°).
                result.illumination.phase = moonPhases[7];
            }

            result.illumination.phase.value = moonIllum.phase;
            result.illumination.phase.angle = (this.angleType === 'rad') ? (moonIllum.phase * 360) / (180 / Math.PI) : moonIllum.phase * 360;

            if (noTimes) { return result; }
            this._sunTimesCheck();
            result.times = this.moonTimesToday;
            // getAngle : angle / 57.2957795130823209 //angle(rad) * (180° / Pi) = angle(deg)

            if (!result.times.alwaysUp) {
                // true if the moon never rises/sets and is always above the horizon during the day
                result.times.alwaysUp = false;
            }

            if (!result.times.alwaysDown) {
                // true if the moon is always below the horizon
                result.times.alwaysDown = false;
            }

            this.lastMoonCalc = result;

            return result;
        }
        /**************************************************************************************************************/
        _checkCoordinates() {
            if (isNaN(this.longitude) || (this.longitude < -180) || (this.longitude > 180)) {
                throw new Error(RED._('position-config.errors.longitude-missing'));
            }
            if (isNaN(this.latitude) || (this.latitude < -90) || (this.latitude > 90)) {
                throw new Error(RED._('position-config.errors.latitude-missing'));
            }
            if ((this.latitude === 0) && (this.longitude === 0)) {
                throw new Error(RED._('position-config.errors.coordinates-missing'));
            }
        }

        _sunTimesRefresh(today, tomorrow, dayId) {
            this._checkCoordinates();
            // this.debug('sunTimesRefresh - calculate sun times');
            this.sunTimesToday = sunCalc.getTimes(today, this.latitude, this.longitude);
            this.sunTimesTomorow = sunCalc.getTimes(tomorrow, this.latitude, this.longitude);
            this.sunDayId = dayId;
        }

        _sunTimesCheck(today, dayId) {
            // this.debug('_sunTimesCheck');
            const dateb = today || new Date();
            const day_id = dayId || this._getUTCDayId(dateb);
            if (this.sunDayId !== day_id) {
                const tomorrow = (new Date()).addDays(1);
                this._sunTimesRefresh(dateb, tomorrow, day_id);
            }

            return {
                calcDate: dateb,
                dayId: day_id
            };
        }

        _moonTimesRefresh(today, tomorrow, dayId) {
            this._checkCoordinates();
            // this.debug('moonTimesRefresh - calculate moon times');
            this.moonTimesToday = sunCalc.getMoonTimes(today, this.latitude, this.longitude, true);
            if (!this.moonTimesToday.alwaysUp) {
                // true if the moon never rises/sets and is always above the horizon during the day
                this.moonTimesToday.alwaysUp = false;
            }

            if (!this.moonTimesToday.alwaysDown) {
                // true if the moon is always below the horizon
                this.moonTimesToday.alwaysDown = false;
            }

            this.moonTimesTomorow = sunCalc.getMoonTimes(tomorrow, this.latitude, this.longitude, true);
            if (!this.moonTimesTomorow.alwaysUp) {
                // true if the moon never rises/sets and is always above the horizon during the day
                this.moonTimesTomorow.alwaysUp = false;
            }

            if (!this.moonTimesTomorow.alwaysDown) {
                // true if the moon is always below the horizon
                this.moonTimesTomorow.alwaysDown = false;
            }

            this.moonDayId = dayId;
        }

        _moonTimesCheck(today, dayId) {
            // this.debug('moonTimesCheck');
            const dateb = today || new Date();
            const day_id = dayId || this._getUTCDayId(dateb);
            if (this.moonDayId !== day_id) {
                const tomorrow = (new Date()).addDays(1);
                this._moonTimesRefresh(dateb, tomorrow, day_id);
            }

            return {
                calcDate: dateb,
                dayId: day_id
            };
        }

        _getUTCDayId(d) {
            return d.getUTCDay() + (d.getUTCMonth() * 31) + (d.getUTCFullYear() * 372);
        }
    }

    /**************************************************************************************************************/
    RED.nodes.registerType('position-config', positionConfigurationNode, {
        credentials: {
            posLongitude: {type: 'text' },
            posLatitude: { type: 'text' }
        }
    });

    RED.httpAdmin.get('/sun-position/js/*', RED.auth.needsPermission('sun-position.read'), (req, res) => {
        const options = {
            root: __dirname + '/static/',
            dotfiles: 'deny'
        };
        res.sendFile(req.params[0], options);
    });

    RED.httpAdmin.get('/sun-position/data', RED.auth.needsPermission('sun-position.read'), (req, res) => {
        if (req.query.config && req.query.config !== '_ADD_') {
            const posConfig = RED.nodes.getNode(req.query.config);
            if (!posConfig) {
                res.status(500).send(JSON.stringify({}));
                return;
            }
            let obj = {};
            switch (req.query.kind) {
                case 'getFloatProp': {
                    try {
                        obj.value = posConfig.getFloatProp(posConfig, undefined, req.query.type, req.query.value, NaN);
                    } catch (err) {
                        obj.value = NaN;
                        obj.error = err;
                    }
                    res.status(200).send(JSON.stringify(obj));
                    break;
                }
                case 'getTimeProp': {
                    try {
                        console.log('getting request');
                        console.log(req.query);
                        obj = posConfig.getTimeProp(posConfig, undefined, req.query.type, req.query.value, req.query.offset, req.query.offsetType, req.query.multiplier, req.query.next, req.query.days);
                        console.log('request result');
                        console.log(obj);
                    } catch(err) {
                        obj.value = NaN;
                        obj.error = err;
                    }
                    res.status(200).send(JSON.stringify(obj));
                    break;
                }
                case 'getDateProp': {
                    try {
                        obj = posConfig.getDateFromProp(posConfig, undefined, req.query.type, req.query.value, req.query.format, req.query.offset, req.query.offsetType, req.query.multiplier);
                    } catch(err) {
                        obj.value = NaN;
                        obj.error = err;
                    }
                    res.status(200).send(JSON.stringify(obj));
                    break;
                }
                case 'getOutDataProp': {
                    try {
                        obj = posConfig.getOutDataProp(posConfig, undefined, req.query.type, req.query.value, req.query.format, req.query.offset, req.query.offsetType, req.query.multiplier, req.query.days);
                    } catch(err) {
                        obj.value = NaN;
                        obj.error = err;
                    }
                    res.status(200).send(JSON.stringify(obj));
                    break;
                }
            }
        }
    });
};