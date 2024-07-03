import EventEmitter from "./event-emitter.js";

class ThermalPrinterStatusInfo {
    online = true;
    cashdrawerOpened = false;
    coverOpened = false;
    paperLoaded = true;
    paperLow = false;
}

class ThermalPrinterStatus {

	constructor(options) {
        this._working = false;
		this._polling = null;
        this._connected = false;

        this._buffer = {
            window:     0,
            cursor:     0,
            data:       new Uint8Array(1024 * 2)       /* 2 KB */
        },

        this._internal = {
            status:     new Proxy (new ThermalPrinterStatusInfo, this.changeHandler()),
            emitter:    new EventEmitter(),
            decoder:    new TextDecoder(),        

            printer:    options.printer || null,
            language:   options.language || null,

            callback:   () => {},
            response:   () => {
                return new Promise(resolve => {
                    this._internal.callback = resolve;
                })
            }
        };


        if (this._internal.printer) {

            /* Request for updates of our status */

            this._internal.printer.addEventListener('data', (data) => this.handleData(data));
            this._internal.printer.listen();

			this._internal.printer.addEventListener('disconnected', () => {
				if (this._polling) {
					clearInterval(this._polling);
				}

				this._connected = false;

				this._internal.emitter.emit('disconnected');
			});

            if (this._internal.language == 'star-prnt') {
                this._internal.printer.print(new Uint8Array([ 0x1d, 0x1e, 0x61, 0x03 ]));
				this._internal.printer.print(new Uint8Array([ 0x1b, 0x1d, 0x42, 0x31 ]));
            }

            if (this._internal.language == 'esc-pos') {
                this._internal.printer.print(new Uint8Array([ 0x1d, 0x61, 1 + 2 + 4 + 8 + 64 ]));
                this._internal.printer.print(new Uint8Array([ 0x10, 0x14, 0x07, 0x01 ]));
            }


			setTimeout(() => {
				if (!this._connected) {
					this._internal.emitter.emit('timeout');
				}
			}, 2000);
        }
    }

    async query(id) {
        let result, response; 

        await new Promise(resolve => {
            setTimeout(resolve, 10);
        });
        

        if (this._internal.language == 'star-prnt') {
            switch(id) {
                case 'manufacturer':
                    result = "Star";
                    break;

                case 'firmware':
                    this._internal.printer.print(new Uint8Array([ 0x1b, 0x23, 0x2a, 0x0a, 0x00 ]));
                    result = await this._internal.response();
                    break;

                case 'serialnumber':
                    this._internal.printer.print(new Uint8Array([ 0x1b, 0x1d, 0x29, 0x49, 0x01, 0x00, 49 ]));
                    response = await this._internal.response();

                    let found = response.match(/PrSrN=([0-9]+)[,$]/);
                    if (found) {
                        result = found[1];
                    }

                    break;

                case 'fonts':
                    this._internal.printer.print(new Uint8Array([ 0x1b, 0x1d, 0x29, 0x49, 0x03, 0x00, 48, 0, 0 ]));
                    response = await this._internal.response();
                    result = response.split(',').filter(i => i);
                    break;

                case 'interfaces':
                    this._internal.printer.print(new Uint8Array([ 0x1b, 0x1d, 0x29, 0x49, 0x03, 0x00, 51, 0, 0 ]));
                    result = await this._internal.response();
                    break;

                default:
                    return;
            }
        }


        if (this._internal.language == 'esc-pos') {
            switch(id) {
                case 'firmware':
                    this._internal.printer.print(new Uint8Array([ 0x1d, 0x49, 65 ]));
                    result = await this._internal.response();
                    break;
                        
                case 'manufacturer':
                    this._internal.printer.print(new Uint8Array([ 0x1d, 0x49, 66 ]));
                    result = await this._internal.response();
                    break;

                case 'model':
                    this._internal.printer.print(new Uint8Array([ 0x1d, 0x49, 67 ]));
                    result = await this._internal.response();
                    break;
                
                case 'serialnumber':
                    this._internal.printer.print(new Uint8Array([ 0x1d, 0x49, 68 ]));
                    result = await this._internal.response();
                    break;
                
                case 'fonts':
                    this._internal.printer.print(new Uint8Array([ 0x1d, 0x49, 69 ]));
                    result = [ await this._internal.response() ];
                    break;
                
                default:
                    return;
            }
        }

        return result;
    }

