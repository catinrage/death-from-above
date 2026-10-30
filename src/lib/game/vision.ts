import { WORLD } from './constants';
import { AIRCRAFT } from './defs-aircraft';
import type { AircraftId, Unit, UnitKind } from './types';
import type { Side } from './war';
import type { World } from './world';

/**
 * Fog of war (optional, command mode). Everything carries sensors with a
 * reach against aircraft and against the ground, and a signature: how much
 * of that reach it shows up at. A side knows about an enemy while any of its
 * sensors is close enough (sensor reach × the target's signature), and keeps
 * knowing for a moment after losing it. What a side doesn't know about it
 * can't pick as a target, and the player doesn't see it at all. So better
 * radar wins fights: a Raptor's radar finds a Flanker well before the
 * Flanker's finds the stealthy Raptor, and a radar truck behind the line
 * lets every gun on it shoot at what it shows them.
 */

/** A sensor: where it is and how far it sees aircraft and ground units (m, against signature 1). */
export interface Sensor {
	x: number;
	y: number;
	air: number;
	ground: number;
}

/** Seconds between sweeps, and how long a lost contact is still known. */
const SWEEP = 0.25;
const MEMORY = 2.5;

/** Sensor reach of ground units, [air, ground]. Anything unlisted uses its category's. */
const UNIT_SENSORS: Partial<Record<UnitKind, readonly [number, number]>> = {
	sniper: [400, 560],
	manpads: [900, 320],
	jeep: [400, 620],
	ifv: [420, 520],
	spaag: [1100, 420],
	sam: [1800, 420],
	flak: [950, 320],
	radar: [2600, 1400],
	radarTruck: [2300, 1250],
	searchlight: [800, 320],
	artillery: [250, 360],
	rocketTruck: [250, 360],
	superTank: [420, 520],
	cruiser: [1500, 520]
};
const INFANTRY_SENSOR: readonly [number, number] = [350, 330];
const VEHICLE_SENSOR: readonly [number, number] = [380, 440];

/** Aircraft radar, [air, ground]: the newer and the better equipped, the further. */
const AIRCRAFT_SENSORS: Partial<Record<AircraftId, readonly [number, number]>> = {
	f22: [1900, 900],
	f35: [1750, 1300],
	wraith: [1550, 900],
	su27: [1300, 700],
	f16: [1150, 700],
	su24: [800, 950],
	f4: [950, 550],
	kestrel: [900, 800],
	a10: [600, 900],
	su25: [600, 820],
	grizzly: [700, 820],
	stuka: [420, 620],
	a1: [420, 620],
	apache: [700, 1050],
	mq9: [700, 1650],
	ac130: [650, 1250],
	albatross: [700, 800],
	b1: [1000, 950],
	tu95: [800, 700]
};
/** Their wave aircraft that fly as no particular airframe. */
const STOCK_SENSOR: readonly [number, number] = [950, 650];

/** Both airfields and HQs keep a radar going: the sky over home is always watched. */
const BASE_SENSOR: readonly [number, number] = [1500, 520];

/** How visible ground units are: troops hide well, big things don't. */
const UNIT_SIGNATURE: Partial<Record<UnitKind, number>> = {
	sniper: 0.4,
	bunker: 0.7,
	superTank: 1.4,
	cruiser: 1.6,
	railGun: 1.6,
	locomotive: 1.4
};
const INFANTRY_SIGNATURE = 0.55;
/** Helicopters hug the ground. */
const HELO_SIGNATURE = 0.7;

export function unitSensor(kind: UnitKind, infantry: boolean): readonly [number, number] {
	return UNIT_SENSORS[kind] ?? (infantry ? INFANTRY_SENSOR : VEHICLE_SENSOR);
}

export function aircraftSensor(id: AircraftId | null): readonly [number, number] {
	return (id && AIRCRAFT_SENSORS[id]) ?? STOCK_SENSOR;
}

/** An airframe's signature: the stealthier (harder to lock), the smaller. */
export function aircraftSignature(id: AircraftId | null): number {
	return id ? Math.min(1.3, 1 / AIRCRAFT[id].stealth) : 1;
}

export function unitSignature(u: Unit): number {
	return UNIT_SIGNATURE[u.def.kind] ?? (u.def.category === 'infantry' ? INFANTRY_SIGNATURE : 1);
}

/** Something that can be spotted: where it is, whether it flies, and how visible it is. */
interface Contact {
	key: object;
	x: number;
	y: number;
	air: boolean;
	signature: number;
}

export class Vision {
	/** Off: everyone knows about everything, as without fog of war. */
	enabled = false;
	private readonly known: Record<Side, Map<object, number>> = {
		player: new Map(),
		enemy: new Map()
	};
	private clock = 0;
	private time = 0;

