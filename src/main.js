import EventEmitter from "./event-emitter.js";
import ResponseBuffer from "./response-buffer.js";
import ChangeObserver from "./change-observer.js";
import ReceiptPrinterInfo from "./info.js";
import ReceiptPrinterBarcodeScanner from "./barcode-scanner.js";
import ReceiptPrinterCashDrawer from "./cash-drawer.js";


class ReceiptPrinterStatus {

	constructor(options) {
        this._connected = false;

		/* Defaults */

		options.language = options.language || 'auto';

		/* Input checks */

		if (typeof options.printer === 'undefined') {
			throw new Error('You need to provide a printer driver instance');
		}

		if (Object.getPrototypeOf(options.printer).constructor.name == 'ReceiptPrinterDriver') {
			throw new Error('Printer driver not supported by this library');
		}
	
		if (! [ 'esc-pos', 'star-prnt', 'star-line', 'auto' ].includes(options.language)) {
			throw new Error('Language not supported by this library');
		}

		/* Initialize properties */

		this._language = options.language;
		this._parsing = false;
		this._polling = null;
		this._updates = 0;

		this._pollForUpdates = false;
		this._pollForBarcodes = false;

        this._internal = {
            emitter:    new EventEmitter(),
            decoder:    new TextDecoder(),       
			buffer:		new ResponseBuffer(),
			status:	 	ChangeObserver.create({
							target:		new ReceiptPrinterInfo, 
							callback: 	target => {
								this._internal.emitter.emit('update', target)
							}
						}),

            printer:    options.printer,
            language:   options.language,
			polling:	options.polling || 'auto',

            callback:   () => {},
            response:   () => {
                return new Promise(resolve => {
                    this._internal.callback = resolve;
                })
            }
        };

		this.barcodeScanner = new ReceiptPrinterBarcodeScanner(this);
		this.cashDrawer = new ReceiptPrinterCashDrawer(this);

		/* Initialize the printer */

		this.initialize();
	}

	async initialize() {

		/* Handle responses from the printer */

		this._internal.printer.addEventListener('data', (data) => this.receive(data));
		
		let listening = await this._internal.printer.listen();

		if (!listening) {	
			this._internal.emitter.emit('unsupported');
			return;
		}

		/* Handle disconnections */

		this._internal.printer.addEventListener('disconnected', () => {
			if (this._polling) {
				clearInterval(this._polling);
			}

			this._connected = false;
			this._internal.emitter.emit('disconnected');
		});


		/* Send initialisation commands */

		if (this._language == 'auto') {
			this.initializeUnknownPrinter();
		}

		if (this._language == 'star-line' || this._language == 'star-prnt') {
			this.initializeStarPrinter();
		}

		if (this._language == 'esc-pos') {
			this.initializeEscPosPrinter();
		}

		/* Set timeout in case we do not receive any response to the initialisation */

		setTimeout(() => {
			if (!this._connected) {
				this._internal.emitter.emit('unsupported');
			}
		}, 1500);
    }

	initializeUnknownPrinter() {

		/*
			To detect the printer we send a Star ASB request, and an ESC/POS real-time status request.
			The Star printer will ignore the ESC/POS command and the ESC/POS printer will ignore
			the Star command. Both printers will respond and we can determine the printer type
			based on what the printer responds. 
		*/

		/* ESC ACK SOH = Request ASB (Star) */
		this.send([ 0x1b, 0x06, 0x01 ]);

		/* DLT EOT 1 = Transmit real-time status (ESC/POS) */
		this.send([ 0x10, 0x04, 0x01 ]);
	}

	initializeStarPrinter() {

		/* 
			If the language was not known, we already asked for a ASB, so we do not need to do it again 
		*/

		if (this._language == 'star-line' || this._language == 'star-prnt') {
			/* ESC ACK SOH = Request ASB */
			this.send([ 0x1b, 0x06, 0x01 ]);
		}

		/* 
			On Star printers we get automatic ASB, or we need to poll. We check after 1 second 
			if we have received any automatic ASB response, and if not we start polling.
		*/

		if (this._internal.polling == 'auto') {
			setTimeout(() => {
				if (this._updates == 1) {
					this._pollForUpdates = true;
					this.poll();
				}
			}, 1000);
		}

		if (this._internal.polling === true) {
			this._pollForUpdates = true;
			this.poll();
		}
	}

