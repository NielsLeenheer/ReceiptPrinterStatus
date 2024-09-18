import EventEmitter from "./event-emitter.js";

class ReceiptPrinterBarcodeScanner {
	#printer;
	#emitter;
	#connected = false;
    #supported = false;

	constructor(printer) {
		this.#printer = printer;
		this.#emitter = new EventEmitter();

        if (this.#printer._language == 'star-prnt') {
            this.#supported = true;
        }
	}

    get supported() {
        return this.#supported;
    }

	get connected() {
		return this.#connected;
	}

	set connected(value) {
		if (!this.#connected && value) {
			this.#emitter.emit('connected');
		}

		this.#connected = value;
        this.#supported = true;
	}

	set barcode(value) {
		this.#emitter.emit('barcode', { value });
	}

	addEventListener(n, f) {
		this.#emitter.on(n, f);
	}
}

export default ReceiptPrinterBarcodeScanner;