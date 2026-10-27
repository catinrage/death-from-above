// Generates the cockpit voice callouts and the radio chatter with ElevenLabs
// into static/audio/voice/ and static/audio/radio/.
// Usage: ELEVENLABS_API_KEY=... pnpm voice [cockpit|radio] [--force]
//   cockpit / radio  only that set (default: both)
//   --force          regenerate clips that already exist (default: skip them)
// Voices: ELEVENLABS_VOICE_ID (cockpit), ELEVENLABS_TOWER_VOICE_ID, ELEVENLABS_WINGMAN_VOICE_ID.
// The key is read from the environment only; never commit it.
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
	console.error('Set ELEVENLABS_API_KEY to generate voice lines.');
	process.exit(1);
}
const args = process.argv.slice(2);
const force = args.includes('--force');
const only = args.find((a) => a === 'cockpit' || a === 'radio');

// Keep in sync with ALERTS in src/lib/audio/cockpit.ts.
const COCKPIT = {
	'pull-up': 'Pull up. Pull up.',
	missile: 'Missile. Missile.',
	fire: 'Engine fire. Engine fire.',
	stall: 'Stall. Stall.',
	lock: 'Warning. Locked on.',
	'too-low-gear': 'Too low. Gear.',
	damage: 'Warning. Damage critical.',
	altitude: 'Altitude. Altitude.',
	ceiling: 'Altitude ceiling.',
	boundary: 'Warning. Leaving combat area.',
	overheat: 'Guns overheat.',
	winchester: 'Winchester.'
};

// Radio lines are shared with the game (src/lib/audio/radio.ts reads the same file).
const radioFile = new URL('../src/lib/audio/radio-lines.json', import.meta.url);
const radio = JSON.parse(await readFile(radioFile, 'utf8'));
const radioVoice = {
	tower: process.env.ELEVENLABS_TOWER_VOICE_ID ?? radio.voices.tower,
	wingman: process.env.ELEVENLABS_WINGMAN_VOICE_ID ?? radio.voices.wingman
};

/** Calm, steady warning voice; looser, more urgent delivery on the radio. */
const STEADY = { stability: 0.85, similarity_boost: 0.75, style: 0, use_speaker_boost: true };
const RADIO_STYLE = {
	stability: 0.45,
	similarity_boost: 0.8,
	style: 0.35,
	use_speaker_boost: true
};

const jobs = [];
if (only !== 'radio')
	for (const [file, text] of Object.entries(COCKPIT))
		jobs.push({
			dir: 'voice',
			file,
			text,
			voice: process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM',
			settings: STEADY
		});
if (only !== 'cockpit')
	for (const cue of Object.values(radio.cues))
		for (const [file, text] of cue.lines)
			jobs.push({
				dir: 'radio',
				file,
				text,
				voice: radioVoice[cue.speaker],
				settings: RADIO_STYLE
			});

let failed = 0;
for (const job of jobs) {
	const dir = new URL(`../static/audio/${job.dir}/`, import.meta.url);
	await mkdir(dir, { recursive: true });
	const out = new URL(`${job.file}.mp3`, dir);
	if (!force && (await exists(out))) continue;
	const res = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${job.voice}?output_format=mp3_44100_128`,
		{
			method: 'POST',
			headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text: job.text,
				model_id: 'eleven_multilingual_v2',
				voice_settings: job.settings
			})
		}
	);
	if (!res.ok) {
		failed++;
		console.error(`${job.dir}/${job.file}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
		continue;
	}
	await writeFile(out, Buffer.from(await res.arrayBuffer()));
	console.log(`${job.dir}/${job.file}.mp3  "${job.text}"`);
}

// The game only fetches clips listed as recorded, so a missing one never 404s.
const recorded = [];
for (const cue of Object.values(radio.cues))
	for (const [file] of cue.lines)
		if (await exists(new URL(`../static/audio/radio/${file}.mp3`, import.meta.url)))
			recorded.push(file);
radio.recorded = recorded;
await writeFile(radioFile, JSON.stringify(radio, null, '\t') + '\n');
console.log(`${recorded.length} radio clips recorded.`);
process.exit(failed > 0 ? 1 : 0);

async function exists(url) {
	try {
		await access(url);
		return true;
	} catch {
		return false;
	}
}