	initializeEscPosPrinter() {

		/* 
			On ESC/POS printers ASB is turned off by default, but we can turn it on 
		*/

		/* GS a n = Enable Automatic Status Back (ASB) */
		this.send([ 0x1d, 0x61, 1 + 2 + 4 + 8 + 64 ]);

		/* DLE DC4 7 1 = Request ASB */
		this.send([ 0x10, 0x14, 0x07, 0x01 ]);

		if (this._internal.polling === true) {
			this._pollForUpdates = true;
			this.poll();
		}
	}



    async query(id) {
        let result, response, found; 

        await new Promise(resolve => {
            setTimeout(resolve, 10);
        });
        

		/* StarPRNT and Star Line */

        if (this._language == 'star-prnt' || this._language == 'star-line') {

            switch(id) {
                case 'manufacturer':
                    result = "Star";
                    break;

				case 'model':
					/* ESC # * LF NUL = Get printer version */
                    this.send([ 0x1b, 0x23, 0x2a, 0x0a, 0x00 ]);
                    response = await this._internal.response();

					found = response.match(/^(.*)Ver[0-9\.]+$/);
                    if (found) {
                        result = found[1];

						switch(result) {
							case 'POP10':	result = 'mPOP'; break;
						}
                    }

                    break;

				case 'firmware':
					/* ESC # * LF NUL = Get printer version */
                    this.send([ 0x1b, 0x23, 0x2a, 0x0a, 0x00 ]);					
                    result = await this._internal.response();
                    break;
            }
        }

		/* StarPRNT */

		if (this._language == 'star-prnt') {
            switch(id) {
                case 'serialnumber':
					/* ESC GS ) I pL pH 49 = Transmit printer information */
					this.send([ 0x1b, 0x1d, 0x29, 0x49, 0x01, 0x00, 49 ]);
					response = await this._internal.response();

					found = response.match(/PrSrN=([0-9]+)[,$]/);
					if (found) {
						result = found[1];
					}

                    break;

                case 'fonts':
					/* ESC GS ) I pL pH 48 d1 d2 = Transmit all types of multibyte fonts */
					this.send([ 0x1b, 0x1d, 0x29, 0x49, 0x03, 0x00, 48, 0, 0 ]);
                    response = await this._internal.response();
                    result = response.split(',').filter(i => i);
                    break;

                case 'interfaces':
					/* ESC GS ) I pL pH 51 d1 d2 = Transmit installed I/F kind */
					this.send([ 0x1b, 0x1d, 0x29, 0x49, 0x03, 0x00, 51, 0, 0 ]);
					result = await this._internal.response();
                    break;			
			}
		}

		/* ESC/POS */

        if (this._language == 'esc-pos') {
            switch(id) {
                case 'firmware':
					/* GS I 65 = Transmit printer firmware version */ 
                    this.send([ 0x1d, 0x49, 65 ]);
                    result = await this._internal.response();
                    break;
                        
                case 'manufacturer':
					/* GS I 66 = Transmit printer maker name */ 
                    this.send([ 0x1d, 0x49, 66 ]);
                    result = await this._internal.response();
                    break;

                case 'model':
					/* GS I 67 = Transmit printer model name */ 
                    this.send([ 0x1d, 0x49, 67 ]);
                    result = await this._internal.response();
                    break;
                
                case 'serialnumber':
					/* GS I 68 = Transmit printer serial no */ 
                    this.send([ 0x1d, 0x49, 68 ]);
                    result = await this._internal.response();
                    break;
                
                case 'fonts':
					/* GS I 69 = Transmit printer font of language for each country */ 
                    this.send([ 0x1d, 0x49, 69 ]);
					let response = await this._internal.response();

					if (response) {
                    	result = [ response ]; 
					} else {
						result = [];
					}

                    break;
            }
        }

        return result;
    }

