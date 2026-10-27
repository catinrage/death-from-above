import { describe, expect, it } from 'vitest';
import { mat, MeshBuilder, triangulate, type P2 } from './mesh-builder';

const red = mat(0xff0000);

function normals(data: Float32Array): number[][] {
	const out: number[][] = [];
	for (let i = 0; i < data.length; i += 12) out.push([data[i + 3], data[i + 4], data[i + 5]]);
	return out;
}

describe('MeshBuilder', () => {
	it('builds a box as 12 triangles with unit normals and linear colour', () => {
		const data = new MeshBuilder().box(1, 2, 3, red).build();
		expect(data.length).toBe(36 * 12);
		for (const n of normals(data)) expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 5);
		expect(data[6]).toBeCloseTo(1);
		expect(data[7]).toBeCloseTo(0);
	});

	it('keeps smooth sphere normals pointing outward, even when mirrored', () => {
		const data = new MeshBuilder().scale(-1, 1, 1).sphere(2, 12, 8, red).build();
		let outward = 0,
			total = 0;
		for (let i = 0; i < data.length; i += 12) {
			const d = data[i] * data[i + 3] + data[i + 1] * data[i + 4] + data[i + 2] * data[i + 5];
			total++;
			if (d > 0) outward++;
		}
		expect(outward / total).toBeGreaterThan(0.99);
	});

	it('winds smooth triangles counter-clockwise when seen from outside', () => {
		const data = new MeshBuilder()
			.lathe(
				[
					[1, 0],
					[1, 2]
				],
				8,
				red,
				{ axis: 'y' }
			)
			.build();
		for (let i = 0; i < data.length; i += 36) {
			const a = [data[i], data[i + 1], data[i + 2]];
			const b = [data[i + 12], data[i + 13], data[i + 14]];
			const c = [data[i + 24], data[i + 25], data[i + 26]];
			const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
			const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
			const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
			const centroid = [(a[0] + b[0] + c[0]) / 3, 0, (a[2] + b[2] + c[2]) / 3];
			expect(n[0] * centroid[0] + n[2] * centroid[2]).toBeGreaterThan(0);
		}
	});

	it('restores transforms with push/pop', () => {
		const b = new MeshBuilder();
		b.push().translate(10, 0, 0).pop();
		const data = b.box(1, 1, 1, red).build();
		let maxX = -Infinity;
		for (let i = 0; i < data.length; i += 12) maxX = Math.max(maxX, data[i]);
		expect(maxX).toBeCloseTo(0.5);
	});
});

describe('triangulate', () => {
	it('splits a concave L-shape into n-2 triangles covering its area', () => {
		const poly: P2[] = [
			[0, 0],
			[3, 0],
			[3, 1],
			[1, 1],
			[1, 3],
			[0, 3]
		];
		const tris = triangulate(poly);
		expect(tris.length).toBe((poly.length - 2) * 3);
		let area = 0;
		for (let i = 0; i < tris.length; i += 3) {
			const [a, b, c] = [poly[tris[i]], poly[tris[i + 1]], poly[tris[i + 2]]];
			area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
		}
		expect(area).toBeCloseTo(5);
	});

	it('accepts clockwise input', () => {
		const square: P2[] = [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		];
		expect(triangulate(square).length).toBe(6);
	});
});
