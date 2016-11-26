## DreamScreen BLE Interface

Provides a convenient high level abstraction to the BLE interface of the [DreamScreen](http://www.dreamscreentv.com/)

Uses the [command set](http://dreamscreen.boards.net/attachment/download/5) from the [DIY Board](http://dreamscreen.boards.net/board/10/dreamscreen-diy)

Uses [noble](https://github.com/sandeepmistry/noble/) as the interface layer

## Install

It's [on npm](https://www.npmjs.com/package/dreamscreen)

```js
npm install --save dreamscreen
```

## Usage

```js
const DreamScreen = require('dreamscreen');

DreamScreen.getInstance()
.then(ds =>
    ds.setMode('video')
    .then(() => ds.setBrightness(50))
)
```

## Options

Current options that can be passed to **getInstance()**:

| option         | default     | description                                                                                          |
|----------------|-------------|------------------------------------------------------------------------------------------------------|
| discoverByName | false       | The default operation is to try to directly connect to the device by its ID If this is set to *true*, it will instead discover all devices and stops when one of them matches options.localName |
| localName      | DreamScreen | The default name of the device. Only relevant in conjunction with discoverByName = true              |


## Caveats

Noble does not play nice with multiple instances so this package hijacks it.

Things are probably not going to go well if this is used together with other noble packages.

Tested on OSX with node 6.4.0
