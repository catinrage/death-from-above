// Generates the cockpit voice callouts with ElevenLabs into static/audio/voice/.
// Usage: ELEVENLABS_API_KEY=... pnpm voice   (optionally ELEVENLABS_VOICE_ID=...)
// The key is read from the environment only; never commit it.
import { mkdir, writeFile } from 'node:fs/promises';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) {
	console.error('Set ELEVENLABS_API_KEY to generate voice lines.');
	process.exit(1);
}
const voice = process.env.ELEVENLABS_VOICE_ID ?? '21m00Tcm4TlvDq8ikWAM';
// Keep in sync with ALERTS in src/lib/audio/cockpit.ts.
const LINES = {
	'pull-up': 'Pull up. Pull up.',
	missile: 'Missile. Missile.',
	fire: 'Engine fire. Engine fire.',
	stall: 'Stall. Stall.',
	lock: 'Warning. Locked on.',
	damage: 'Warning. Damage critical.',
	altitude: 'Altitude. Altitude.',
	ceiling: 'Altitude ceiling.',
	boundary: 'Warning. Leaving combat area.',
	overheat: 'Guns overheat.',
	winchester: 'Winchester.'
};

const dir = new URL('../static/audio/voice/', import.meta.url);
await mkdir(dir, { recursive: true });
let failed = 0;
for (const [file, text] of Object.entries(LINES)) {
	const res = await fetch(
		`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`,
		{
			method: 'POST',
			headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text,
				model_id: 'eleven_multilingual_v2',
				voice_settings: {
					stability: 0.85,
					similarity_boost: 0.75,
					style: 0,
					use_speaker_boost: true
				}
			})
		}
	);
	if (!res.ok) {
		failed++;
		console.error(`${file}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
		continue;
	}
	await writeFile(new URL(`${file}.mp3`, dir), Buffer.from(await res.arrayBuffer()));
	console.log(`${file}.mp3  "${text}"`);
}
process.exit(failed > 0 ? 1 : 0);
