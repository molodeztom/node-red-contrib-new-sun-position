/*
 * This code is licensed under the Apache License Version 2.0.
 *
 * Copyright (c) 2022 Robert Gester
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions
 * are met:
 *
 * 1. Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 */

/********************************************
 * sun-position:
 *********************************************/
module.exports = function (RED) {
    'use strict';
    const path = require('path');

    const hlp = require(path.join(__dirname, '/lib/dateTimeHelper.js'));
    const util = require('util');

    /**
     * sunPositionNode
     * @param {*} config - configuration
     */
    function sunPositionNode(config) {
        RED.nodes.createNode(this, config);
        // Retrieve the config node
        this.positionConfig = RED.nodes.getNode(config.positionConfig);
        this.topic = config.topic || '';
        this.rules = config.rules || [];
        this.azimuthPos = {};
        this.start = config.start;
        this.startType = config.startType || 'none';
        this.startOffset = config.startOffset || 0;
        this.startOffsetType = config.startOffsetType || 'none';
        this.startOffsetMultiplier = config.startOffsetMultiplier || 60;
        this.end = config.end;
        this.endType = config.endType || 'none';
        this.endOffset = config.endOffset || 0;
        this.endOffsetType = config.endOffsetType || 'none';
        this.endOffsetMultiplier = config.endOffsetMultiplier || 60;
        const node = this;
        if (!this.positionConfig) {
            node.status({
                fill: 'red',
                shape: 'dot',
                text: 'Node not properly configured!!'
            });
            return;
        }

        this.on('input', function (msg, send, done) {
            // If this is pre-1.0, 'done' will be undefined
            done = done || function (text, msg) { if (text) { return node.error(text, msg); } return null; };
            send = send || function (...args) { node.send.apply(node, args); };

            try {
                let errorStatus = '';
                const dNow = hlp.getNowTimeStamp(this, msg);

                if (!this.positionConfig) {
                    node.status({
                        fill: 'red',
                        shape: 'dot',
                        text: RED._('node-red-contrib-sun-position/position-config:errors.pos-config-state')
                    });
                    done(RED._('node-red-contrib-sun-position/position-config:errors.pos-config'), msg);
                    return null;
                }
                const ports = new Array(this.rules.length);

                ports[0] = RED.util.cloneMessage(msg);
                ports[0].payload = this.positionConfig.getSunCalc(dNow, true, false, msg.latitude || msg.lat,  msg.longitude || msg.lon);
                ports[0].topic = this.topic;
                if (!ports[0].payload.azimuth) {
                    // this.error('Azimuth could not calculated!');
                    send(ports); // this.send(ports);
                    done('Azimuth could not calculated!', msg);
                    return null;
                }

                ports[0].payload.pos = [];
                ports[0].payload.posChanged = false;
                if (node.startType !== 'none') {
                    // const startTime = node.positionConfig.getTimeProp(node, msg, node.startType, node.start, node.startOffsetType, node.startOffset, node.startOffsetMultiplier);
                    const startTime = node.positionConfig.getTimeProp(node, msg, {
                        type: node.startType,
                        value : node.start,
                        offsetType : node.startOffsetType,
                        offset : node.startOffset,
                        multiplier : node.startOffsetMultiplier,
                        now: dNow,
                        latitude: msg.latitude || msg.lat,
                        longitude: msg.longitude || msg.lon
                    });

                    node.debug('startTime: ' + util.inspect(startTime, { colors: true, compact: 10, breakLength: Infinity }));
                    if (startTime.error) {
                        errorStatus = 'could not evaluate start time';
                        node.error(startTime.error);
                        // node.debug('startTime: ' + util.inspect(startTime, { colors: true, compact: 10, breakLength: Infinity }));
                    } else {
                        ports[0].payload.startTime = startTime.value.getTime();
                    }
                }

                if (node.endType !== 'none') {
                    // const endTime = node.positionConfig.getTimeProp(node, msg, node.endType, node.end, node.endOffsetType, node.endOffset, node.endOffsetMultiplier);
                    const endTime = node.positionConfig.getTimeProp(node, msg, {
                        type: node.endType,
                        value : node.end,
                        offsetType : node.endOffsetType,
                        offset : node.endOffset,
                        multiplier : node.endOffsetMultiplier,
                        now: dNow,
                        latitude: msg.latitude || msg.lat,
                        longitude: msg.longitude || msg.lon
                    });

                    node.debug('endTime: ' + util.inspect(endTime, { colors: true, compact: 10, breakLength: Infinity }));
                    if (endTime.error) {
                        errorStatus = 'could not evaluate end time';
                        node.error(endTime.error);
                        // node.debug('endTime: ' + util.inspect(endTime, { colors: true, compact: 10, breakLength: Infinity }));
                    } else {
                        ports[0].payload.endTime = endTime.value.getTime();
                    }
                }

                if (ports[0].payload.startTime && ports[0].payload.endTime) {
                    const nowMillis = dNow.getTime();
                    ports[0].payload.sunInSky = nowMillis > ports[0].payload.startTime && nowMillis < ports[0].payload.endTime;
                }

                for (let i = 0; i < this.rules.length; i += 1) {
                    const rule = this.rules[i];
                    const low = getNumProp(node, msg, rule.valueLowType, rule.valueLow);
                    const high = getNumProp(node, msg, rule.valueHighType, rule.valueHigh);
                    const chk = hlp.checkLimits(ports[0].payload.azimuth, low, high);
                    const chg = (node.azimuthPos[i] !== chk);
                    ports[0].payload.pos.push(chk);
                    ports[0].payload.posChanged = ports[0].payload.posChanged && chg;
                    if (chk) {
                        ports[i + 1] = RED.util.cloneMessage(msg);
                        ports[i + 1].sunPos = chk;
                        ports[i + 1].posChanged = chg;
                        ports[i + 1].azimuth = ports[0].payload.azimuth;
                    }
                }
                node.azimuthPos = ports[0].payload.pos;

                if (errorStatus) {
                    this.status({
                        fill:   'red',
                        shape:  'dot',
                        text:   errorStatus
                    });
                } else if (ports[0].payload.startTime && ports[0].payload.endTime) {
                    if (ports[0].payload.sunInSky === true) {
                        node.status({
                            fill:   'yellow',
                            shape:  'dot',
                            text:   node.positionConfig.toTimeString(new Date(ports[0].payload.startTime)) + ' - ' +
                                    node.positionConfig.toTimeString(new Date(ports[0].payload.endTime))
                        });
                    } else {
                        node.status({
                            fill:   'blue',
                            shape:  'dot',
                            text:   node.positionConfig.toTimeString(new Date(ports[0].payload.startTime)) + ' - ' +
                                    node.positionConfig.toTimeString(new Date(ports[0].payload.endTime))
                        });
                    }
                } else {
                    let fill = 'red';
                    let text = 'no Data loaded!';

                    if (ports[0] && ports[0].payload && ports[0].payload.lastUpdate) {
                        const azimuth = (ports[0].payload.azimuth) ? ports[0].payload.azimuth.toFixed(2) : '?';
                        const altitude = (ports[0].payload.altitude) ? ports[0].payload.altitude.toFixed(2) : '?';
                        text = azimuth + '/' + altitude + ' - ' + node.positionConfig.toDateTimeString(ports[0].payload.lastUpdate);
                        fill = 'grey';
                    }
                    this.status({
                        fill,
                        shape:  'dot',
                        text
                    });
                }
                send(ports); // this.send(ports);
                done();
                return null;
            } catch (err) {
                node.log(err.message);
                node.log(util.inspect(err, Object.getOwnPropertyNames(err)));
                node.status({
                    fill: 'red',
                    shape: 'ring',
                    text: 'internal error: ' + err.message
                });
                done('internal error sun-position:' + err.message, msg);
            }
            return null;
        });

        /**
         * get the value ofd a numeric property
         * @param {*} srcNode - source node
         * @param {*} msg - message object
         * @param {string} vType - type
         * @param {string} value - value
         * @returns {number} the result value for the type and value
         */
        function getNumProp(srcNode, msg, vType, value) {
            try {
                if (vType === 'none') {
                    return undefined;
                }
                return node.positionConfig.getFloatProp(node, msg, vType, value, 0);
            } catch (err) {
                return undefined;
            }
        }
    }

    RED.nodes.registerType('sun-position', sunPositionNode);
};