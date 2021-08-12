const CHUNK_NAME = 'foNt';
const CHUNK_NAME_INT = 0x666f4e74; // Big-endian

function isObjectEmpty(obj) {
	for (const _ in obj) {
		return false;
	}
	return true;
}

export default class Font {
	
	// TRIE => {<char>: TRIE?, ligature: LIGATURE?}
	// LIGATURE => {key: <trie key>, advance: <pixels>, glyphs: [GLYPH*]}
	// GLYPH => {xOffset: <pixels>, image: <bitmap>}
	#ligTrie;
	#numLigatures;
	
	#lineHeight;
	#baseline;
	
	constructor() {
		this.#ligTrie = Object.create(null);
		this.#numLigatures = 0;
	}
	
	async load(imageFile) {
		if (imageFile.type !== 'image/png') {
			throw new Error('Provided font image file is not image/png, but ' + imageFile.type);
		}
		
		const fileBitmapPromise = createImageBitmap(imageFile);
		const fileData = new DataView(await imageFile.slice(8).arrayBuffer());
		
		for (let i = 0; i < fileData.byteLength;) {
			const dataLen = fileData.getUint32(i);
			const chunkName = fileData.getUint32(i + 4);
			if (chunkName === CHUNK_NAME_INT) {
				const data = new Uint8Array(fileData.buffer, i + 8, dataLen);
				return await this.#parseData(data, await fileBitmapPromise);
			}
			i += dataLen + 12;
		}
		
		throw new Error('PNG did not contain a ' + CHUNK_NAME + ' chunk.');
	}
	
	// DATA:
	// row height
	// line height
	// y-offset down from baseline
	// <LIGATURE>*
	// 0
	
	// LIGATURE:
	// text len (nonzero)
	// <text UTF-8>*
	// x-advance
	// num alt glyphs
	// <GLYPH>*
	
	// GLYPH:
	// x-offset
	// width
	
	async #parseData(data, image) {
		const ongoing = [];
		
		let byteIndex = 0;
		const nextByte = () => {
			if (byteIndex < data.length) {
				return data[byteIndex++];
			} else {
				throw new Error('Font data ended unexpectedly');
			}
		};
		const nextSlice = len => {
			if (byteIndex + len <= data.length) {
				const slice = new Uint8Array(data, byteIndex, len);
				byteIndex += len;
				return slice;
			} else {
				throw new Error('Font data ended unexpectedly');
			}
		};
		
		let rowHeight = nextByte();
		this.#lineHeight = nextByte();
		this.#baseline = nextByte();
		
		const decoder = new TextDecoder('utf-8', { fatal: true });
		
		let inY = 0;
		let inX = 0;
		while (true) {
			const keyLength = nextByte();
			if (keyLength === 0) {
				break;
			}
			const key = decoder.decode(nextSlice(keyLength));
			const advance = nextByte();
			const numGlyphs = nextByte();
			const glyphs = [];
			for (let i = 0; i < numGlyphs; i++) {
				const glyph = { xOffset: nextByte(), image: null };
				glyphs.push(glyph);
				const width = nextByte();
				if (width !== 0) {
					ongoing.push(
						createImageBitmap(image, inX, inY, width, rowHeight)
						.then(im => glyph.image = im));
					inX += width;
					if (inX >= image.width) {
						inX = 0;
						inY += rowHeight;
					}
				}
			}
			
			this.addLigature({ key, advance, glyphs });
		}
		
		await Promise.all(ongoing);
		return this;
	}
	
	addLigature(ligature) {
		let currTrie = this.#ligTrie;
		for (const char of ligature.key) {
			currTrie = currTrie[char] || (currTrie[char] = Object.create(null));
		}
		if (currTrie.ligature) {
			throw new Error('Attempted to add duplicate ligature for ' + JSON.stringify(ligature.key));
		}
		currTrie.ligature = ligature;
		this.#numLigatures++;
	}
	
	removeLigature(key) {
		let currTrie = this.#ligTrie;
		const visited = [];
		for (const char of key) {
			const newTrie = currTrie[char];
			if (!newTrie) return null;
			visited.push([currTrie, char]);
			currTrie = newTrie;
		}
		const removed = currTrie.ligature;
		if (!removed) return null;
		delete currTrie.ligature;
		while (visited.length > 0) {
			const [trie, char] = visited.pop();
			if (isObjectEmpty(trie[char])) {
				delete trie[char];
			}
		}
		this.#numLigatures--;
		return removed;
	}
	
	getNextLigature(text) {
		let currTrie = this.#ligTrie;
		let result = null;
		for (const char of text) {
			currTrie = currTrie[char];
			if (!currTrie) break;
			if (currTrie.ligature) {
				result = currTrie.ligature;
			}
		}
		return result;
	}
	
	get numLigatures() {
		return this.#numLigatures;
	}
	
	*iterLigatures() {
		const toIterate = [this.#ligTrie];
		while (toIterate.length > 0) {
			const trie = toIterate.pop();
			for (const key in trie) {
				if (key === 'ligature') {
					yield trie.ligature;
				} else {
					toIterate.push(trie[key]);
				}
			}
		}
	}
	
	drawText(ctx, text, startX, startY) {
		let x = startX;
		let y = startY;
		while (text) {
			if (text[0] === '\n') {
				y += this.#lineHeight;
				x = startX;
				text = text.substr(1);
				continue;
			}
			const lig = this.getNextLigature(text);
			if (!lig) {
				console.error('Missing ligature: ' + JSON.stringify(text[0]));
				text = text.substr(1);
				continue;
			}
			text = text.substr(lig.key.length);
			const glyphIndex = (Math.random() * lig.glyphs.length)|0;
			const {xOffset, image} = lig.glyphs[glyphIndex];
			if (image) {
				ctx.drawImage(image,
					x + xOffset,
					y - image.height + this.#baseline);
			}
			x += lig.advance;
		}
	}
}

window.ScribbleFont = Font;
