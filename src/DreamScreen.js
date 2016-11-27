
const EventEmitter = require('events');
const noble = require('noble');

const config = require('./config');

const DREAMSCREEN = {
    id: '0000ff60-0000-1000-8000-00805f9b34fb',
    service: 'ff60',
    commandChar: '0000ff61-0000-1000-8000-00805f9b34fb',    // (Read/Write)
    responseChar: '0000ff62-0000-1000-8000-00805f9b34fb',   // (Read/Write/Notify)
    nameChar: '0000ff63-0000-1000-8000-00805f9b34fb',       // (Read/Write)
};

module.exports = (options) => new Promise((resolve, reject) => {
    options = Object.assign({}, {
        debug: false,

        // If set to true, instead of using the DREAMSCREEN.id to discover the device
        //  it will instead discover all devices until one with the options.localName is found
        discoverByName: false,

        // Relevant if discoverByName is used - the name of the DS
        localName: 'DreamScreen',
    }, options);

    noble.on('stateChange', function(state) {
        if (state === 'poweredOn') {
            if (options.discoverByName) noble.startScanning();
            else noble.startScanning([DREAMSCREEN.id]);
        } else {
            noble.stopScanning();
        }
    });

    noble.on('discover', peripheral => {
        if (options.discoverByName && peripheral.advertisement.localName !== options.localName) return;
        noble.stopScanning();

        if (options.debug) console.log(peripheral.advertisement);
        connect(peripheral, options).then(resolve, reject);
    });
});

const connect = (peripheral, options) =>
    Promise.resolve()
    .then(() => callAsPromise(peripheral, 'connect'))
    .then(() => callAsPromise(peripheral, 'discoverServices', [[DREAMSCREEN.service]]))
    .then(([service]) =>
        service ?
            callAsPromise(service, 'discoverCharacteristics', [[]]) :
            Promise.reject('service not found')
    )
    .then((chars) => {
        const command = chars.find(item => item.uuid === 'ff61');
        if (!command) throw new Error(`command characteristic not found`);

        const response = chars.find(item => item.uuid === 'ff62');
        if (!response) throw new Error(`response characteristic not found`);

        if (options.debug) console.log('--- ready ---');

        return new DreamScreen({peripheral, command, response}, options);
    });

/**
 * Events:
 *  - disconnect    ()
 *  - read          (message)
 *  - send          (code)
 */
class DreamScreen extends EventEmitter {

    constructor ({peripheral, command, response}, options) {
        super();

        this.peripheral = peripheral;
        this.command = command;
        this.response = response;
        this.options = options;

        this._queue = [];
        this._listeners = [];
        this._running = false;
        this._init = false;
        this._setupListeners();
    }

    /******************************/
    /**** HIGH LEVEL INTERFACE ****/
    /******************************/

    /**
     * Changes the display mode
     *
     * Values:
     *  - idle
     *  - video
     *  - music
     *  - ambientStatic
     *  - identify
     *  - ambientShow
     *
     * @param {String} type
     *
     * @return {Promise}
     */
    setMode (type) {
        const opCode = config.mode[type];
        if (opCode == null) return Promise.reject(`Invalid mode: ${type}`);
        return this.writeProp('mode', opCode);
    }

    /**
     * Sets the brightness (0 - 100)
     *
     * @param {Number} value
     *
     * @return {Promise}
     */
    setBrigtness (value) {
        const {min, max} = config.brightness;
        const data = ('000' + Math.max(min, Math.min(max, value))).slice(-3);
        return this.writeProp('brightness', data);
    }

    /***************************/
    /**** RAW INPUT METHODS ****/
    /***************************/

    /**
     * Utility that sends the correct command code.
     * Does not do any type-checking or value conversion
     *
     * @example
     *  writeProp('mode', '1')  // same as this.setMode('video')
     *      // will send: '#Bw1'
     *
     * @param  {String} cmd   One of the commands available in config.js
     * @param  {String} value Anything to be appended to the command
     *
     * @return {Promise}
     */
    writeProp (cmd, value) { return this.sendWrite('#' + config[cmd].key + 'w' + value); };

    sendRead (code) {
        return this.send(code, () => this._addMessageListener())
            .then(result => Object.assign({}, result, {code}));
    }

    sendWrite (code) { return this.send(code); }

    send (code, intermediateStep) {
        this.emit('send', code);
        const defer = getDefer();
        this._queue.push(() => {
            if (this.options.debug) console.log('  --->', code);
            return callAsPromise(this.command, 'write', [new Buffer(code), false])
            .then(intermediateStep)
            .then(defer.resolve, defer.reject);
        });
        this._exec();
        return defer.promise;
    }

    /**************************/
    /**** INTERNAL METHODS ****/
    /**************************/

    _setupListeners () {
        this.peripheral.on('disconnect', () => {
            if (this.options.debug) console.log('Disconnected');
            this.emit('disconnect');
        });

        return callAsPromise(this.response, 'notify', [true])
        .then(() => {
            this.response.on('read', (data, isNotification) => {
                let cleanData = data.toString('utf8');
                const endIndex = cleanData.indexOf('\r');
                if (endIndex >= 0) cleanData = cleanData.slice(0, endIndex);

                const getMessage = () => ({
                    isNotification,
                    data: cleanData,
                });

                if (this.options.debug) console.log(' <--- ', getMessage());

                this._listeners.forEach(defer => defer.resolve(getMessage()));
                this._listeners = [];
                this.emit('read', getMessage());
            });

            this._init = true;
            this._exec();
        });
    }

    _exec () {
        if (!this._init) return;

        if (this._running) return;
        this._running = true;

        const done = () => {
            this._running = false;
            this._exec();
        };

        const fn = this._queue.shift();
        return Promise.resolve()
        .then(fn)
        .then(done, done);
    }

    _addMessageListener () {
        const defer = getDefer();
        this._listeners.push(defer);
        return defer.promise;
    }
}

const getDefer = () => {
    const result = {};
    const promise = new Promise((resolve, reject) => {
        result.resolve = resolve;
        result.reject = reject;
    });
    result.promise = promise;
    return result;
}

const callAsPromise = (obj, method, args=[]) => new Promise((resolve, reject) => {
    obj[method].apply(obj, args.concat((error, result) => {
        if (error) return reject(error);
        resolve(result);
    }));
});
