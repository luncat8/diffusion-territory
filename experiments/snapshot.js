// owns: offline PNG render of the field — visual check without a browser
// edit for: scenarios, frame counts, output paths

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const load = require('./load');

const sim = load();
const { Settings, Field, Source, Pressure, Tick, FP } = sim;

const CRC = new Int32Array(256);
for (let n = 0; n < 256; n++) {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	CRC[n] = c;
}

function crc32(buf) {
	let c = -1;
	for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
}

function chunk(type, data) {
	const head = Buffer.alloc(8);
	head.writeUInt32BE(data.length, 0);
	head.write(type, 4, 'ascii');
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, 'ascii'), data])), 0);
	return Buffer.concat([head, data, crc]);
}

function encode(w, h, rgba) {
	const stride = w * 4;
	const raw = Buffer.alloc((stride + 1) * h);
	for (let y = 0; y < h; y++) {
		raw[y * (stride + 1)] = 0;
		Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1);
	}
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 6;
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

function clamp(v) {
	return v > 255 ? 255 : v > 0 ? v : 0;
}

function render(scale) {
	const w = Field.w * scale;
	const h = Field.h * scale;
	const out = new Uint8Array(w * h * 4);
	for (let y = 0; y < Field.h; y++) {
		for (let x = 0; x < Field.w; x++) {
			const j = (y * Field.w + x) * 3;
			const r = clamp(Field.v[j] >> FP);
			const g = clamp(Field.v[j + 1] >> FP);
			const b = clamp(Field.v[j + 2] >> FP);
			for (let sy = 0; sy < scale; sy++) {
				for (let sx = 0; sx < scale; sx++) {
					const p = ((y * scale + sy) * w + x * scale + sx) * 4;
					out[p] = r;
					out[p + 1] = g;
					out[p + 2] = b;
					out[p + 3] = 255;
				}
			}
		}
	}
	return { w, h, out };
}

function scenario(name, frames, over, seeds) {
	Field.init(128, 128);
	Pressure.init(128, 128);
	Object.assign(Settings, {
		diffusion: 100, brownian: 20, depletion: 0, reaction: 0, sourceRate: 16,
		capBase: 0, capTerritory: 100, blockForeign: 1, foreignRate: 0,
		substeps: 1, pressure: 0,
	}, over);
	for (const [x, y, p] of seeds) Source.seed(x, y, p);
	for (let f = 0; f < frames; f++) Tick.run(Settings);
	const { w, h, out } = render(4);
	const file = path.join(__dirname, '..', 'out', name + '.png');
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, encode(w, h, out));
	console.log(`snapshot=${name} frames=${frames} file=${path.relative(path.join(__dirname, '..'), file)}`);
}

const seeds = [[64, 64, 0], [20, 100, 1], [107, 20, 2]];
scenario('frame0', 0, {}, seeds);
scenario('frame300', 300, {}, seeds);
scenario('frame3000', 3000, {}, seeds);
scenario('depletion1', 3000, { depletion: 1 }, seeds);
scenario('cap60', 3000, { capBase: 60 }, seeds);
scenario('pressure', 600, { pressure: 5 }, seeds);
scenario('reaction', 3000, { reaction: 20, blockForeign: 0, foreignRate: 50 }, seeds);
