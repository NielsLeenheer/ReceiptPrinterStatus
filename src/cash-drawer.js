import EventEmitter from "./event-emitter.js";

class ReceiptPrinterCashDrawer {
	#printer;
	#emitter;
	#opened = false;

	constructor(printer) {
		this.#printer = printer;
		this.#emitter = new EventEmitter();
	}

	open() {
		if (!this.#printer.connected) {
			return;
		}

		if (this.#printer.language == 'esc-pos') {
			this.#printer.send([0x1b, 0x70, 0x00, 0x19, 0xfa ]);
		}

		if (this.#printer.language == 'star-prnt' || this.#printer.language == 'star-line') {
			this.#printer.send([ 0x1b, 0x07, 0x14, 0x14, 0x07 ]);
		}
	}

    get supported() {
        return true;
    }

	get opened() {
		return this.#opened;
	}

	set opened(value) {
        if (value !== this.#opened) {
            this.#emitter.emit('update', { opened: value });

            if (value) {
                this.#emitter.emit('open');
            } else {
                this.#emitter.emit('close');
            }
        }

		this.#opened = value;
	}

	addEventListener(n, f) {
		this.#emitter.on(n, f);
	}
}

export default ReceiptPrinterCashDrawer;