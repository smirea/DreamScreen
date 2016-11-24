
const noble = require('noble');

const DREAMSCREEN = {
    id: '0000ff60-0000-1000-8000-00805f9b34fb',
    service: 'ff60',
    commandChar: '0000ff61-0000-1000-8000-00805f9b34fb',    // (Read/Write)
    responseChar: '0000ff62-0000-1000-8000-00805f9b34fb',   // (Read/Write/Notify)
    nameChar: '0000ff63-0000-1000-8000-00805f9b34fb',       // (Read/Write)
};

module.exports = () => new Promise((resolve, reject) => {
    noble.on('stateChange', function(state) {
        if (state === 'poweredOn') {
            noble.startScanning([DREAMSCREEN.id]);
        } else {
            noble.stopScanning();
        }
    });

    noble.on('discover', peripheral => {
        noble.stopScanning();

        peripheral.on('disconnect', () => {
            process.exit(0);
        });

        console.log(peripheral.advertisement)
        connect(peripheral).then(resolve, reject);
    });
});

const connect = peripheral =>
    Promise.resolve()
    .then(() => callAsPromise(peripheral, 'connect'))
    .then(() => callAsPromise(peripheral, 'discoverServices', [[DREAMSCREEN.service]]))
    .then(([service]) => callAsPromise(service, 'discoverCharacteristics', [[]]))
    .then((chars) => {
        const command = chars.find(item => item.uuid === 'ff61');
        if (!command) throw new Error(`command characteristic not found`);

        const response = chars.find(item => item.uuid === 'ff62');
        if (!response) throw new Error(`response characteristic not found`);

        console.log('--- ready ---');

        return new DreamScreen(null, command, response);
    });

const PROPS = {
    mode: {
        key: 'B',

        idle: '0',
        video: '1',
        music: '2',
        ambientStatic: '3',
        identify: '4',
        ambientShow: '5',
    },

    brightness: {
        key: 'C',
        min: 0,
        max: 100,
    },

    // TODO - add all the other properties
};

class DreamScreen {
    constructor (service, command, response) {
        this.service = service;
        this.command = command;
        this.response = response;

        this._queue = [];
        this._listeners = [];
        this._running = false;
        this._init = false;
        this._setupListeners();
    }

    setMode (type) {
        const opCode = PROPS.mode[type];
        if (opCode == null) return Promise.reject(`Invalid mode: ${type}`);
        return this.writeProp('mode', opCode);
    }

    setBrigtness (value) {
        const {min, max} = PROPS.brightness;
        const data = ('000' + Math.max(min, Math.min(max, value))).slice(-3);
        return this.writeProp('brightness', data);
    }

    writeProp (type, value) { return this.sendWrite('#' + PROPS[type].key + 'w' + value); };

    sendRead (code) {
        return this.send(code, () => this._addMessageListener())
            .then(result => Object.assign({}, result, {code}));
    }

    sendWrite (code) { return this.send(code); }

    send (code, intermediateStep) {
        const defer = getDefer();
        this._queue.push(() => {
            console.log(' --->', code);
            return callAsPromise(this.command, 'write', [new Buffer(code), false])
            .then(intermediateStep)
            .then(defer.resolve, defer.reject);
        });
        this._exec();
        return defer.promise;
    }

    _setupListeners () {
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
                console.log(' <---', getMessage());
                this._listeners.forEach(defer => defer.resolve(getMessage()));
                this._listeners = [];
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
