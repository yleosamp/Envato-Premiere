const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=require('../core'),Z=require('../vendor/fflate.min');
test('Mac Downloads respects /Volumes, Unicode, spaces, # and literal percent without Windows paths',()=>{
  assert.equal(core.nativeDownloadsPath('C:\\Users\\old\\Downloads','/Users/editor',path.posix),'/Users/editor/Downloads');
  assert.equal(core.nativeDownloadsPath('/Volumes/Áudio 100% #1/Downloads','/Users/editor',path.posix),'/Volumes/Áudio 100% #1/Downloads');
  assert.equal(core.nativeDownloadsPath('/Users/editor/Downloads','C:\\Users\\editor',path.win32),'C:\\Users\\editor\\Downloads');
  assert.equal(core.nativeDownloadsPath('\\\\NAS\\audio','C:\\Users\\editor',path.win32),'\\\\NAS\\audio');
});
test('Mac resource forks are excluded at every directory level, real audio survives',()=>{
  assert.deepEqual(core.audioEntriesFromArchive({'good.wav':1,'foo/._bad.wav':1,'foo/__MACOSX/bad.wav':1,'__MACOSX/foo.wav':1,'foo/ok.mp3':1,'foo\\__MACOSX\\bad.wav':1}),['good.wav','foo/ok.mp3']);
});
test('bounded archive extraction selects only audio and refuses oversized audio before inflation',()=>{
  const zip=Z.zipSync({'good.wav':new Uint8Array([1,2]),'foo/._bad.wav':new Uint8Array([3]),'other.txt':new Uint8Array(1000)});
  const files=Z.unzipSync(zip,{filter:core.archiveAudioFilter(100,10)});assert.deepEqual(Object.keys(files),['good.wav']);
  assert.throws(()=>Z.unzipSync(zip,{filter:core.archiveAudioFilter(1,10)}),/limite/);
});
function fixture(platform='mac',deny=false){
  const home=platform==='mac'?'/Users/Editor Áudio':'C:\\Users\\Editor',paths=platform==='mac'?path.posix:path.win32;
  const elements={},imports=[],files=new Map(),calls={pick:0,interval:0};
  const element=()=>({value:'',textContent:'',className:'',classList:{toggle(){},add(){},remove(){},contains(){return false;}},addEventListener(){}});
  const project={guid:'original',path:paths.join(home,'Videos','Projeto #1.prproj'),async getRootItem(){return bin;},lockedAccess(fn){fn();},executeTransaction(fn){fn({addAction(action){action();}});return true;},async importFiles(paths){imports.push(paths);return true;}};
  const bin={name:'root',children:[],async getItems(){return this.children;},createBinAction(name){return()=>this.children.push({...bin,name,children:[]});}};
  const context={window:{path:paths},localStorage:{getItem(){return null;},setItem(){}},document:{getElementById(id){return elements[id]||(elements[id]=element());}},console:{log(){},error(){}},Uint8Array,ArrayBuffer,Date,Promise,
    setInterval(){calls.interval++;return 1;},clearInterval(){},setTimeout,clearTimeout,
    require(id){
      if(id==='uxp')return{entrypoints:{setup(){}},storage:{domains:{userDownloads:'downloads'},localFileSystem:{async getDataFolder(){return {async getEntry(){throw Error('missing');},async createFile(){return{async write(){}};}};},async getFolder(){calls.pick++;deny=false;return{nativePath:paths.join(home,'Downloads')};}}}};
      if(id==='os')return{homedir(){return home;}};
      if(id==='fs')return{async readdir(){if(deny)throw Error('permission');return Array.from(files.keys()).map(p=>paths.basename(p));},async lstat(p){if(!files.has(p))throw Error('missing');return{isFile(){return true;},size:files.get(p).length,mtimeMs:100};},async mkdir(p){files.set(p,new Uint8Array());},async readFile(p){return files.get(p);},async writeFile(p,b){files.set(p,new Uint8Array(b));},async copyFile(a,b){files.set(b,files.get(a));}};
      if(id==='premierepro')return{Project:{async getActiveProject(){return project;}},FolderItem:{cast:x=>x},ProjectItem:{cast:x=>x}};
      if(id==='./core.js')return core;if(id==='./updates.js')return require('../updates');if(id==='./manifest.json')return require('../manifest.json');if(id==='./vendor/fflate.min.js')return Z;throw Error(id);
    }};
  const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8').replace(/\}\)\(\);\s*$/,'globalThis.testing={state,initializeMonitor,processDownload,scanDownloads,buildBaseline,bindUI};})();');
  vm.runInNewContext(source,context);context.testing.bindUI();context.testing.state.bound=true;
  return{api:context.testing,files,imports,home,paths,calls};
}
for(const os of ['mac','win'])test(os+': full extraction/import contract uses native paths and preserves all real audio',async()=>{
  const f=fixture(os),download=f.paths.join(f.home,'Downloads','Test.zip');f.files.set(download,Z.zipSync({'one.wav':new Uint8Array([1,2]),'folder/two.mp3':new Uint8Array([3,4]),'._bad.wav':new Uint8Array([0])}));
  await f.api.processDownload(download,'music');assert.equal(f.imports.length,1);assert.equal(f.imports[0].length,2);
  assert.ok(f.imports[0].every(p=>p.startsWith(f.paths.join(f.home,'Videos','Envato Audio'))));
});
test('macOS Downloads denial requests one folder authorization instead of hanging monitor',async()=>{
  const f=fixture('mac',true);await f.api.initializeMonitor();assert.equal(f.calls.pick,1);assert.equal(f.calls.interval,1);assert.equal(f.imports.length,0);
});
test('startup baseline never imports old personal downloads automatically',async()=>{
  const f=fixture('mac');f.files.set('/Users/Editor Áudio/Downloads/Personal.wav',new Uint8Array([1]));await f.api.initializeMonitor();assert.equal(f.imports.length,0);assert.equal(Object.keys(f.api.state.queuedFiles).length,0);
});
