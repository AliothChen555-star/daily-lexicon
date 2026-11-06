import { spawnSync } from 'node:child_process';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const python=process.env.PYTHON ?? (process.platform==='win32'?'python':'python3');
const commands={
  build:[['scripts/study_scope.py'],['scripts/build-content.py'],['scripts/audit-content.py'],['scripts/production.py','database']],
  database:[['scripts/production.py','database']],
  release:[['scripts/study_scope.py'],['scripts/build-content.py'],['scripts/audit-content.py'],['scripts/production.py','database'],['scripts/production.py','check','--require-ready']],
  editorial:[['scripts/editorial-server.py',...process.argv.slice(3)]],
  'editorial-test':[['scripts/editorial-server.py','--test-fixture','--port','4176']],
  test:[['-m','unittest','discover','-s','tests/editorial','-p','test_*.py']],
};
const steps=commands[process.argv[2]];
if(!steps)throw new Error('Unknown content command');
for(const args of steps){const result=spawnSync(python,['-X','utf8',...args],{cwd:root,stdio:'inherit',windowsHide:true});if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);}
