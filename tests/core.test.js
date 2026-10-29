const assert = require("assert");
const core = require("../core.js");

assert.strictEqual(core.isAudioFile("music.WAV"), true);
assert.strictEqual(core.isAudioFile("license.txt"), false);
assert.strictEqual(core.isSupportedDownload("sound-pack.zip"), true);
assert.strictEqual(core.baseName("C:\\Downloads\\sound-pack.zip"), "sound-pack");
assert.strictEqual(
  core.packageDisplayName("getting-freaky-2026-05-07-04-13-49-utc (1).zip"),
  "Getting Freaky"
);
assert.strictEqual(core.packageDisplayName("cinematic_impacts.zip"), "Cinematic Impacts");
assert.strictEqual(
  core.flattenedAudioName("WAV/Impacts/Hit 01.wav"),
  "WAV - Impacts - Hit 01.wav"
);
assert.deepStrictEqual(
  core.audioEntriesFromArchive({
    "WAV/Hit.wav": new Uint8Array([1]),
    "MP3/Hit.mp3": new Uint8Array([2]),
    "license.txt": new Uint8Array([3]),
    "__MACOSX/._Hit.wav": new Uint8Array([4])
  }),
  ["WAV/Hit.wav", "MP3/Hit.mp3"]
);

console.log("core.test.js: OK");
