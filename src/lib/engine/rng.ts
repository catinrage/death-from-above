/** Small seeded PRNG (mulberry32) so worlds and tests are reproducible. */
export class Rng {
	private state: number;

	constructor(seed = 1) {
		this.state = seed >>> 0 || 1;
	}

	next(): number {
		let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	range(min: number, max: number): number {
		return min + (max - min) * this.next();
	}

	int(min: number, maxInclusive: number): number {
		return Math.floor(this.range(min, maxInclusive + 1));
	}

	chance(p: number): boolean {
		return this.next() < p;
	}

	sign(): number {
		return this.next() < 0.5 ? -1 : 1;
	}

	pick<T>(items: readonly T[]): T {
		return items[Math.floor(this.next() * items.length)];
	}

	/** Approximately normal distribution with mean 0 and the given deviation. */
	gauss(dev = 1): number {
		return (this.next() + this.next() + this.next() - 1.5) * 1.1547 * dev;
	}
}

/** Shared non-deterministic generator for cosmetic effects. */
export const fx = new Rng((Math.random() * 2 ** 31) | 0);
