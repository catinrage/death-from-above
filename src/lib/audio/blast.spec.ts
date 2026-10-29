import { describe, expect, it } from 'vitest';
import { outdoorImpulse, renderBlast } from './blast';

const SR = 24000;

/** Share of a signal's energy below `hz`, through a gentle two-pole low-pass. */
function lowShare(x: Float32Array, hz: number): number {
	const a = 1 - Math.exp((-2 * Math.PI * hz) / SR);
	let y1 = 0,
		y2 = 0,
		low = 0,
		all = 0;
	for (const v of x) {
		y1 += a * (v - y1);
		y2 += a * (y1 - y2);
		low += y2 * y2;
		all += v * v;
	}
	return low / all;
}

/** Time for the signal's short-term level to fall 40 dB below its peak. */
function ringTime(x: Float32Array): number {
	const win = Math.round(SR * 0.02);
	let peak = 0,
		last = 0;
	for (let i = 0; i + win <= x.length; i += win) {
		let e = 0;
		for (let k = i; k < i + win; k++) e += x[k] * x[k];
		if (e > peak) peak = e;
		if (e > peak * 1e-4) last = i;
	}
	return last / SR;
}

function correlation(a: Float32Array, b: Float32Array, from: number): number {
	let ab = 0,
		aa = 0,
		bb = 0;
	for (let i = from; i < a.length; i++) {
		ab += a[i] * b[i];
		aa += a[i] * a[i];
		bb += b[i] * b[i];
	}
	return ab / Math.sqrt(aa * bb);
}

describe('rendered blast', () => {
	const shell = renderBlast({ power: 0.4, air: false, seed: 1 });
	const bomb = renderBlast({ power: 1, air: false, seed: 1 });
	const huge = renderBlast({ power: 4, air: false, seed: 1 });
	const flak = renderBlast({ power: 0.4, air: true, seed: 1 });

	it('is clean audio: finite and never clipping', () => {
		for (const b of [shell, bomb, huge, flak])
			for (const ch of [...b.body, ...b.near]) {
				let peak = 0;
				for (const v of ch) peak = Math.max(peak, Math.abs(v));
				expect(ch.every(Number.isFinite)).toBe(true);
				expect(peak).toBeLessThanOrEqual(0.96);
				expect(peak).toBeGreaterThan(0.5);
			}
	});

	it('is a deep boom, not a clang: the energy sits low, with little treble', () => {
		for (const b of [shell, bomb, huge]) {
			expect(lowShare(b.body[0], 400)).toBeGreaterThan(0.5);
			expect(lowShare(b.body[0], 2000)).toBeGreaterThan(0.85);
		}
		// An airburst is sharper, but still not mostly treble.
		expect(lowShare(flak.body[0], 2000)).toBeGreaterThan(0.65);
	});

	it('rolls on longer and lower the bigger the blast', () => {
		expect(ringTime(bomb.body[0])).toBeGreaterThan(ringTime(shell.body[0]));
		expect(ringTime(huge.body[0])).toBeGreaterThan(ringTime(bomb.body[0]));
		expect(ringTime(huge.body[0])).toBeGreaterThan(3);
		expect(lowShare(huge.body[0], 150)).toBeGreaterThan(lowShare(shell.body[0], 150));
	});

	it('fills both ears differently once the thump has passed', () => {
		const from = Math.round(SR * 0.4);
		expect(correlation(bomb.body[0], bomb.body[1], from)).toBeLessThan(0.8);
	});

	it('only throws debris from ground blasts', () => {
		expect(bomb.near[0].length).toBeGreaterThan(flak.near[0].length * 2);
	});

	it('repeats exactly for the same seed and differs for another', () => {
		const again = renderBlast({ power: 1, air: false, seed: 1 });
		const other = renderBlast({ power: 1, air: false, seed: 2 });
		expect(again.body[0]).toEqual(bomb.body[0]);
		expect(other.body[0]).not.toEqual(bomb.body[0]);
	});
});

describe('outdoor reverb', () => {
	it('loses its highs long before its lows, so the tail never rings', () => {
		const [l] = outdoorImpulse(SR, 3);
		const early = l.subarray(Math.round(SR * 0.05), Math.round(SR * 0.3));
		const late = l.subarray(Math.round(SR * 1), Math.round(SR * 2));
		expect(lowShare(late, 500)).toBeGreaterThan(lowShare(early, 500) + 0.3);
	});
});
