import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..'), out=path.join(root,'public/licenses/dependencies');
await fs.mkdir(out,{recursive:true});
const visited=new Set(),records=[];
async function visit(name,parent=root) {
  let dir=path.join(parent,'node_modules',name);
  try { await fs.access(path.join(dir,'package.json')); } catch { dir=path.join(root,'node_modules',name); }
  const pkg=JSON.parse(await fs.readFile(path.join(dir,'package.json'),'utf8'));
  const id=`${pkg.name}@${pkg.version}`; if(visited.has(id)) return; visited.add(id);
  const record={name:pkg.name,version:pkg.version,license:pkg.license ?? 'See bundled license',repository:pkg.repository,files:[]};
  for(const file of await fs.readdir(dir)) if(/^(license|copying|notice)(\.|$|-)/i.test(file)) {
    const stat=await fs.stat(path.join(dir,file)); if(!stat.isFile()) continue;
    const target=`${pkg.name.replaceAll('/','_').replaceAll('@','')}-${pkg.version}-${file}`;
    await fs.copyFile(path.join(dir,file),path.join(out,target)); record.files.push(target);
  }
  records.push(record);
  for(const dep of Object.keys(pkg.dependencies ?? {})) await visit(dep,dir);
}
const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));
for(const name of Object.keys(pkg.dependencies)) await visit(name);
await fs.writeFile(path.join(out,'manifest.json'),JSON.stringify(records,null,2));
console.log(`Collected ${records.length} dependency license records.`);