	pollForBarcodes() {
		if (this._polling) {
			return;
		}

		this._polling = setInterval(() => {
			if (this._connected) {
				this._internal.printer.print(new Uint8Array([ 0x1b, 0x1d, 0x42, 0x32 ]));
			}
		}, 500);
	}

    handleData(data) {
        if (this._buffer.cursor == this._buffer.window) {
            this._buffer.cursor = this._buffer.window = 0;
        }

        this._buffer.data.set(new Uint8Array(data.buffer), this._buffer.window);
        this._buffer.window += data.byteLength;

        if (this._connected === false) {
            this._connected = true;
            this._internal.emitter.emit('connected');
        }

        this.parseData();
    }

	scanUntilLineFeedNul(cursor, window) {
		let found = false;
		let i;

		for (i = cursor; i < window; i++) {
			if (this._buffer.data[i - 1] == 0x0a && this._buffer.data[i] == 0x00) {
				found = true;
				i++;
				break;
			}
		}

		return found ? i : null;
	}

    parseData() {
        if (this._working) {
            return;
        }

        this._working = true;

        function checkBit(target, position, value) {
            return (target >> (position) & 1) === value;
        }

        while (this._buffer.cursor < this._buffer.window) {
            let { cursor, window } = this._buffer;
            let skip = 0;

            if (this._internal.language == 'star-prnt') {

                /* ASB */

                if (checkBit(this._buffer.data[cursor], 0, 1) && checkBit(this._buffer.data[cursor], 4, 0) && checkBit(this._buffer.data[cursor], 7, 0)) {

                    /* Determine size */

                    switch (this._buffer.data[cursor + 0]) {
                        case 0x0f:  skip = 7; break;
                        case 0x21:  skip = 8; break;
                        case 0x23:  skip = 9; break;
                        case 0x25:  skip = 10; break;
                        case 0x27:  skip = 11; break;
                        case 0x29:  skip = 12; break;
                        case 0x2b:  skip = 13; break;
                        case 0x2d:  skip = 14; break;
                        case 0x2f:  skip = 15; break;
                        case 0x41:  skip = 16; break;
                    }

                    this._internal.status.online = ! (this._buffer.data[cursor + 2] & 0b00001000);
                    this._internal.status.cashdrawerOpened = !! (this._buffer.data[cursor + 2] & 0b00000100);
                    this._internal.status.coverOpened = !! (this._buffer.data[cursor + 2] & 0b00100000);
                    this._internal.status.paperLoaded = ! (this._buffer.data[cursor + 5] & 0b00001000);
                }

                /* Response */

                else if (this._buffer.data[cursor] == 0x1b) {

					/* ESC # * , ... LF NUL = Get printer version */

					if (this._buffer.data[cursor + 1] == 0x23 && 
						this._buffer.data[cursor + 2] == 0x2a &&
						this._buffer.data[cursor + 3] == 0x2c) 
					{
						let length = this.scanUntilLineFeedNul(cursor, window);

						if (length !== null) {
							let response = this._buffer.data.subarray(cursor + 4, length - 2);
							this._internal.callback(this._internal.decoder.decode(response));

							skip = length - cursor;
						}
					}
					
					/* ESC GS ) I pL pH fn k1 k2 ... LF NULL */
					/* ESC GS ) I pL pH fn ... LF NULL */

					else if (this._buffer.data[cursor + 1] == 0x1d && 
								this._buffer.data[cursor + 2] == 0x29 && 
								this._buffer.data[cursor + 3] == 0x49) 
					{
						let length = this.scanUntilLineFeedNul(cursor, window);

						if (length !== null) {
							let size = (this._buffer.data[cursor + 5] & 0xff) + this._buffer.data[cursor + 4];
							let response = this._buffer.data.subarray(cursor + 6 + size, length - 2);
							this._internal.callback(this._internal.decoder.decode(response));

							skip = length - cursor;
						}
					}

					/* ESC GS B 1 n */

					else if (this._buffer.data[cursor + 1] == 0x1d && 
						this._buffer.data[cursor + 2] == 0x42 && 
						this._buffer.data[cursor + 3] == 0x31) 
					{
						if (this._buffer.data[cursor + 4] & 0b00000010) {
							this.pollForBarcodes();
						}

						skip = 5;
					}

					/* ESC GS B 2 n */

					else if (this._buffer.data[cursor + 1] == 0x1d && 
						this._buffer.data[cursor + 2] == 0x42 && 
						this._buffer.data[cursor + 3] == 0x32) 
					{
						let size = (this._buffer.data[cursor + 5] & 0xff) + this._buffer.data[cursor + 4];

						if (size > 0) {
							let response = this._buffer.data.subarray(cursor + 6, cursor + 6 + size - 1);
							let barcodes = this._internal.decoder.decode(response).split('\r');

							barcodes.forEach(barcode => {
								barcode = barcode.trim();

								if (barcode != '') {
									this._internal.emitter.emit('barcode', {
										value: barcode
									});
								}
							});
						}

						skip = 6 + size;
					}

					else {
						let length = this.scanUntilLineFeedNul(cursor, window);

						if (length !== null) {
							let response = this._buffer.data.subarray(cursor, length);
							skip = length - cursor;
						}
					}
                }

                else {
                    skip = 1;
                }
            }

            if (this._internal.language == 'esc-pos') {

                /* ASB */

                if (checkBit(this._buffer.data[cursor + 0], 0, 0) && checkBit(this._buffer.data[cursor + 0], 1, 0) && checkBit(this._buffer.data[cursor + 0], 4, 1) && checkBit(this._buffer.data[cursor + 0], 7, 0)) {

                    this._internal.status.online = ! (this._buffer.data[cursor + 0] & 0b00001000);
                    this._internal.status.cashdrawerOpened = ! (this._buffer.data[cursor + 0] & 0b00000100);
                    this._internal.status.coverOpened = !! (this._buffer.data[cursor + 0] & 0b00100000);
                    this._internal.status.paperLoaded = ! (this._buffer.data[cursor + 2] & 0b00001100);
                    this._internal.status.paperLow = !! (this._buffer.data[cursor + 2] & 0b00000011);

                    skip = 4;
                }

                /* PrinterInfoB */

                else if (this._buffer.data[cursor] == 0x5f) {
                    
                    let i;
                    let found = false;
                    
                    for (i = cursor; i < window; i++) {
                        if (this._buffer.data[i] == 0x00) {
                            found = true;
                            i++;
                            break;
                        }
                    }

                    if (found) {
                        let response = this._buffer.data.subarray(cursor + 1, i - 1);
                        this._internal.callback(this._internal.decoder.decode(response));

                        skip = i - cursor;
                    }
                }

                else {
                    skip = 1;
                }
            }

            if (skip == 0) {
                break;
            }

            this._buffer.cursor += skip;            
        }

        this._working = false;
    }

    changeHandler() {
        let that = this;

        return {

            get(target, property, receiver) {
                if (property === 'target') {
                    return target;
                }

                return Reflect.get(target, property, receiver)
            },

            set(obj, prop, value) {        

                if (obj[prop] !== value) {
                    obj[prop] = value;

                    that._internal.emitter.emit('update', obj);
                }

                return true;
            }
        };
    }

    addEventListener(n, f) {
		this._internal.emitter.on(n, f);
	}

    get status() {
        return this._internal.status.target;
    }

    get connected() {
        return this._connected;
    }
}

export default ThermalPrinterStatus;