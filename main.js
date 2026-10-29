(function () {
  "use strict";

  var uxp = require("uxp");
  var fs = require("fs");
  var os = require("os");
  var nodePath = window.path;
  var premiere = require("premierepro");
  var core = require("./core.js");
  var updates = require("./updates.js");
  var version = require("./manifest.json").version;
  var fflate = require("./vendor/fflate.min.js");
  var entrypoints = uxp.entrypoints;
  var localFileSystem = uxp.storage.localFileSystem;
  var domains = uxp.storage.domains;

  var URLS = {
    music: "https://elements.envato.com/royalty-free-music",
    sfx: "https://elements.envato.com/sound-effects"
  };

  var privateFolder = null, updateChecker = null;
  var MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
  async function dataFolder() {
    if (!privateFolder) privateFolder = await localFileSystem.getDataFolder();
    return privateFolder;
  }

  var state = {
    initialized: false,
    bound: false,
    monitorTimer: null,
    scanRunning: false,
    downloadDirectory: core.nativeDownloadsPath(localStorage.getItem("envatoAudio.downloadDirectory"),os.homedir(),nodePath),
    knownFiles: {},
    pendingFiles: {},
    queuedFiles: {},
    importChain: Promise.resolve(),
    currentUrl: URLS.music,
    activeCategory: "music",
    processingCount: 0,
    lastImportedFingerprint: localStorage.getItem("envatoAudio.lastImportedFingerprint") || ""
  };

  var ui = {};

  function errorDetails(error) {
    if (!error) {
      return "Erro desconhecido";
    }
    return error.stack || error.message || String(error);
  }

  async function diagnostic(stage, detail) {
    var line = new Date().toISOString() + " [" + stage + "] " + String(detail || "") + "\n";
    try {
      var folder = await dataFolder();
      var previous = "";
      try {
        previous = await (await folder.getEntry("diagnostics.log")).read();
      } catch (ignoreMissingLog) {}
      await (await folder.createFile("diagnostics.log",{overwrite:true})).write((previous+line).slice(-100000));
    } catch (ignoreLogError) {}
  }

  function setStatus(kind, text) {
    if (!ui.statusDot || !ui.statusText) {
      return;
    }
    ui.statusDot.className = "status-dot" + (kind ? " " + kind : "");
    ui.statusText.textContent = text;
  }

  function setActivity(text) {
    if (ui.activityText) {
      ui.activityText.textContent = text;
    }
  }

  function setActiveTab(tab) {
    ui.musicTab.classList.toggle("active", tab === "music");
    ui.sfxTab.classList.toggle("active", tab === "sfx");
  }

  function navigate(tab) {
    var url = URLS[tab];
    state.currentUrl = url;
    state.activeCategory = tab;
    setActiveTab(tab);
    ui.browserLoader.classList.remove("hidden");
    ui.envatoWebview.src = url;
  }

  async function chooseDownloadsDirectory() {
    var selected = await localFileSystem.getFolder({
      initialDomain: domains.userDownloads
    });
    if (!selected) {
      return;
    }
    state.downloadDirectory = selected.nativePath;
    localStorage.setItem("envatoAudio.downloadDirectory", state.downloadDirectory);
    ui.downloadsPath.value = state.downloadDirectory;
    await buildBaseline();
    startMonitor(); state.initialized = true;
    setStatus("ready", "Monitorando downloads");
    setActivity("Pasta de downloads atualizada.");
  }

  async function activeProjectInfo() {
    var project = await premiere.Project.getActiveProject();
    if (!project || !project.path) {
      return null;
    }
    var projectDirectory = nodePath.dirname(project.path);
    return {
      project: project,
      projectDirectory: projectDirectory,
      outputDirectory: nodePath.join(projectDirectory, "Envato Audio")
    };
  }

  async function refreshProjectLabel() {
    try {
      var info = await activeProjectInfo();
      if (!info) {
        ui.projectPath.textContent = "Salve um projeto para definir o destino.";
        setStatus("error", "Projeto ainda nao foi salvo");
        return;
      }
      ui.projectPath.textContent = "Destino: " + info.outputDirectory;
      ui.projectPath.title = info.outputDirectory;
      if (state.processingCount === 0) {
        setStatus("ready", "Monitorando downloads");
      }
    } catch (error) {
      setStatus("error", "Nao foi possivel ler o projeto");
      console.error(error);
    }
  }

  function statsFingerprint(fileName, stats) {
    return core.fingerprint(fileName, stats);
  }

  async function listSupportedFiles() {
    var names = await fs.readdir(state.downloadDirectory);
    var files = [];
    var i;
    for (i = 0; i < names.length; i += 1) {
      if (!core.isSupportedDownload(names[i])) {
        continue;
      }
      try {
        var fullPath = nodePath.join(state.downloadDirectory, names[i]);
        var stats = await fs.lstat(fullPath);
        if (stats.isFile()) {
          files.push({
            name: names[i],
            path: fullPath,
            stats: stats,
            fingerprint: statsFingerprint(names[i], stats),
            modifiedTime: typeof stats.mtimeMs === "number"
              ? stats.mtimeMs
              : (stats.mtime && typeof stats.mtime.getTime === "function" ? stats.mtime.getTime() : 0)
          });
        }
      } catch (ignoreFile) {}
    }
    return files;
  }

  async function buildBaseline() {
    state.knownFiles = {};
    state.pendingFiles = {};
    var files = await listSupportedFiles();
    files.forEach(function (file) {
      state.knownFiles[file.name] = file.fingerprint;
    });
    return files;
  }

  function enqueueImport(file) {
    var queueKey = file.fingerprint || file.path;
    if (state.queuedFiles[queueKey]) {
      return;
    }
    state.queuedFiles[queueKey] = true;

    state.importChain = state.importChain
      .then(function () {
        return processDownload(file.path, file.category || state.activeCategory);
      })
      .then(function () {
        if (file.fingerprint) {
          state.lastImportedFingerprint = file.fingerprint;
          localStorage.setItem("envatoAudio.lastImportedFingerprint", file.fingerprint);
        }
      })
      .catch(function (error) {
        console.error(error);
        setStatus("error", "Falha ao importar download");
        setActivity(error && error.message ? error.message : String(error));
        diagnostic("IMPORT ERROR " + nodePath.basename(file.path || "arquivo"), errorDetails(error));
      })
      .then(function () {
        delete state.queuedFiles[queueKey];
      });
  }

  async function retryLatestDownload() {
    try {
      var files = await listSupportedFiles();
      files.sort(function (a, b) {
        return b.modifiedTime - a.modifiedTime;
      });
      if (!files.length) {
        throw new Error("Nenhum ZIP ou audio foi encontrado na pasta Downloads.");
      }
      files[0].category = state.activeCategory;
      setActivity("Tentando novamente: " + files[0].name);
      enqueueImport(files[0]);
    } catch (error) {
      setStatus("error", "Nao foi possivel tentar novamente");
      setActivity(error && error.message ? error.message : String(error));
      diagnostic("RETRY ERROR", errorDetails(error));
    }
  }

  async function scanDownloads() {
    if (state.scanRunning) {
      return;
    }
    state.scanRunning = true;
    try {
      var files = await listSupportedFiles();
      files.forEach(function (file) {
        if (state.knownFiles[file.name] === file.fingerprint) {
          delete state.pendingFiles[file.name];
          return;
        }

        var pending = state.pendingFiles[file.name];
        if (!pending || pending.fingerprint !== file.fingerprint) {
          state.pendingFiles[file.name] = {
            fingerprint: file.fingerprint,
            stableScans: 0,
            file: Object.assign({}, file, {category: state.activeCategory})
          };
          return;
        }

        pending.stableScans += 1;
        if (pending.stableScans >= 2 && file.stats.size > 0) {
          state.knownFiles[file.name] = file.fingerprint;
          delete state.pendingFiles[file.name];
          enqueueImport(pending.file);
        }
      });
    } catch (error) {
      console.error(error);
      setStatus("error", "Sem acesso à pasta de downloads");
      setActivity("Abra a engrenagem e escolha a pasta Downloads para autorizar o acesso.");
    } finally {
      state.scanRunning = false;
    }
  }

  async function ensureDirectory(directory) {
    if (await pathExists(directory)) {
      return;
    }

    try {
      await fs.mkdir(directory, {recursive: true});
    } catch (error) {
      // No UXP, mkdir pode informar "file already exists" mesmo com recursive.
      // Se outra operacao criou a pasta entre a verificacao e o mkdir, esta tudo certo.
      if (!(await pathExists(directory))) {
        throw error;
      }
    }
  }

  function asUint8Array(data) {
    if (data instanceof Uint8Array) {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    }
    if (data && data.buffer instanceof ArrayBuffer) {
      return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || data.length);
    }
    throw new Error("Formato binario inesperado.");
  }

  function unzipArchive(bytes) {
    if (!fflate || typeof fflate.unzipSync !== "function") {
      throw new Error("O descompactador interno nao foi carregado.");
    }
    return fflate.unzipSync(bytes,{filter:core.archiveAudioFilter(MAX_DOWNLOAD_BYTES,1000)});
  }

  async function pathExists(filePath) {
    try {
      await fs.lstat(filePath);
      return true;
    } catch (error) {
      return false;
    }
  }

  async function uniqueFilePath(directory, fileName) {
    var extension = core.extensionOf(fileName);
    var stem = extension ? fileName.slice(0, -extension.length) : fileName;
    var candidate = nodePath.join(directory, fileName);
    var counter = 2;
    while (await pathExists(candidate)) {
      candidate = nodePath.join(directory, stem + " (" + counter + ")" + extension);
      counter += 1;
    }
    return candidate;
  }

  async function uniqueDirectoryPath(directory) {
    var candidate = directory;
    var counter = 2;
    while (await pathExists(candidate)) {
      candidate = directory + " (" + counter + ")";
      counter += 1;
    }
    return candidate;
  }

  async function extractZip(zipPath, outputRoot) {
    var packageName = core.sanitizeName(core.baseName(zipPath), "Envato Download");
    var displayName = core.packageDisplayName(zipPath);
    var packageDirectory = await uniqueDirectoryPath(nodePath.join(outputRoot, packageName));
    await ensureDirectory(packageDirectory);

    var zipStats = await fs.lstat(zipPath);
    if (zipStats.size > MAX_DOWNLOAD_BYTES) throw new Error("O download ultrapassa 256 MB. Importe um pacote menor.");
    var rawZip = await fs.readFile(zipPath);
    var entries = unzipArchive(asUint8Array(rawZip));
    var audioNames = core.audioEntriesFromArchive(entries);
    var written = [];
    var i;

    for (i = 0; i < audioNames.length; i += 1) {
      var sourceName = audioNames[i];
      var outputName = core.flattenedAudioName(sourceName);
      var outputPath = await uniqueFilePath(packageDirectory,outputName);
      await fs.writeFile(outputPath, asUint8Array(entries[sourceName]));
      if ((await fs.lstat(outputPath)).size !== entries[sourceName].byteLength) throw new Error("A gravação do áudio ficou incompleta. Confira o espaço disponível.");
      written.push(outputPath);
    }

    return {
      filePaths: written,
      displayName: displayName
    };
  }

  async function copyDirectAudio(sourcePath, outputRoot) {
    var directDirectory = nodePath.join(outputRoot, "Downloads diretos");
    await ensureDirectory(directDirectory);
    var destination = await uniqueFilePath(
      directDirectory,
      core.sanitizeName(nodePath.basename(sourcePath), "audio")
    );
    await fs.copyFile(sourcePath, destination, 0);
    return {
      filePaths: [destination],
      displayName: core.packageDisplayName(sourcePath)
    };
  }

  async function findChildBin(parentBin, name) {
    var items = await parentBin.getItems();
    var i;
    for (i = 0; i < items.length; i += 1) {
      if (items[i].name !== name) {
        continue;
      }
      var folder = premiere.FolderItem.cast(items[i]);
      if (folder) {
        return folder;
      }
    }
    return null;
  }

  async function ensureBin(project, parentBin, name) {
    var existing = await findChildBin(parentBin, name);
    if (existing) {
      return existing;
    }

    var created = false;
    project.lockedAccess(function () {
      created = project.executeTransaction(function (compoundAction) {
        compoundAction.addAction(parentBin.createBinAction(name, true));
      }, "Criar pasta " + name);
    });

    if (!created) {
      throw new Error("Nao foi possivel criar a pasta " + name + " no projeto.");
    }

    var newBin = await findChildBin(parentBin, name);
    if (!newBin) {
      throw new Error("A pasta " + name + " foi criada, mas nao foi encontrada.");
    }
    return newBin;
  }

  async function destinationBin(project, category, displayName) {
    var rootBin = await project.getRootItem();
    var categoryName = category === "sfx" ? "SFX" : "MUSICAS";
    var categoryBin = await ensureBin(project, rootBin, categoryName);
    return ensureBin(project, categoryBin, displayName);
  }

  async function importIntoPremiere(filePaths, project, category, displayName) {
    if (!filePaths.length) {
      throw new Error("O download nao contem arquivos de audio compativeis.");
    }
    var active = await premiere.Project.getActiveProject();
    if (!active || String(active.guid) !== String(project.guid)) throw new Error("O projeto ativo mudou durante o download. Volte ao projeto original e use Tentar último.");
    var targetBin;
    try {
      targetBin = await destinationBin(project, category, displayName);
    } catch (binError) {
      await diagnostic("BIN FALLBACK", errorDetails(binError));
      targetBin = await project.getInsertionBin();
      if (!targetBin) {
        targetBin = await project.getRootItem();
      }
      setActivity("Nao consegui criar as pastas; importando no destino atual.");
    }

    var targetProjectItem = targetBin;
    if (targetBin && typeof targetBin.createBinAction === "function") {
      targetProjectItem = premiere.ProjectItem.cast(targetBin);
    }
    if (!targetProjectItem) {
      throw new Error("O destino do painel Projeto nao e compativel com a importacao.");
    }

    var imported = await project.importFiles(filePaths, true, targetProjectItem, false);
    if (!imported) {
      throw new Error("O Premiere recusou a importacao dos arquivos.");
    }
  }

  async function processDownload(sourcePath, category) {
    state.processingCount += 1;
    setStatus("busy", "Extraindo e importando...");
    setActivity("Processando " + nodePath.basename(sourcePath));

    try {
      await diagnostic("START", nodePath.basename(sourcePath) + " | " + category);
      var info = await activeProjectInfo();
      if (!info) {
        throw new Error("Salve o projeto do Premiere antes de baixar o arquivo.");
      }

      await diagnostic("PROJECT", info.project.path);
      await ensureDirectory(info.outputDirectory);
      var extension = core.extensionOf(sourcePath);
      var extractedPackage;
      if (extension === ".zip") {
        extractedPackage = await extractZip(sourcePath, info.outputDirectory);
      } else if (core.isAudioFile(sourcePath)) {
        extractedPackage = await copyDirectAudio(sourcePath, info.outputDirectory);
      } else {
        return;
      }

      await diagnostic(
        "EXTRACTED",
        extractedPackage.displayName + " | " + extractedPackage.filePaths.length + " arquivo(s)"
      );

      await importIntoPremiere(
        extractedPackage.filePaths,
        info.project,
        category,
        extractedPackage.displayName
      );
      await diagnostic("IMPORTED", extractedPackage.displayName);
      setActivity(
        extractedPackage.filePaths.length + " arquivo(s) em " +
        (category === "sfx" ? "SFX" : "MUSICAS") + " > " + extractedPackage.displayName
      );
    } finally {
      state.processingCount -= 1;
      if (state.processingCount < 1) {
        setStatus("ready", "Monitorando downloads");
      }
    }
  }

  async function importManualFile() {
    var files = await localFileSystem.getFileForOpening({
      allowMultiple: true,
      types: ["zip", "wav", "mp3", "aif", "aiff", "m4a", "flac", "ogg"]
    });
    if (!files) {
      return;
    }
    if (!Array.isArray(files)) {
      files = [files];
    }
    files.forEach(function (file) {
      enqueueImport({path: file.nativePath, category: state.activeCategory});
    });
  }

  function startMonitor() {
    if (state.monitorTimer) {
      clearInterval(state.monitorTimer);
    }
    state.monitorTimer = setInterval(scanDownloads, 2000);
  }

  async function initializeMonitor() {
    ui.downloadsPath.value = state.downloadDirectory;
    setStatus("busy", "Preparando monitor de downloads...");
    try { await buildBaseline(); }
    catch (accessError) {
      setActivity("Autorize a pasta Downloads para o monitor funcionar no macOS/Windows.");
      var folder = await localFileSystem.getFolder({initialDomain:domains.userDownloads});
      if (!folder) throw new Error("Acesso a Downloads não autorizado. Use a engrenagem > Escolher para tentar novamente.");
      state.downloadDirectory = folder.nativePath;
      localStorage.setItem("envatoAudio.downloadDirectory",state.downloadDirectory);
      ui.downloadsPath.value = state.downloadDirectory;
      await buildBaseline();
    }
    startMonitor();
    await refreshProjectLabel();

    // Baseline only: never import unrelated files merely because the panel
    // opened. Explicit "Tentar último" recovers a previous download on request.
  }

  function handleInitializationError(error) {
    console.error(error);
    setStatus("error", "Falha ao iniciar monitor");
    setActivity(error && error.message ? error.message : String(error));
  }

  function bindUI() {
    ui.musicTab = document.getElementById("musicTab");
    ui.sfxTab = document.getElementById("sfxTab");
    ui.homeButton = document.getElementById("homeButton");
    ui.reloadButton = document.getElementById("reloadButton");
    ui.settingsButton = document.getElementById("settingsButton");
    ui.settingsPanel = document.getElementById("settingsPanel");
    ui.envatoWebview = document.getElementById("envatoWebview");
    ui.browserLoader = document.getElementById("browserLoader");
    ui.statusDot = document.getElementById("statusDot");
    ui.statusText = document.getElementById("statusText");
    ui.activityText = document.getElementById("activityText");
    ui.retryLatestButton = document.getElementById("retryLatestButton");
    ui.importFileButton = document.getElementById("importFileButton");
    ui.downloadsPath = document.getElementById("downloadsPath");
    ui.chooseDownloadsButton = document.getElementById("chooseDownloadsButton");
    ui.projectPath = document.getElementById("projectPath");
    ui.refreshProjectButton = document.getElementById("refreshProjectButton");
    ui.updateButton = document.getElementById("updateButton");
    document.getElementById("version").textContent = "v" + version;

    ui.musicTab.addEventListener("click", function () { navigate("music"); });
    ui.sfxTab.addEventListener("click", function () { navigate("sfx"); });
    ui.homeButton.addEventListener("click", function () {
      navigate(ui.sfxTab.classList.contains("active") ? "sfx" : "music");
    });
    ui.reloadButton.addEventListener("click", function () {
      var current = ui.envatoWebview.src || state.currentUrl;
      ui.browserLoader.classList.remove("hidden");
      ui.envatoWebview.src = current;
    });
    ui.settingsButton.addEventListener("click", function () {
      ui.settingsPanel.classList.toggle("open");
    });
    ui.importFileButton.addEventListener("click", function(){importManualFile().catch(handleInitializationError);});
    ui.retryLatestButton.addEventListener("click", retryLatestDownload);
    ui.chooseDownloadsButton.addEventListener("click", function(){chooseDownloadsDirectory().catch(handleInitializationError);});
    ui.refreshProjectButton.addEventListener("click", refreshProjectLabel);
    document.getElementById("openBrowserButton").addEventListener("click",function(){
      uxp.shell.openExternal(state.currentUrl,"Abrir a Envato no navegador para fazer login/download.").catch(handleInitializationError);
    });
    document.getElementById("checkUpdatesButton").addEventListener("click",function(){checkUpdates(true);});
    ui.updateButton.addEventListener("click",function(){
      var release = updateChecker && updateChecker.state.release;
      if (release && updates.releaseURL(release.tag)) uxp.shell.openExternal(updates.releaseURL(release.tag),"Abrir a atualização do Envato Audio no GitHub.").catch(handleInitializationError);
    });

    ui.envatoWebview.addEventListener("loadstart", function () {
      ui.browserLoader.classList.remove("hidden");
    });
    ui.envatoWebview.addEventListener("loadstop", function (event) {
      state.currentUrl = event.url || state.currentUrl;
      if (state.currentUrl.indexOf("/sound-effects") >= 0) {
        state.activeCategory = "sfx";
        setActiveTab("sfx");
      } else if (state.currentUrl.indexOf("/royalty-free-music") >= 0) {
        state.activeCategory = "music";
        setActiveTab("music");
      }
      ui.browserLoader.classList.add("hidden");
    });
    ui.envatoWebview.addEventListener("loaderror", function (event) {
      ui.browserLoader.classList.add("hidden");
      setStatus("error", "A Envato nao carregou");
      setActivity(event.message || "Falha de navegacao no WebView.");
    });
  }

  async function init() {
    if (state.initialized) {
      startMonitor();
      await refreshProjectLabel();
      return;
    }
    if (!state.bound) { bindUI(); state.bound = true; checkUpdates(false); }
    await initializeMonitor();
    state.initialized = true;
  }

  async function checkUpdates(force) {
    try {
      if (!updateChecker) {
        var folder = await dataFolder();
        updateChecker = new updates.UpdateChecker({version:version,fetch:function(url,options){return fetch(url,options);},io:{
          readJSON:async function(name){return JSON.parse(await (await folder.getEntry(name)).read());},
          writeJSON:async function(name,value){await (await folder.createFile(name,{overwrite:true})).write(JSON.stringify(value));}
        }});
        await updateChecker.init();
      }
      var result = await updateChecker.check({force:!!force});
      ui.updateButton.hidden = !result.available;
      if (result.available) ui.updateButton.textContent = "↑ Atualizar " + result.release.version;
      if (force) setActivity(result.available ? "Nova versão disponível no botão Atualizar." : result.error ? "Não foi possível verificar agora." : "Você está na versão mais recente.");
    } catch (_) { if(force) setActivity("Não foi possível verificar agora; o painel continua funcionando normalmente."); }
  }

  entrypoints.setup({
    panels: {
      envatoAudioPanel: {
        show: function () {
          init().catch(handleInitializationError);
        },
        destroy: function () {
          if (state.monitorTimer) {
            clearInterval(state.monitorTimer);
            state.monitorTimer = null;
          }
        }
      }
    }
  });

})();
