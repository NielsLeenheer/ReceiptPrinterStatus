class ResponseBuffer {

	window 	= 0;
	cursor 	= 0;
	data 	= new Uint8Array(1024 * 2);       /* 2 KB */ 

	add(data) {
		if (this.cursor == this.window) {
            this.cursor = this.window = 0;
        }

        this.data.set(new Uint8Array(data.buffer), this.window);
        this.window += data.byteLength;
	}

    get(from, to) {
        if (!from) {
            from = 0;
        }
        
        if (!to) {
            return this.data[from + this.cursor];
        }

        return this.data.subarray(from + this.cursor, to + this.cursor);
    }


    getWord(target) {
        return this.data[target + this.cursor] | this.data[target + this.cursor + 1] << 8;
    }

    getBit(target, position) {
		return this.data[target + this.cursor] >> (position) & 1;
	}

    getBits(target, pattern) {
		if (typeof target === 'string') {
            pattern = target;
            target = 0;
        }

        let bits = pattern.split('').map((b,i) => [ 7 - i, b != '.' ? parseInt(b, 10) : null ]).filter(b => b[1] !== null);
        let value = 0;

        for (let bit of bits) {
            value |= this.getBit(target, bit[0]) << bit[1];
        }

        return value;
    }

	scanUntilLineFeedNul(window) {
		let found = false;
		let i;

		for (i = this.cursor; i < window; i++) {
			if (this.data[i - 1] == 0x0a && this.data[i] == 0x00) {
				found = true;
				i++;
				break;
			}
		}

		return found ? i - this.cursor : null;
	}

    scanUntilNul(window) {
		let found = false;
		let i;

		for (i = this.cursor; i < window; i++) {
			if (this.data[i] == 0x00) {
				found = true;
				i++;
				break;
			}
		}

		return found ? i - this.cursor : null;
	}

	checkBit(target, position, value) {
		return (this.data[target + this.cursor] >> (position) & 1) === value;
	}

	checkBits(target, bits) {
		if (typeof target === 'string') {
            bits = target;
            target = 0;
        }

		if (typeof bits === 'string') {
			bits = bits.split('').map((b,i, a) => [ a.length - i - 1, parseInt(b) ]).filter(b => !isNaN(b[1]))
		}

		for (let bit of bits) {
			if (!this.checkBit(target, bit[0], bit[1])) {
				return false;
			}
		}

		return true;
	}

	checkSequence(target, sequence) {
		if (target instanceof Array) {
            sequence = target;
            target = 0;
        }
        
        for (let i = 0; i < sequence.length; i++) {
			if (this.data[target + this.cursor + i] != sequence[i]) {
				return false;
			}
		}

		return true;
	}

    get length() {
        return this.window - this.cursor;
    }
}

export default ResponseBuffer;