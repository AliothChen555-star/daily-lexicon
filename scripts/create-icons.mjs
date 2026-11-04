import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const root=path.resolve(import.meta.dirname,'..');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="40" fill="#355346"/><g fill="none" stroke="#f7f7f2" stroke-width="7"><path d="M58 50h140v158H58zM77 77h102M77 94h102M77 174h102M77 190h102M77 116h42v39H77zM133 116h46M133 135h46M133 154h46"/></g></svg>`;
await fs.mkdir(path.join(root,'assets'),{recursive:true});
await fs.writeFile(path.join(root,'assets','app-icon.svg'),svg);
const png=await sharp(Buffer.from(svg)).png().toBuffer();
await fs.writeFile(path.join(root,'assets','app-icon.png'),png);
// ICO supports PNG images since Windows Vista; include a full 256px icon.
const header=Buffer.alloc(22); header.writeUInt16LE(1,2); header.writeUInt16LE(1,4); header.writeUInt16LE(1,10); header.writeUInt16LE(32,12); header.writeUInt32LE(png.length,14); header.writeUInt32LE(22,18);
await fs.writeFile(path.join(root,'assets','app-icon.ico'),Buffer.concat([header,png]));
const res=path.join(root,'android/app/src/main/res');
for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})) {
  for(const name of ['ic_launcher','ic_launcher_round','ic_launcher_foreground']) await sharp(Buffer.from(svg)).resize(size,size).png().toFile(path.join(res,`mipmap-${density}`,`${name}.png`));
}
const foreground=`<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108"><path android:fillColor="#355346" android:pathData="M0,0h108v108h-108z"/><path android:fillColor="@android:color/transparent" android:strokeColor="#F7F7F2" android:strokeWidth="2" android:pathData="M32,25h44v58h-44zM38,34h32M38,40h32M38,69h32M38,76h32M38,47h13v15h-13zM56,47h14M56,54h14M56,61h14"/></vector>`;
await fs.writeFile(path.join(res,'drawable-v24/ic_launcher_foreground.xml'),foreground);
for(const file of ['ic_launcher.xml','ic_launcher_round.xml']) {
  const target=path.join(res,'mipmap-anydpi-v26',file);
  await fs.writeFile(target,(await fs.readFile(target,'utf8')).replace('@mipmap/ic_launcher_foreground','@drawable/ic_launcher_foreground'));
}
const dirs=await fs.readdir(res,{withFileTypes:true});
for(const dir of dirs.filter(d=>d.isDirectory() && d.name.startsWith('drawable'))) {
  const target=path.join(res,dir.name,'splash.png');
  try { const {width,height}=await sharp(target).metadata(); await sharp({create:{width,height,channels:3,background:'#f7f7f2'}}).png().toFile(target+'.new'); await fs.rename(target+'.new',target); } catch(e) { if(e.code!=='ENOENT' && !String(e).includes('Input file is missing')) throw e; }
}
console.log('Generated Windows and Android newspaper icons.');
