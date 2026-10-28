<p align="center"><img src="assets/brand/logo.png" alt="Death From Above logo" width="240" /></p>

# Death From Above

A side-view 3D bomber over a two-army war. Your army and the enemy's both send troops up the same
road; theirs is much bigger. You fly the strike aircraft that has to make up the difference: break
their columns, help your troops take the checkpoints along the road, and get them to the enemy HQ,
which only ground troops can bring down. Dodge flak, tracers and SAMs while you do it.

Everything you see is rendered by a custom WebGL2 engine written for this project — no three.js,
no textures or audio files. Models are generated from code, sounds are synthesised in WebAudio.

## Run it

```bash
pnpm install
pnpm dev
```

Open the printed URL in a recent Chrome, Edge, Firefox or Safari (WebGL 2 required). A GPU is
strongly recommended; quality presets (LOW / MEDIUM / HIGH) are on the title screen.

## Controls

| Action                            | Keyboard / mouse                        | Gamepad     |
| --------------------------------- | --------------------------------------- | ----------- |
| Steer toward a direction          | `W A S D` or arrow keys                 | Left stick  |
| Machine guns                      | `J`, `Z` or left mouse                  | RT          |
| Drop bomb (hold to keep dropping) | `Space`, `K`, `X` or right mouse        | A           |
| Guided missiles                   | `E`, `U` or middle mouse                | Y           |
| Aim missiles and guided bombs     | Mouse reticle                           | Right stick |
| Focus (slow motion)               | `R` or `I`                              | LT          |
| Select ordnance (your rack)       | `1`–`9`, cycle with `Q` / `Tab` / wheel | LB / RB     |
| Flares                            | `F`, `L` or `C`                         | B           |
| Afterburner                       | `Shift`                                 | X           |
| Airbrake (wheel brakes on ground) | `V`                                     | View        |
| Landing gear up / down            | `B`                                     | R3          |
| Wingman: attack my target         | `T`                                     | D-pad right |
| Wingman: cover me                 | `G`                                     | D-pad up    |
| Wingman: hit the SAMs             | `H`                                     | D-pad down  |
| Wingman: return to base and rearm | `Y`                                     | D-pad left  |
| Pause                             | `Esc` or `P`                            | Start       |

**Every sortie starts on the runway**, wheels down and brakes on. Steer or boost to release the
brakes and roll; once past take-off speed (about 1.1 × stall) pull up to lift off, then press `B`
to raise the gear: it drags. To land, lower the gear (it takes a couple of seconds) and touch down
level on the runway; touching down with the wheels up is a belly landing and loses the aircraft. A
"too low, gear" callout warns you on a wheels-up approach. On the ground, `V` works the wheel brakes.
Helicopters and the gunship start in the air.

Steering is directional: press the way you want to fly. Asking for the opposite heading loops you
over the top. Fly low and slow over your runway to rearm specials, missiles and repair; land to
repair damaged systems. Stray out of the combat area and the aircraft turns itself back; stay out
for long and the armour slowly suffers. The dotted arc is your bomb sight, and the camera widens to keep its landing point in
view.

**Focus** slows the world to a quarter speed while a meter drains (kills made outside focus
refill it). Sweep the
reticle across enemies to paint up to six locks, then fire missiles — one per target. Outside focus,
missiles and guided bombs go to whatever is under the reticle; a guided bomb released onto empty
ground follows the reticle as you move it. Without a mouse, targets are picked for you.

**Flares take timing.** A missile's seeker locks the brightest heat source in its narrow view, and
can only tell a flare from your aircraft once it is within about 450 m. A flare decoys it only if it
sits between the missile and you, so drop them as the missile closes from behind. Flares fired too
early burn out, and the seeker picks you up again. Head-on shots and radar-guided SAMs are much
harder to fool, and your afterburner makes you a brighter target.

**Your wingman** (callsign Two) flies an F-16 with you in campaign and endless sorties, taking off
once you are airborne. It starts on the attack, picking its own targets: bandits coming after you first, then the most dangerous
thing on the ground nearby. Press `T` to send it after your target (your first lock, whatever is
under the reticle, or the best target ahead), `H` to have it hunt the air defences (SAM sites and
radars first, then AA guns), `G` to call it back to cover you, and `Y` to send it home: it makes a
low, slow pass along the runway to repair and refill its missiles, then rejoins the attack by
itself. Enemies shoot at whichever of you is closer and its kills count toward your score. If it is
shot down you hear its mayday, and it stays down for the rest of the wave; a replacement climbs out
from the airfield as the next wave starts.

