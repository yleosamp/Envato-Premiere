(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.EnvatoAudioCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var AUDIO_EXTENSIONS = [".wav", ".mp3", ".aif", ".aiff", ".m4a", ".flac", ".ogg"];

  function extensionOf(fileName) {
    var lower = String(fileName || "").toLowerCase();
    var index = lower.lastIndexOf(".");
    return index >= 0 ? lower.slice(index) : "";
  }

  function isAudioFile(fileName) {
    return AUDIO_EXTENSIONS.indexOf(extensionOf(fileName)) >= 0;
  }

  function isSupportedDownload(fileName) {
    return extensionOf(fileName) === ".zip" || isAudioFile(fileName);
  }

  function baseName(fileName) {
    var name = String(fileName || "download").replace(/\\/g, "/");
    name = name.slice(name.lastIndexOf("/") + 1);
    var dot = name.lastIndexOf(".");
    return dot > 0 ? name.slice(0, dot) : name;
  }

  function sanitizeName(name, fallback) {
    var cleaned = String(name || "")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
    return cleaned || fallback || "arquivo";
  }

  function flattenedAudioName(archivePath) {
    var normalized = String(archivePath || "").replace(/\\/g, "/");
    var parts = normalized.split("/").filter(function (part) {
      return part && part !== "." && part !== ".." && part !== "__MACOSX";
    });
    var joined = parts.join(" - ");
    return sanitizeName(joined, "audio");
  }

  function packageDisplayName(fileName) {
    var name = baseName(fileName)
      .replace(/-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-utc(?: \(\d+\))?$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    name = name.replace(/\b\w/g, function (letter) {
      return letter.toUpperCase();
    });
    return sanitizeName(name, "Envato Audio");
  }

  function fingerprint(name, stats) {
    var modified = 0;
    if (stats) {
      if (typeof stats.mtimeMs === "number") {
        modified = stats.mtimeMs;
      } else if (stats.mtime && typeof stats.mtime.getTime === "function") {
        modified = stats.mtime.getTime();
      }
    }
    return String(name) + "|" + String(stats && stats.size || 0) + "|" + String(modified);
  }

  function audioEntriesFromArchive(entries) {
    return Object.keys(entries || {}).filter(function (entryName) {
      return isAudioFile(entryName) && !/(^|[\\/])(?:__MACOSX(?:[\\/]|$)|\._)/.test(entryName);
    });
  }

  function nativeDownloadsPath(savedPath, home, path) {
    var value = String(savedPath || "");
    var mac = String(home).charAt(0) === "/";
    var compatible = mac ? /^\/(?!\/)/.test(value) : /^(?:[a-z]:[\\/]|\\\\)/i.test(value);
    return compatible && !/[\u0000-\u001f]/.test(value) ? value : path.join(home,"Downloads");
  }

  function archiveAudioFilter(maxBytes, maxEntries) {
    var total = 0, count = 0;
    return function (entry) {
      if (!audioEntriesFromArchive(Object.fromEntries([[entry.name,true]])).length) return false;
      total += entry.originalSize; count++;
      if (!Number.isSafeInteger(entry.originalSize) || entry.originalSize <= 0 || total > maxBytes || count > maxEntries)
        throw new Error("O ZIP tem áudio demais para extrair com segurança (limite: 256 MB / 1000 arquivos). Use um pacote menor.");
      return true;
    };
  }

  return {
    AUDIO_EXTENSIONS: AUDIO_EXTENSIONS.slice(),
    extensionOf: extensionOf,
    isAudioFile: isAudioFile,
    isSupportedDownload: isSupportedDownload,
    baseName: baseName,
    sanitizeName: sanitizeName,
    flattenedAudioName: flattenedAudioName,
    packageDisplayName: packageDisplayName,
    fingerprint: fingerprint,
    audioEntriesFromArchive: audioEntriesFromArchive
    ,nativeDownloadsPath: nativeDownloadsPath
    ,archiveAudioFilter: archiveAudioFilter
  };
});
