import { MeshBuilder, type Material } from '../engine/mesh-builder';
import { Noise } from '../engine/noise';
import { Rng } from '../engine/rng';
import { P } from './palette';

export function pine(seed: number): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(seed);
	b.cylinder(0.24, 0.17, 2.4, 6, P.bark);
	const tiers = [
		[2.5, 4.0, 1.4],
		[2.0, 3.5, 3.3],
		[1.4, 3.0, 5.1],
		[0.8, 2.2, 6.7]
	];
	tiers.forEach(([r, h, y], i) => {
		b.push().translate(rng.range(-0.1, 0.1), y, rng.range(-0.1, 0.1)).rotateY(rng.range(0, 6));
		b.cylinder(r * rng.range(0.9, 1.1), 0, h, 7, i % 2 ? P.pineDark : P.pine);
		b.pop();
	});
	return b.build();
}

export function broadleaf(seed: number, leaf: Material = P.leaf): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(seed);
	b.cylinder(0.32, 0.22, 3.4, 6, P.bark);
	b.push().translate(0, 2.6, 0).rotateZ(0.7).cylinder(0.12, 0.08, 1.6, 5, P.bark).pop();
	const blobs = [
		[0, 4.6, 0, 2.5],
		[1.3, 4.0, 0.6, 1.8],
		[-1.2, 4.1, -0.5, 1.9],
		[0.2, 5.9, -0.2, 1.7],
		[-0.4, 4.8, 1.2, 1.5]
	];
	blobs.forEach(([x, y, z, r], i) => {
		b.push().translate(x, y, z).scale(1, 0.85, 1);
		b.blob(r * rng.range(0.9, 1.1), 7, 5, leaf, 0.22, seed * 7 + i);
		b.pop();
	});
	return b.build();
}

export function deadTree(seed: number): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(seed);
	b.cylinder(0.26, 0.12, 5.5, 6, P.deadWood);
	for (let i = 0; i < 4; i++) {
		b.push()
			.translate(0, 2.2 + i * 0.8, 0)
			.rotateY(rng.range(0, 6.28))
			.rotateZ(rng.range(0.6, 1.1));
		b.cylinder(0.09, 0.03, rng.range(1.2, 2.2), 4, P.deadWood);
		b.pop();
	}
	return b.build();
}

export function bush(seed: number, leaf: Material = P.leaf): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(seed);
	for (let i = 0; i < 3; i++) {
		b.push().translate(rng.range(-0.8, 0.8), 0.5, rng.range(-0.6, 0.6)).scale(1.2, 0.8, 1.1);
		b.blob(rng.range(0.7, 1.1), 6, 4, leaf, 0.3, seed * 3 + i);
		b.pop();
	}
	return b.build();
}

export function rock(seed: number): Float32Array {
	const b = new MeshBuilder();
	b.push().translate(0, 0.3, 0).scale(1.4, 0.75, 1.1);
	b.blob(1, 7, 5, seed % 2 ? P.rock : P.rockDark, 0.32, seed);
	b.pop();
	return b.build();
}

export function grassTuft(seed: number): Float32Array {
	const b = new MeshBuilder();
	const rng = new Rng(seed);
	for (let i = 0; i < 9; i++) {
		const x = rng.range(-0.45, 0.45),
			z = rng.range(-0.45, 0.45);
		const h = rng.range(0.45, 1.0);
		const lx = rng.range(-0.25, 0.25),
			lz = rng.range(-0.25, 0.25);
		const a = rng.range(0, Math.PI);
		const wx = Math.cos(a) * 0.06,
			wz = Math.sin(a) * 0.06;
		b.tri(
			[x - wx, 0, z - wz],
			[x + wx, 0, z + wz],
			[x + lx, h, z + lz],
			i % 3 ? P.grass : P.grassGreen
		);
	}
	return b.build();
}

export function telegraphPole(): Float32Array {
	const b = new MeshBuilder();
	b.cylinder(0.13, 0.1, 8.5, 6, P.wood);
	b.box(0.14, 0.14, 2.0, P.wood, 0, 7.9, 0);
	for (const z of [-0.8, 0, 0.8]) b.box(0.1, 0.18, 0.1, P.paint, 0, 8.05, z);
	return b.build();
}

export function fence(): Float32Array {
	const b = new MeshBuilder();
	for (const x of [-3, 0, 3]) b.box(0.14, 1.3, 0.14, P.wood, x, 0.65, 0);
	b.box(6.2, 0.1, 0.06, P.wood, 0, 1.0, 0);
	b.box(6.2, 0.1, 0.06, P.wood, 0, 0.55, 0);
	return b.build();
}

export interface MountainLayerSpec {
	z: number;
	depth: number;
	minX: number;
	maxX: number;
	step: number;
	height: number;
	base: number;
	seed: number;
	snowLine: number;
	color: Material;
}

/**
 * A low-poly mountain ridge as a strip of terrain several rows deep, with a
 * skirt that drops below the horizon so no gaps show behind it.
 */
export function mountainLayer(spec: MountainLayerSpec): Float32Array {
	const b = new MeshBuilder();
	const noise = new Noise(spec.seed);
	const rows = 5;
	const cols = Math.ceil((spec.maxX - spec.minX) / spec.step);
	const H = (x: number, r: number): number => {
		const across = Math.sin((r / (rows - 1)) * Math.PI) * 0.8 + 0.2;
		const ridge = noise.ridge2(x * 0.0016, r * 0.35 + spec.seed);
		const swell = noise.fbm1(x * 0.0007, 3) * 0.5 + 0.5;
		return spec.base + (ridge * 0.75 + swell * 0.45) * spec.height * across;
	};
	const pt = (c: number, r: number): [number, number, number] => {
		const x = spec.minX + c * spec.step;
		return [x, H(x, r), spec.z - (r / (rows - 1)) * spec.depth];
	};
	for (let c = 0; c < cols; c++) {
		for (let r = 0; r < rows - 1; r++) {
			const a = pt(c, r),
				bb = pt(c + 1, r),
				cc = pt(c, r + 1),
				d = pt(c + 1, r + 1);
			const avg = (a[1] + bb[1] + cc[1] + d[1]) / 4;
			const m = avg > spec.snowLine ? P.snow : spec.color;
			b.tri(a, bb, cc, m);
			b.tri(bb, d, cc, m);
		}
		const a = pt(c, 0),
			bb = pt(c + 1, 0);
		b.quad(
			a,
			bb,
			[bb[0], spec.base - 260, bb[2] + 30],
			[a[0], spec.base - 260, a[2] + 30],
			spec.color
		);
	}
	return b.build();
}
