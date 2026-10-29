"use strict";

// Development-only packager: the distributed plugin never needs Node or npm.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const zip = require("../vendor/fflate.min.js");

const RUNTIME = Object.freeze([
  "manifest.json", "index.html", "main.js", "core.js", "styles.css", "updates.js", "LICENSE",
  "vendor/fflate.min.js", "vendor/FFLATE-LICENSE.txt"
]);
const SOURCE_REQUIRED = Object.freeze(["README.md", "package.json", "THIRD_PARTY_NOTICES.md", "INSTALAR.command", "INSTALAR.bat", "tools/build.cjs"]);
const SOURCE_OPTIONAL = Object.freeze([".gitignore", ".gitattributes", "CHANGELOG.md", ".github/workflows/ci.yml"]);
const MODES = Object.freeze({ directory: 0o40755, regular: 0o100644, executable: 0o100755 });
const FIXED_DATE = new Date("2020-01-01T00:00:00.000Z");
const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");

function sourceBytes(root, relative) {
  if (!/^[a-zA-Z0-9_.\-/]+$/.test(relative) || relative.split("/").some(part => part === ".." || !part)) throw new Error("Unsafe source entry: " + relative);
  const file = path.resolve(root, ...relative.split("/"));
  if (!file.startsWith(root + path.sep) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) throw new Error("Source must be a regular file inside the plugin folder: " + relative);
  const content = fs.readFileSync(file);
  // Finder/Terminal cannot run a CRLF shell shebang. Normalize only the launcher.
  return relative.endsWith(".command") ? Buffer.from(content.toString("utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n")) : content;
}

function immediateFiles(root, folder, allowed) {
  const directory = path.join(root, folder);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).filter(entry => entry.isFile() && allowed.test(entry.name))
    .map(entry => folder + "/" + entry.name).sort();
}

function makeArchive(entries, prefix) {
  if (!prefix.endsWith("/") || !/^[A-Za-z0-9_.-]+\/$/.test(prefix)) throw new Error("Unsafe archive prefix");
  const files = Object.create(null), directories = new Set([prefix]);
  for (const [relative, data] of Object.entries(entries)) {
    if (relative.includes("\\") || relative.startsWith("/") || relative.split("/").some(part => part === ".." || !part)) throw new Error("Unsafe archive entry: " + relative);
    const parts = (prefix + relative).split("/");
    for (let i = 1; i < parts.length; i++) directories.add(parts.slice(0, i).join("/") + "/");
    const mode = relative.endsWith(".command") ? MODES.executable : MODES.regular;
    files[prefix + relative] = [new Uint8Array(data), { os: 3, attrs: ((mode << 16) | 0x20) >>> 0, mtime: FIXED_DATE }];
  }
  for (const directory of directories) files[directory] = [new Uint8Array(0), { os: 3, attrs: ((MODES.directory << 16) | 0x10) >>> 0, mtime: FIXED_DATE }];
  const archive = zip.zipSync(files, { level: 0 });
  verifyArchive(archive, entries, prefix);
  return Buffer.from(archive);
}

function verifyArchive(archive, entries, prefix) {
  const data = Buffer.from(archive), unpacked = zip.unzipSync(new Uint8Array(data));
  if (!(prefix in unpacked)) throw new Error("Missing explicit archive bundle directory");
  for (const [name, expected] of Object.entries(entries)) {
    if (!unpacked[prefix + name] || sha256(unpacked[prefix + name]) !== sha256(expected)) throw new Error("Archive readback mismatch: " + name);
  }
  // Check the central-directory flags too: Windows-generated ZIP defaults can
  // lose executable .command permissions and make CCX installation fail on Mac.
  const end = data.length - 22;
  if (end < 0 || data.readUInt32LE(end) !== 0x06054b50) throw new Error("Invalid ZIP end record");
  const count = data.readUInt16LE(end + 10);
  let cursor = data.readUInt32LE(end + 16), found = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || data.readUInt32LE(cursor) !== 0x02014b50 || data[cursor + 5] !== 3) throw new Error("ZIP entry must use Unix origin attributes");
    const nameLength = data.readUInt16LE(cursor + 28), extraLength = data.readUInt16LE(cursor + 30), commentLength = data.readUInt16LE(cursor + 32);
    const name = data.subarray(cursor + 46, cursor + 46 + nameLength).toString("utf8");
    const mode = data.readUInt32LE(cursor + 38) >>> 16;
    const expectedMode = name.endsWith("/") ? MODES.directory : name.endsWith(".command") ? MODES.executable : MODES.regular;
    if (mode !== expectedMode) throw new Error("Wrong Unix permissions for archive entry: " + name);
    if (!name.endsWith("/")) found++;
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor !== end || found !== Object.keys(entries).length) throw new Error("Unexpected ZIP entries");
  return true;
}

