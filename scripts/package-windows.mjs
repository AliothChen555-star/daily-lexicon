import fs from 'node:fs/promises';
import path from 'node:path';
import { packager } from '@electron/packager';
const root=path.resolve(import.meta.dirname,'..'),stage=path.join(root,'release','desktop-source');
await fs.mkdir(stage,{recursive:true});
for(const dir of ['dist','electron']) await fs.cp(path.join(root,dir),path.join(stage,dir),{recursive:true,force:true});
for(const file of ['LICENSE','README.md','THIRD_PARTY_NOTICES.md']) await fs.copyFile(path.join(root,file),path.join(stage,file));
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({name:pkg.name,productName:'词汇日报',version:pkg.version,main:pkg.main,license:pkg.license,description:pkg.description},null,2));
const electron=JSON.parse(await fs.readFile(path.join(root,'node_modules/electron/package.json'),'utf8'));
const output=await packager({dir:stage,name:'词汇日报',platform:'win32',arch:'x64',electronVersion:electron.version,out:path.join(root,'release','windows'),
  asar:true,prune:false,overwrite:true,icon:path.join(root,'assets/app-icon.ico'),appCopyright:'Daily Lexicon contributors',
  win32metadata:{CompanyName:'Daily Lexicon contributors',FileDescription:'词汇日报 — 每日三十词',ProductName:'词汇日报'},
  download:{cacheRoot:process.env.ELECTRON_CACHE ?? path.join(root,'.toolchain/electron-cache')},
});
for(const dir of output) for(const file of ['README.md','LICENSE','THIRD_PARTY_NOTICES.md']) await fs.copyFile(path.join(root,file),path.join(dir,file));
console.log('Windows portable application:',output.join(', '));
