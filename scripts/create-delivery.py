from pathlib import Path
import os, shutil, zipfile, hashlib, json

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'release'
OUT.mkdir(exist_ok=True)
windows=OUT/'windows'/'词汇日报-win32-x64'
assert windows.is_dir() and (windows/'词汇日报.exe').is_file()
for file in ['README.md','LICENSE','THIRD_PARTY_NOTICES.md']:
    shutil.copy2(ROOT/file,windows/file)
apk=OUT/'词汇日报-0.1.0-Android.apk'
shutil.copy2(ROOT/'android/app/build/outputs/apk/debug/app-debug.apk',apk)

winzip=OUT/'词汇日报-0.1.0-Windows-x64.zip'
with zipfile.ZipFile(winzip,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for file in windows.rglob('*'):
        if file.is_file(): archive.write(file,Path('词汇日报')/file.relative_to(windows))
print('Windows ZIP ready',flush=True)

sourcezip=OUT/'词汇日报-0.1.0-源码.zip'
skip_dirs={'node_modules','dist','release','.git','.toolchain','.gradle','build','.playwright-cli','test-results','playwright-report','__pycache__'}
with zipfile.ZipFile(sourcezip,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
    for directory,dirs,files in os.walk(ROOT):
        base=Path(directory)
        dirs[:]=[d for d in dirs if d not in skip_dirs and (base/d).relative_to(ROOT).as_posix()!='android/app/src/main/assets']
        for name in files:
            file=base/name
            if name.endswith(('.log','.tsbuildinfo','.partial')) or name=='local.properties': continue
            if base==ROOT and name.endswith('.png'): continue
            archive.write(file,Path('daily-lexicon')/file.relative_to(ROOT))
print('Source ZIP ready',flush=True)

for file in [winzip,sourcezip,apk]:
    with zipfile.ZipFile(file) as archive:
        assert archive.testzip() is None, file
records=[{'file':p.name,'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in [winzip,apk,sourcezip]]
(OUT/'SHA256.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
shutil.copy2(ROOT/'README.md',OUT/'使用说明.md')
shutil.copy2(ROOT/'docs/验证记录.md',OUT/'验证记录.md')
for record in records: print(record['file'],round(record['bytes']/1048576,1),'MB',flush=True)
