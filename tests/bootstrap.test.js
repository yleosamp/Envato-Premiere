const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

let registeredEntrypoints = null;
const uxpMock = {
  entrypoints: {
    setup(value) {
      registeredEntrypoints = value;
    }
  },
  storage: {
    localFileSystem: {},
    domains: {}
  }
};

const source = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const context = {
  window: {path},
  localStorage: {
    getItem() { return null; },
    setItem() {}
  },
  require(id) {
    if (id === "uxp") return uxpMock;
    if (id === "fs") return {};
    if (id === "os") return {homedir() { return "C:\\Users\\tester"; }};
    if (id === "premierepro") return {};
    if (id === "./core.js") return require(path.join(__dirname, "..", "core.js"));
    if (id === "./updates.js") return require("../updates.js");
    if (id === "./manifest.json") return require("../manifest.json");
    if (id === "./vendor/fflate.min.js") {
      return require(path.join(__dirname, "..", "vendor", "fflate.min.js"));
    }
    throw new Error("Unexpected module: " + id);
  },
  console,
  setInterval,
  clearInterval,
  Uint8Array,
  ArrayBuffer,
  Date,
  Promise
};

vm.runInNewContext(source, context, {filename: "main.js"});
assert.ok(registeredEntrypoints);
assert.ok(registeredEntrypoints.panels.envatoAudioPanel);
assert.strictEqual(
  typeof registeredEntrypoints.panels.envatoAudioPanel.show,
  "function"
);

console.log("bootstrap.test.js: OK");
