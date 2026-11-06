from pathlib import Path
import json, wave, hashlib, shutil, time, argparse
import numpy as np
from piper import PiperVoice, SynthesisConfig

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--voice-directory',default=str(ROOT/'.toolchain/voice'))
VOICE=Path(parser.parse_args().voice_directory)
OUT=ROOT/'public/audio'
OUT.mkdir(parents=True,exist_ok=True)
content=json.loads((ROOT/'src/data/content.json').read_text(encoding='utf-8'))
voice=PiperVoice.load(str(VOICE/'en_US-ljspeech-medium.onnx'))
config=SynthesisConfig(length_scale=1.04,noise_scale=0.5,noise_w_scale=0.65)
overrides={
    'suspect.wav':'səspˈɛkt.','transport.wav':'tɹˈænspɔːɹt.','dictate.wav':'dˈɪkteɪt.',
    'live.wav':'lˈɪv.','use.wav':'jˈuːz.','house.wav':'hˈaʊs.',
    'frequent.wav':'fɹˈiːkwənt.','coordinate.wav':'koʊˈɔːɹdɪneɪt.',
    'legitimate.wav':'lɪdʒˈɪtəmət.','replicate.wav':'ɹˈɛplɪkeɪt.',
    'graduate.wav':'ɡɹˈædʒuˌeɪt.','route.wav':'ɹˈuːt.',
}
manifest=[]
for index,word in enumerate(content['words']):
    stem=word['id'].removeprefix('dl-')
    pieces=[(word['word']+'.', stem+'.wav')]+[(x['en'],stem+'--'+str(n+1)+'.wav') for n,x in enumerate(word['examples'])]
    for text,filename in pieces:
        target=OUT/filename
        generated_text='reed.' if filename=='read.wav' else text
        phonemes=voice.phonemize(generated_text)
        if filename in overrides:
            phonemes=[list(overrides[filename])]
        if not target.exists():
            if filename in overrides:
                array=voice.phoneme_ids_to_audio(voice.phonemes_to_ids(phonemes[0]),config)
                peak=float(np.max(np.abs(array)))
                if peak>0: array=array/peak
                pcm=(np.clip(array,-1,1)*32767).astype(np.int16).tobytes()
                with wave.open(str(target),'wb') as f:
                    f.setnchannels(1); f.setsampwidth(2); f.setframerate(voice.config.sample_rate); f.writeframes(pcm)
            else:
                with wave.open(str(target),'wb') as f: voice.synthesize_wav(generated_text,f,config)
        with wave.open(str(target),'rb') as f:
            duration=f.getnframes()/f.getframerate()
            assert duration>0.15 and duration<30,(filename,duration)
        manifest.append({'file':filename,'text':text,'synthesisText':generated_text,'phonemes':phonemes,'seconds':round(duration,3),'sha256':hashlib.sha256(target.read_bytes()).hexdigest()})
    if index%10==0: print('Audio ready:',index+1,'/',len(content['words']),flush=True)
outmeta=ROOT/'public/licenses'
outmeta.mkdir(parents=True,exist_ok=True)
shutil.copy2(VOICE/'MODEL_CARD',outmeta/'piper-ljspeech-model-card.txt')
(OUT/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8',newline='\n')
print('Completed',len(manifest),'offline audio files.',flush=True)
