## DreamScreen BLE Interface

Provides a convenient high level abstraction to the BLE API for the [DreamScreen](http://www.dreamscreentv.com/)

Uses the [command set](http://dreamscreen.boards.net/attachment/download/5) from the [DIY Board](http://dreamscreen.boards.net/board/10/dreamscreen-diy)

Uses [noble](https://github.com/sandeepmistry/noble/) as the interface layer

## Usage

```js
const DreamScreen = require('dreamscreen');

DreamScreen.getInstance()
.then(ds =>
    ds.setMode('video')
    .then(() => ds.setBrightness(50))
)
```

## Caveats

Noble does not play nice with multiple instances so this package hijacks it.

Things are probably not going to go well if this is used together with other noble packages.

Tested on OSX with node 6.4.0
