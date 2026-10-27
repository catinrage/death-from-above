import type { Mesh } from '../engine/gl/mesh';
import type { Renderer } from '../engine/renderer';
import { mat } from '../engine/mesh-builder';
import { WORLD } from '../game/constants';
import { P } from './palette';
import * as air from './aircraft';
import * as veh from './vehicles';
import * as inf from './infantry';
import * as st from './structures';
import * as nat from './nature';
import * as ord from './ordnance';
import * as br from './bridge';
import * as real from './aircraft-real';
import * as sp from './ordnance-special';

/** City blocks, shared by the building and its lit-window mesh so the panes line up. */
const BLOCKS = {
	block0: { w: 12, d: 10, floors: 5, wall: P.brick, seed: 1 },
	block1: { w: 10, d: 10, floors: 8, wall: P.plaster, seed: 2 },
	block2: { w: 14, d: 14, floors: 14, wall: P.plaster, glass: true, seed: 3 },
	block3: { w: 14, d: 9, floors: 2, wall: P.plaster, seed: 4 }
} satisfies Record<string, st.BlockSpec>;

/** Builders for every instanced mesh. The boolean marks shadow casters. */
const BUILDERS = {
	kestrel: [air.kestrel, true],
	wraith: [air.wraith, true],
	grizzly: [air.grizzly, true],
	albatross: [air.albatross, true],
	a10: [real.a10, true],
	f16: [real.f16, true],
	su25: [real.su25, true],
	f4: [real.f4, true],
	b1: [real.b1, true],
	propeller: [() => air.propeller(2.1), true],
	enemyFighter: [air.enemyFighter, true],
	heliBody: [air.helicopterBody, true],
	heliRotor: [air.helicopterRotor, true],
	heliTailRotor: [air.helicopterTailRotor, false],

	wheel: [() => veh.wheel(0.5, 0.36), true],
	wheelSmall: [() => veh.wheel(0.4, 0.28), true],
	wheelBig: [() => veh.wheel(0.58, 0.42), true],
	tankHull: [veh.tankHull, true],
	tankTurret: [veh.tankTurret, true],
	tankBarrel: [veh.tankBarrel, true],
	spaagHull: [veh.spaagHull, true],
	spaagTurret: [veh.spaagTurret, true],
	spaagGuns: [veh.spaagGuns, true],
	radarDish: [() => veh.radarDish(1), true],
	radarDishBig: [() => veh.radarDish(2.6), true],
	samChassis: [veh.samChassis, true],
	samRack: [veh.samRack, true],
	truck: [veh.truck, true],
	engineerTruck: [veh.engineerTruck, true],
	jeepBody: [veh.jeepBody, true],
	jeepGun: [veh.jeepGun, true],
	apcHull: [veh.apcHull, true],
	apcTurret: [veh.apcTurret, true],
	apcGun: [veh.apcGun, true],
	artilleryCarriage: [veh.artilleryCarriage, true],
	artilleryBarrel: [veh.artilleryBarrel, true],

	soldierBody: [() => inf.soldierBody(false), true],
	soldierBodyAA: [() => inf.soldierBody(true), true],
	soldierLeg: [inf.soldierLeg, true],
	soldierArm: [inf.soldierArm, true],

	bunker: [st.bunker, true],
	flakBase: [st.flakBase, true],
	flakMount: [st.flakMount, true],
	flakBarrel: [st.flakBarrel, true],
	searchlightBase: [st.searchlightBase, true],
	searchlightLamp: [st.searchlightLamp, true],
	radarStation: [st.radarStation, true],
	fuelDepot: [st.fuelDepot, true],
	house: [() => st.house(P.wall, P.roof), true],
	houseWhite: [() => st.house(P.wallWhite, P.roofGrey, 7, 5.5, 3.4), true],
	houseLights: [() => st.houseLights(), false],
	houseWhiteLights: [() => st.houseLights(7, 5.5), false],
	ruin: [st.ruin, true],
	block0: [() => st.block(BLOCKS.block0), true],
	block1: [() => st.block(BLOCKS.block1), true],
	block2: [() => st.block(BLOCKS.block2), true],
	block3: [() => st.block(BLOCKS.block3), true],
	block0Lights: [() => st.blockLights(BLOCKS.block0), false],
	block1Lights: [() => st.blockLights(BLOCKS.block1), false],
	block2Lights: [() => st.blockLights(BLOCKS.block2), false],
	block3Lights: [() => st.blockLights(BLOCKS.block3), false],
	rubble: [() => st.rubble(5), true],
	runway: [() => st.runway(411, 24), false],
	hangar: [st.hangar, true],
	hangarGlow: [st.hangarGlow, false],
	tower: [st.controlTower, true],
	towerGlow: [st.controlTowerGlow, false],
	fuelTankSmall: [st.fuelTankSmall, true],
	windsock: [st.windsock, true],
	flagpole: [st.flagpole, true],
	sandbagWall: [() => st.sandbagWall(8), true],
	tankTrap: [st.tankTrap, true],
	crates: [st.crateStack, true],
	bridgeSpan: [() => br.bridgeSpan(30), true],
	bridgePier: [br.bridgePier, true],
	bridgeAbutment: [br.bridgeAbutment, true],
	bridgeDeckHalf: [br.bridgeDeckHalf, true],
	bridgeTrussHalf: [br.bridgeTrussHalf, true],
	pontoonSection: [br.pontoonSection, true],
	pontoonTrestle: [br.pontoonTrestle, true],
	pontoonBoat: [br.pontoonBoat, true],

	pine0: [() => nat.pine(1), true],
	pine1: [() => nat.pine(2), true],
	pine2: [() => nat.pine(3), true],
	broad0: [() => nat.broadleaf(4), true],
	broad1: [() => nat.broadleaf(5, P.leafDry), true],
	broad2: [() => nat.broadleaf(6), true],
	deadTree: [() => nat.deadTree(7), true],
	snowPine0: [() => nat.pine(1, true), true],
	snowPine1: [() => nat.pine(2, true), true],
	snowPine2: [() => nat.pine(3, true), true],
	cactus0: [() => nat.cactus(21), true],
	cactus1: [() => nat.cactus(22), true],
	palm0: [() => nat.palm(23), true],
	palm1: [() => nat.palm(24), true],
	jungle0: [() => nat.jungleTree(25), true],
	jungle1: [() => nat.jungleTree(26), true],
	fern: [() => nat.fern(27), false],
	bush0: [() => nat.bush(8), true],
	bush1: [() => nat.bush(9, P.leafDry), true],
	rock0: [() => nat.rock(10), true],
	rock1: [() => nat.rock(11), true],
	rock2: [() => nat.rock(12), true],
	grass0: [() => nat.grassTuft(13), false],
	grass1: [() => nat.grassTuft(14), false],
	grass2: [() => nat.grassTuft(15), false],
	pole: [nat.telegraphPole, true],
	fence: [nat.fence, true],

	bombGP: [ord.bombGP, true],
	bombCluster: [ord.bombCluster, true],
	bombNapalm: [ord.bombNapalm, true],
	bombPenetrator: [ord.bombPenetrator, true],
	bombGuided: [ord.bombGuided, true],
	bombThunder: [ord.bombThunder, true],
	bomblet: [ord.bomblet, true],
	bombNuke: [sp.bombNuke, true],
	bombChem: [sp.bombChem, true],
	bombEmp: [sp.bombEmp, true],
	cruiseMissile: [sp.cruiseMissile, true],
	warhead: [sp.ballisticWarhead, true],
	parachute: [sp.parachute, true],
	missile: [ord.missile, true],
	rocket: [ord.rocket, true],
	chunk0: [() => ord.debrisChunk(1), true],
	chunk1: [() => ord.debrisChunk(2), true],
	chunk2: [() => ord.debrisChunk(3), true],
	plate: [ord.debrisPlate, true],
	beam: [ord.debrisBeam, true]
} as const satisfies Record<string, readonly [() => Float32Array, boolean]>;

