/** Helicopters keep at least this far apart. */
export const HELO_GAP = 34;

interface Spot {
	x: number;
	y: number;
}

/**
 * Push (metres) that moves `self` out of the way of every other hovering
 * aircraft closer than `gap`, more the closer it is. Two exactly on top of
 * each other split by `rank` (any number unique to each), so they never stay stacked.
 */
export function spread<T extends Spot>(
	self: T,
	others: Iterable<T>,
	rank: (s: T) => number,
	gap = HELO_GAP
): [number, number] {
	let px = 0,
		py = 0;
	for (const o of others) {
		if (o === self) continue;
		const dx = self.x - o.x,
			dy = self.y - o.y;
		const d = Math.hypot(dx, dy);
		if (d >= gap) continue;
		const push = gap - d;
		if (d < 0.01) {
			// Stacked exactly: split along the road, one each way.
			px += rank(self) > rank(o) ? push : -push;
			continue;
		}
		px += (dx / d) * push;
		py += (dy / d) * push;
	}
	return [px, py];
}