**Local co-op.** Pick **2P** in the Sortie menu (campaign or endless) to fly with a friend on one
screen. Player one keeps the keyboard and mouse (and a second gamepad, if one is plugged in); player
two flies a second aircraft from the gamepad, with a green beacon and a P2 tag, in place of the AI wingman. The camera frames
both, enemies go after whichever aircraft is closer, and the two of you share one score and a pool of
six aircraft. Player two's missiles pick the best target ahead of the nose, and either pilot can
trigger focus. The sortie ends when both are down with no aircraft left.

**The tactical nuke** comes back once per wave. The airfield and supply pickups never restock it,
and losing your aircraft doesn't hand you a fresh one.

## What's in it

- **Hangar** — nine aircraft: Kestrel, Wraith, Grizzly and Albatross, plus the A-10C Warthog, F-16C
  Viper, Su-25 Frogfoot, F-4E Phantom II and B-1B Lancer. Each has its own handling, boost effect
  (afterburner, rocket bottles, stealth plasma or water-injection smoke) and weapons it can mount;
  trade payload points between them in the loadout editor. Choices are saved per aircraft.
- **Credits and upgrades** — campaign missions (more for later missions and for stars you haven't
  earned before) and endless runs (score and waves held) pay credits. Spend them in the hangar to
  buy aircraft (the Kestrel and Grizzly are free) and to upgrade each airframe's armour, engine,
  payload racks, flares, guns and missile rails, three levels each.
- **Ordnance** — GP bombs that regenerate, cluster bombs, napalm, a bunker buster, a laser-guided
  bomb, chemical canisters (drifting gas that kills infantry), an EMP airburst (stalls vehicles,
  drops helicopters, blinds missiles), terrain-hugging cruise missiles, a ballistic missile that
  climbs out of sight and comes down at Mach 6, paratroopers who land and fight, the Thunderclap,
  the tactical nuke, and guided air-to-ground missiles fired in salvos.
- **The war** — your reinforcements (riflemen and specialists, jeeps, light and battle tanks,
  APCs, AA carriers and rocket artillery) set off every 30 seconds from the furthest checkpoint you hold that isn't under attack,
  or from the airfield. They creep in under fire, stand and fight at short range, and take damage
  from your bombs like anything else. Enemy waves are bigger, keep rolling in whether or not you
  wipe the last one out, and form up at the enemy's foremost checkpoint.
- **Checkpoints** — four flags along the road (Crossroads, Farmstead, the Bridgehead past the river
  and the Outpost). Troops standing on one alone raise their flag; both armies on it is a stalemate.
  Units stop on a checkpoint their side doesn't hold until they take it. Each checkpoint the enemy
  holds swells its waves; each one you take pays 300 points and lets your troops form up further
  forward. The strip under the airfield bar shows who holds what.
- **The enemy HQ** — a compound at the far end of the road, ringed by pillboxes and flak. Air
  strikes don't touch it: your troops have to reach the wire and shell it down. Its strength bar is
  on the front-line strip. Aircraft can't damage your airfield either; only enemy ground troops can.
- **The river** — the road crosses a river on a steel truss bridge, and the railway on a viaduct
  beside it. Both armies need the crossings, so they are built to take anything you drop on them.
- **No-fire zones** — a field hospital and a village sit on the road between the airfield and the
  front, marked by red boards at each edge. Their people stroll between the houses and run indoors
  when bombs fall nearby. Killing a civilian costs 150 points, knocking down a home there costs 100,
  and flattening the hospital costs 600; each also breaks your kill chain. Napalm and gas don't care
  who is standing in them, and a house that comes down takes its sheltering family with it. The bomb
  sight warns you when it is over a no-fire zone, and enemy emplacements never dig in there.
- **Troop types** — both armies field the same specialists: snipers who pick off soldiers from
  beyond rifle range, anti-tank troopers whose rockets go for armour first, mortar teams and rocket
  artillery that stop well short of a fight and lob rounds onto it (ours hold fire when our own
  troops are on the target), medics who patch up the soldiers around them, and fast, thin-skinned
  light tanks. The enemy brings them in from wave 2, rocket artillery from wave 5.
- **Enemies** — riflemen and missile troopers (ragdolls), gun jeeps, supply trucks (drop extra
  ordnance), tanks (turrets pop off), troop carriers (unload infantry), AA gun carriers, SAM
  launchers with radar lock, howitzers, flak batteries, pillboxes, radar stations, fuel depots
  (chain reactions), searchlights at night, interceptors that dogfight you and gunships that rocket
  your ground forces (no aircraft can hurt the airfield itself).