	send(data) {
		// console.hex(data);

		this._internal.printer.print(new Uint8Array(data));
	}

	receive(data) {
		// console.hex(data);

		this._internal.buffer.add(data);
        this.parseResponse();
    }

	connect() {
        if (this._connected === false) {
            this._connected = true;
            this._internal.emitter.emit('connected');
        }
	}

	poll() {
		if (this._polling) {
			return;
		}

		this._polling = setInterval(() => {
			if (this._connected) {			
				if (this._language == 'star-prnt') {
					if (this._pollForBarcodes) {
						this.send([ 0x1b, 0x1d, 0x42, 0x32 ]);		/* ESC GS B 2 = Get barcode scanner buffer */
					}

					if (this._pollForUpdates) {
						this.send([ 0x1b, 0x06, 0x01 ]);			/* ESC ACK SOH = Request ASB */
					}
				}

				if (this._language == 'star-line') {
					if (this._pollForUpdates) {
						this.send([ 0x1b, 0x06, 0x01 ]);			/* ESC ACK SOH = Request ASB */
					}
				}

				if (this._language == 'esc-pos') {
					if (this._pollForUpdates) {
						this.send([ 0x1d, 0x61, 1 + 2 + 4 + 8 + 64 ]);
					}
				}
			}
		}, 500);
	}



    parseResponse() {
        if (this._parsing) {
            return;
        }

		this._parsing = true;

		while (this._internal.buffer.length) {
            let skip = 1;

			/* If we do not know the language, we need to detect it first */

			if (this._language == 'auto') {
				this._language = this.detectLanguage(this._internal.buffer);
			}

			/* And once we know, we can parse it */
			
            if (this._language == 'star-line' || this._language == 'star-prnt') {
				skip = this.parseStarResponse(this._internal.buffer);
            }

            if (this._language == 'esc-pos') {
				skip = this.parseEscPosResponse(this._internal.buffer);
            }

            if (skip == 0) {
                break;
            }

            this._internal.buffer.cursor += skip;            
        }

        this._parsing = false;
    }

	detectLanguage(buffer) {
		if (buffer.checkBits('0..1..10')) {
			this.initializeEscPosPrinter();
			return 'esc-pos';
		}

		if (buffer.checkBits('0..0...1')) {
			this.initializeStarPrinter();
			return 'star-prnt';
		}

		return 'unknown';
	}

	parseEscPosResponse(buffer) {
		let skip = 0;
		let { window, length } = buffer;

		/* ASB */

		if (length >= 4 && buffer.checkBits('0..1..00')) 
		{
			this._internal.status.online = buffer.checkBits('....0...');
			this._internal.status.coverOpened = buffer.checkBits('..1.....');
			this._internal.status.buttonPressed = buffer.checkBits('.1......');
			this._internal.status.paperLoaded = buffer.checkBits(2, '....00..');
			this._internal.status.paperLow = buffer.checkBits(2, '......11');

			this.cashDrawer.opened = buffer.checkBits('.....0..');

			this._updates++;
			this.connect();

			skip = 4;
		}

		else if (length >= 1 && buffer.checkBits('0..1..10')) 
		{
			this._internal.status.online = buffer.checkBits('....0...');
			this._internal.status.buttonPressed = buffer.checkBits('.1......');

			this.cashDrawer.opened = buffer.checkBits('.....0..');

			skip = 1;
		}

		/* PrinterInfoB */

		else if (length >= 2 && buffer.get() == 0x5f) 
		{	
			let size = buffer.scanUntilNul(window);

			if (size !== null) {
				let response = buffer.get(1, size - 1);
				this._internal.callback(this._internal.decoder.decode(response));

				skip = size;
			}
		}

		else {
			skip = 1;
		}

		return skip;
	}