export type MeshName = keyof typeof BUILDERS;
export type Models = Record<MeshName, Mesh> & { beamCone: Mesh; mountains: Mesh[] };

export function createModels(r: Renderer): Models {
	const out = {} as Record<MeshName, Mesh>;
	for (const [name, [build, shadow]] of Object.entries(BUILDERS) as [
		MeshName,
		readonly [() => Float32Array, boolean]
	][]) {
		out[name] = r.createMesh(name, build(), shadow);
	}
	const beamCone = r.createBeamMesh('beamCone', ord.beamCone());
	const layers = [
		{
			z: -480,
			depth: 120,
			height: 80,
			base: 8,
			step: 22,
			seed: 31,
			snowLine: 999,
			color: mat(0x353a2c, 0.95)
		},
		{
			z: -850,
			depth: 200,
			height: 200,
			base: 0,
			step: 34,
			seed: 32,
			snowLine: 999,
			color: mat(0x34363a, 0.95)
		},
		{
			z: -1500,
			depth: 300,
			height: 400,
			base: -20,
			step: 48,
			seed: 33,
			snowLine: 330,
			color: mat(0x3e3f48, 0.95)
		},
		{
			z: -2600,
			depth: 500,
			height: 740,
			base: -40,
			step: 70,
			seed: 34,
			snowLine: 500,
			color: mat(0x4a4a56, 0.95)
		}
	];
	const mountains = layers.map((l, i) => {
		// Reach past the terrain by as much as a wide screen widens out at this depth.
		const spill = (Math.abs(l.z) + l.depth) * 0.9;
		const data = nat.mountainLayer({
			...l,
			minX: WORLD.terrainMinX - spill,
			maxX: WORLD.terrainMaxX + spill
		});
		return r.createMesh(`mountain${i}`, data, false);
	});
	return { ...out, beamCone, mountains };
}
