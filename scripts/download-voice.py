from pathlib import Path
from urllib.request import urlopen, Request
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, argparse

parser=argparse.ArgumentParser()
parser.add_argument('--directory',default=str(Path(__file__).resolve().parents[1]/'.toolchain/voice'))
root=Path(parser.parse_args().directory)
root.mkdir(parents=True, exist_ok=True)
base = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/ljspeech/medium/'
names = ['en_US-ljspeech-medium.onnx','en_US-ljspeech-medium.onnx.json','MODEL_CARD']

def get(name):
    out = root / name
    if out.exists():
        return {'name':name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}
    request = Request(base+name, headers={'User-Agent':'DailyLexicon/0.1'})
    with urlopen(request, timeout=90) as r, out.with_suffix(out.suffix+'.partial').open('wb') as f:
        while data := r.read(1024*1024):
            f.write(data)
    out.with_suffix(out.suffix+'.partial').replace(out)
    print('Voice file downloaded:',name,flush=True)
    return {'name':name,'sha256':hashlib.sha256(out.read_bytes()).hexdigest()}

with ThreadPoolExecutor(max_workers=3) as pool:
    results = list(pool.map(get,names))
(root/'manifest.json').write_text(json.dumps(results,indent=2),encoding='utf-8')
print('Voice is ready',flush=True)
