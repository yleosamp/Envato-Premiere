"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const core = require("../core.js"), zip = require("../vendor/fflate.min.js");

// Contract simulation of a default case-insensitive APFS volume. This does not
// claim that Adobe/macOS was controlled or natively tested on this machine.
function archiveFixture(entries, caseInsensitive = false, truncate = false) {
  const files = new Map(), writes = [];
  const key = value => caseInsensitive ? value.toLocaleLowerCase("en-US") : value;
  const sourcePath = "/Users/Editor/Downloads/sfx.zip";
  files.set(key(sourcePath), zip.zipSync(entries));
  const io = {
    async lstat(file) {
      if (!files.has(key(file))) throw Error("ENOENT");
      return { size: files.get(key(file)).byteLength, isFile() { return true; } };
    },
    async mkdir(directory) { files.set(key(directory), new Uint8Array()); },
    async readFile(file) { return files.get(key(file)); },
    async writeFile(file, data) { writes.push(file); const bytes = new Uint8Array(data); files.set(key(file), truncate ? bytes.subarray(0, Math.max(0, bytes.length - 1)) : bytes); }
  };
  const context = {
    window: { path: path.posix }, localStorage: { getItem() { return null; } },
    console, Uint8Array, ArrayBuffer, Date, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
    require(id) {
      if (id === "uxp") return { entrypoints: { setup() {} }, storage: { localFileSystem: {}, domains: {} } };
      if (id === "fs") return io;
      if (id === "os") return { homedir() { return "/Users/Editor"; } };
      if (id === "premierepro") return {};
      if (id === "./core.js") return core;
      if (id === "./updates.js") return require("../updates.js");
      if (id === "./manifest.json") return require("../manifest.json");
      if (id === "./vendor/fflate.min.js") return zip;
      throw Error("Unexpected module: " + id);
    }
  };
  const source = fs.readFileSync(path.join(__dirname, "../main.js"), "utf8")
    .replace(/\}\)\(\);\s*$/, "globalThis.review = { extractZip };})();");
  vm.runInNewContext(source, context);
  return { extract: () => context.review.extractZip(sourcePath, "/Volumes/Audio/Envato Audio"), files, writes, key };
}

test("review: default APFS case-folding cannot overwrite different audio variations", async () => {
  const f = archiveFixture({ "Kick.wav": new Uint8Array([1]), "kick.wav": new Uint8Array([2]) }, true);
  const result = await f.extract();
  assert.equal(result.filePaths.length, 2);
  assert.equal(new Set(result.filePaths.map(f.key)).size, 2);
  assert.deepEqual(Array.from(result.filePaths, file => Array.from(f.files.get(f.key(file)))), [[1], [2]]);
  assert.equal(new Set(f.writes.map(f.key)).size, f.writes.length);
});

test("review: flattened and prefixed duplicate filenames cannot replace earlier ZIP entries", async () => {
  const f = archiveFixture({ "3 - x.wav": new Uint8Array([1]), "x.wav": new Uint8Array([2]), "./x.wav": new Uint8Array([3]) });
  const result = await f.extract();
  assert.equal(new Set(result.filePaths).size, 3);
  assert.deepEqual(Array.from(result.filePaths, file => Array.from(f.files.get(file))), [[1], [2], [3]]);
  assert.equal(new Set(f.writes).size, f.writes.length);
});

test("review: failed audio readback does not report a successful extracted package", async () => {
  // Existing extraction verifies the size returned by the file provider after
  // every write. Exercise a provider that silently truncates the bytes.
  const f = archiveFixture({ "hit.wav": new Uint8Array([1,2,3]) }, false, true);
  await assert.rejects(f.extract(), /gravação.*incompleta/);
});