function build(options = {}) {
  const root = path.resolve(options.root || path.join(__dirname, ".."));
  const dist = path.resolve(options.dist || path.join(root, "..", "dist"));
  const manifest = JSON.parse(sourceBytes(root, "manifest.json").toString("utf8"));
  if (manifest.id !== "com.leoda.envato-audio-bridge" || !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version)) throw new Error("The existing Envato plugin identity and a valid version must be preserved");
  if (!manifest.entrypoints || !manifest.entrypoints.some(entry => entry.id === "envatoAudioPanel")) throw new Error("The existing panel identity must be preserved");
  const base = "Envato-Audio-Bridge-" + manifest.version;
  const names = { ccx: base + ".ccx", install: base + "-Instalar.zip", source: base + "-codigo.zip", hashes: base + "-SHA256SUMS.txt" };
  for (const name of Object.values(names)) if (fs.existsSync(path.join(dist, name)) && !options.force) throw new Error("Generated artifact already exists: " + name + ". Use --force to rebuild.");
  const runtimeFiles = RUNTIME.concat(immediateFiles(root, "icons", /\.svg$/i));
  if (!runtimeFiles.some(file => file.startsWith("icons/"))) throw new Error("Plugin icons are missing");
  const sourceFiles = runtimeFiles.concat(SOURCE_REQUIRED, SOURCE_OPTIONAL.filter(file => fs.existsSync(path.join(root, file))), immediateFiles(root, "tests", /\.(?:c?js|json)$/i));
  const runtimeEntries = Object.fromEntries(runtimeFiles.map(file => [file, sourceBytes(root, file)]));
  const ccx = makeArchive(runtimeEntries, manifest.id + "/");
  const installerEntries = {
    [names.ccx]: ccx,
    "INSTALAR.command": sourceBytes(root, "INSTALAR.command"),
    "INSTALAR.bat": sourceBytes(root, "INSTALAR.bat"),
    "README.md": sourceBytes(root, "README.md"),
    "LICENSE": sourceBytes(root, "LICENSE"),
    "THIRD_PARTY_NOTICES.md": sourceBytes(root, "THIRD_PARTY_NOTICES.md")
  };
  const buffers = {
    [names.ccx]: ccx,
    [names.install]: makeArchive(installerEntries, base + "/"),
    [names.source]: makeArchive(Object.fromEntries(sourceFiles.map(file => [file, sourceBytes(root, file)])), "Envato-Premiere/")
  };
  buffers[names.hashes] = Buffer.from(Object.entries(buffers).map(([name, bytes]) => sha256(bytes) + "  " + name).join("\n") + "\n");
  fs.mkdirSync(dist, { recursive: true });
  for (const [name, content] of Object.entries(buffers)) {
    const target = path.join(dist, name);
    fs.writeFileSync(target, content, { flag: options.force ? "w" : "wx" });
    if (sha256(fs.readFileSync(target)) !== sha256(content)) throw new Error("Artifact disk verification failed: " + name);
  }
  return Object.keys(buffers).map(name => ({ file: path.join(dist, name), bytes: buffers[name].length, sha256: sha256(buffers[name]) }));
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.some(arg => arg !== "--force")) throw new Error("Usage: node tools/build.cjs [--force] (run checks and tests first)");
  for (const artifact of build({ force: args.includes("--force") })) console.log(JSON.stringify(artifact));
}
module.exports = { build, makeArchive, verifyArchive, RUNTIME, sha256 };