	parseStarResponse(buffer) {		
		let skip = 0;
		let { window, length } = buffer;

		/* ASB */

		if (buffer.checkBits('0..0...1')) 
		{
			let size = buffer.getBits('..3.210.');

			if (length >= size) {

				/* First response from the printer */

				if (this._updates == 0) {
					let version = buffer.getBits(1, '..3.210.');

					/*
						mC-Print2		5		star-prnt
						mC-Print3		5,6		star-prnt
						mC-Label3		7		star-prnt
						mPOP			4,5		star-prnt
						TSP100 			3		star-graphics
						TSP100II    	3		star-graphics
						TSP100III		3		star-graphics
						TSP100IV		6		star-prnt
						TSP600			1,3		star-line
						TSP650 			3		star-line
						TSP650II		3		star-line
						TSP700			1,3		star-line
						TSP700II		3		star-line
						TSP800			1,3		star-line
						TSP800L			3		star-line
						TSP800II		3		star-line
						TSP1000			3		star-line
					*/		

					/* Detect if we are using StarPRNT or Star Line */

					if (version >= 4) {
						this._language = 'star-prnt';
					} else {
						this._language = 'star-line';
					}

					/* Initialize optional printer features */

					if (this._language == 'star-prnt') {

						/* ESC GS B 1 = Barcode scanner status request */
						this.send([ 0x1b, 0x1d, 0x42, 0x31 ]);
					}
				}

				this._internal.status.online = buffer.checkBits(2, '....0...');
				this._internal.status.coverOpened = buffer.checkBits(2, '..1.....');
				this._internal.status.buttonPressed = buffer.checkBits(2, '.1......');
				this._internal.status.paperLoaded = buffer.checkBits(5, '....0...');
			
				this.cashDrawer.opened = buffer.checkBits(2, '.....1..');

				this._updates++;
				this.connect();

				skip = size;
			}
		}

		/* ESC # * , ... LF NUL = Get printer version */

		else if (length >= 7 && buffer.checkSequence([ 0x1b, 0x23, 0x2a, 0x2c ])) 
		{
			let size = buffer.scanUntilLineFeedNul(window);

			if (size !== null) {
				let response = buffer.get(4, size - 2);
				this._internal.callback(this._internal.decoder.decode(response));

				skip = size;
			}
		}
			
		/* ESC GS ) I pL pH fn k1 k2 ... LF NULL */
		/* ESC GS ) I pL pH fn ... LF NULL */

		else if (length >= 9 && buffer.checkSequence([ 0x1b, 0x1d, 0x29, 0x49 ])) 
		{
			let size = buffer.scanUntilLineFeedNul(window);

			if (size !== null) {
				let header = buffer.getWord(4);
				let response = buffer.get(6 + header, size - 2);
				this._internal.callback(this._internal.decoder.decode(response));

				skip = size;
			}
		}

		/* ESC GS B 1 n = barcode status */

		else if (length >= 5 && buffer.checkSequence([ 0x1b, 0x1d, 0x42, 0x31 ])) 
		{
			if (buffer.get(4) & 0b00000010) {
				this.barcodeScanner.connected = true;

				this._pollForBarcodes = true;
				this.poll();
			}

			skip = 5;
		}

		/* ESC GS B 2 n = Barcode buffer */

		else if (length >= 5 && buffer.checkSequence([ 0x1b, 0x1d, 0x42, 0x32 ])) 
		{
			let size = buffer.getWord(4);

			if (size > 0) {
				let response = buffer.get(6, 6 + size - 1);
				let barcodes = this._internal.decoder.decode(response).split('\r');

				barcodes.forEach(barcode => {
					barcode = barcode.trim();

					if (barcode != '') {
						this.barcodeScanner.barcode = barcode;
					}
				});
			}

			skip = 6 + size;
		}

		/* ESC = start of a response, but not yet complete */

		else if (buffer.get() == 0x1b) 
		{
			skip = 0;
		}
	
		/* A normal character */

		else {
			skip = 1;
		}

		return skip;
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

	get language() {
		return this._language;
	}
}

export default ReceiptPrinterStatus;