- **Bosses** — each campaign act ends with one, and endless mode sends one every fifth wave, with
  its own health bar:
  - **Behemoth**: a super-heavy tank twice a battle tank's length, with a long main gun and a rear
    AA turret that tracks aircraft. It takes a stack of bombs or a few bunker busters.
  - **River cruiser**: steams up the river and anchors across it just below the bridge, then fills
    the sky with twin flak mounts, a close-in gun and radar SAM pairs. It can't be hit until it
    drops anchor, and sinks onto the river bed when it dies.
  - **Railway gun**: coupled between a locomotive and a flak wagon, it runs down the railway, pulls
    up across the river and lobs heavy shells onto the airfield. Tear up the track ahead of it to
    hold it out of range; it fires from wherever it stops once the airfield is in reach.
- **Three ways to play** — pick one from the Sortie menu:
  - **Training**: fourteen guided lessons, each with its own practice targets, covering take-off, steering,
    guns, bombs, ordnance selection, guided missiles, focus, flares, afterburner and airbrake, and
    rearming. You can't be shot down for good, and Enter skips a lesson.
  - **Campaign**: nine missions that get harder as you go, each ending at a stronger enemy HQ and
    most with goals of their own on the way (ambush the convoy at the bridge, kill the tanks, hold
    three checkpoints at once, silence the flak, hunt the SAM sites, clear the sky).
    Iron Column ends with the Behemoth, Wild Weasel with the river cruiser and the final mission
    with the railway gun.
    Winning one unlocks the next and earns up to three stars (win, airfield above 70%, no aircraft
    lost). Progress and best scores are saved in the browser.
  - **Endless**: front after front. Each time your troops level the HQ (3,000 points times the
    front) the enemy digs in a stronger one, while its waves keep growing and more aircraft join
    past wave eleven; your five best runs are kept on a local leaderboard. The sky moves from golden hour through sunset, dusk and night to dawn.
- **Physics** — lift/drag/stall flight model, ballistic and guided ordnance, a rigid-body solver for
  wreckage tumbling across deformable terrain, craters and scorch marks that cool from glowing
  embers to charcoal.

## Rendering pipeline

`src/lib/engine/renderer.ts` drives every frame:

1. Shadow map (2048², texel-snapped orthographic sun frustum, 3×3 hardware PCF).
2. HDR scene pass (RGBA16F): instanced PBR-style meshes (GGX specular, hemisphere ambient,
   camera-side fill, rim light, up to 32 dynamic point lights), procedural terrain shading with a
   dirt road, height fog with sun in-scattering, and a procedural sky (gradient, sun disk, cumulus,
   horizon strata, stars, distant artillery flashes).
3. Transparents: additive searchlight cones and ~16k CPU-simulated particles (depth-sorted,
   premultiplied, soft against scene depth, lit by sun and fire light).
4. Post: 6-level bloom, radial god rays, screen-space shockwave distortion, chromatic aberration,
   ACES tonemapping, grading, vignette, grain and FXAA.

## Project layout

```
src/lib/engine/   WebGL2 engine: math, GL wrappers, mesh builder, particles, lights, shaders
src/lib/models/   Procedural meshes (aircraft, vehicles, infantry, structures, nature, ordnance)
src/lib/game/     Simulation: flight, weapons, AI, waves, terrain, debris, effects, game loop
src/lib/audio/    Synthesised sound effects, engine loops, cockpit voice and radio chatter
src/lib/ui/       Svelte HUD, title / hangar, pause, game-over, controls
src/routes/       App shell; /sandbox renders a static showcase scene for engine work
```

`simulateWorld()` in `src/lib/game/simulate.ts` advances the whole battle without touching the GPU
or DOM, which is what the integration tests drive. Hot loops mutate preallocated state on purpose
to keep garbage collection out of the frame budget.

`static/audio/` when they exist; there is no synthetic speech fallback, so a call without a clip stays silent (cockpit alerts still sound their tone). To record
`static/audio/` when they exist and fall back to the browser's speech voice otherwise. To record
them, run `ELEVENLABS_API_KEY=... pnpm voice` (add `radio` or `cockpit` for one set, `--force` to
redo existing clips); radio lines live in `src/lib/audio/radio-lines.json`.

## Tests

```bash
pnpm test:unit -- --run   # vitest: engine + simulation (82 tests)
pnpm test:coverage        # same, with v8 coverage and an 80% threshold
pnpm test:e2e             # Playwright: builds, serves on :4319 and plays a sortie
pnpm check                # svelte-check / TypeScript
pnpm lint                 # prettier + eslint
```

Open `/?debug` to expose the running game as `window.__dfa` (handy for poking at state from the
console, and used by the browser tests).