	reset(enabled: boolean): void {
		this.enabled = enabled;
		this.known.player.clear();
		this.known.enemy.clear();
		this.clock = 0;
		this.time = 0;
	}

	/** Whether `side` knows about `target` right now (always, with fog of war off). */
	seen(side: Side, target: object): boolean {
		if (!this.enabled) return true;
		return (this.known[side].get(target) ?? -Infinity) >= this.time;
	}

	update(w: World, dt: number): void {
		if (!this.enabled) return;
		this.time += dt;
		this.clock -= dt;
		if (this.clock > 0) return;
		this.clock = SWEEP;
		this.sweep('player', sensors(w, 'player'), contacts(w, 'enemy'));
		this.sweep('enemy', sensors(w, 'enemy'), contacts(w, 'player'));
	}

	private sweep(side: Side, eyes: readonly Sensor[], targets: readonly Contact[]): void {
		const known = this.known[side];
		for (const t of targets) {
			for (const s of eyes) {
				const reach = (t.air ? s.air : s.ground) * t.signature;
				const dx = t.x - s.x,
					dy = t.y - s.y;
				if (dx * dx + dy * dy > reach * reach) continue;
				known.set(t.key, this.time + MEMORY);
				break;
			}
		}
		// Forget contacts long gone, so the map doesn't grow all game.
		for (const [k, until] of known) if (until < this.time - MEMORY) known.delete(k);
	}
}

/** Every sensor `side` has: its ground units, aircraft, and the radar at home. */
export function sensors(w: World, side: Side): Sensor[] {
	const out: Sensor[] = [];
	const ours = side === 'player';
	const ground = (u: Unit): void => {
		if (!u.alive) return;
		const [air, gnd] = unitSensor(u.def.kind, u.def.category === 'infantry');
		out.push({ x: u.x, y: u.y + u.def.half[1] * 2, air, ground: gnd });
	};
	for (const u of ours ? w.allies.list : w.units) ground(u);
	if (ours) {
		for (const t of w.troops.list) ground(t);
		for (const e of w.escorts) {
			if (!e.active) continue;
			const [air, gnd] = aircraftSensor(e.aircraft);
			out.push({ x: e.x, y: e.y, air, ground: gnd });
		}
		for (const p of w.pilots()) {
			if (!p.alive) continue;
			const [air, gnd] = aircraftSensor(p.def.id);
			out.push({ x: p.x, y: p.y, air, ground: gnd });
		}
	} else {
		for (const a of w.air) {
			if (!a.alive || a.dying) continue;
			const [air, gnd] = aircraftSensor(a.airframe);
			out.push({ x: a.x, y: a.y, air, ground: gnd });
		}
	}
	const [air, gnd] = BASE_SENSOR;
	const homes = ours
		? [(WORLD.baseMinX + WORLD.baseMaxX) / 2, (WORLD.ourHqMinX + WORLD.ourHqMaxX) / 2]
		: [(WORLD.enemyBaseMinX + WORLD.enemyBaseMaxX) / 2, (WORLD.hqMinX + WORLD.hqMaxX) / 2];
	for (const x of homes) out.push({ x, y: w.ground(x) + 12, air, ground: gnd });
	return out;
}

/** Everything of `side`'s the other side could spot. */
function contacts(w: World, side: Side): Contact[] {
	const out: Contact[] = [];
	const ground = (u: Unit): void => {
		if (!u.alive) return;
		out.push({ key: u, x: u.x, y: u.y + u.def.half[1], air: false, signature: unitSignature(u) });
	};
	const c = side === 'player' ? w.command : w.enemyCommand;
	if (side === 'player') {
		for (const u of w.allies.list) ground(u);
		for (const t of w.troops.list) ground(t);
		for (const e of w.escorts) {
			if (!e.active) continue;
			const signature = e.tactic === 'helo' ? HELO_SIGNATURE : aircraftSignature(e.aircraft);
			out.push({ key: e, x: e.x, y: e.y, air: true, signature });
		}
		for (const p of w.pilots())
			if (p.alive)
				out.push({ key: p, x: p.x, y: p.y, air: true, signature: aircraftSignature(p.def.id) });
	} else {
		for (const u of w.units) ground(u);
		for (const a of w.air) {
			if (!a.alive || a.dying) continue;
			const signature = a.kind === 'heli' ? HELO_SIGNATURE : aircraftSignature(a.airframe);
			out.push({ key: a, x: a.x, y: a.y, air: true, signature });
		}
	}
	// Paratroopers under their canopies, and the side's drones.
	for (const j of c.jumpers)
		out.push({ key: j.unit, x: j.unit.x, y: j.unit.y, air: true, signature: INFANTRY_SIGNATURE });
	for (const d of w.drones)
		if (d.side === side && d.alive) out.push({ key: d, x: d.x, y: d.y, air: true, signature: 0.5 });
	return out;
}
