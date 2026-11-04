import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { content, families, topics, words, wordIds } from '../src/content';
describe('随包内容完整性',()=>{
  it('120词恰好覆盖4个语义主题与全部构词分组，每卡搭配、双语例句完整',()=>{
    expect(words).toHaveLength(120); expect(new Set(wordIds).size).toBe(120);
    expect(topics).toHaveLength(4); expect(families).toHaveLength(46);
    expect(topics.flatMap(t=>t.words).sort()).toEqual([...wordIds].sort());
    expect(families.flatMap(f=>f.words).sort()).toEqual([...wordIds].sort());
    for(const word of words) {
      expect(word.phrases.length).toBeGreaterThanOrEqual(2); expect(word.examples).toHaveLength(2);
      expect(word.ipa.startsWith('/')).toBe(true); expect(word.meaning.length).toBeGreaterThan(0);
      for(const pair of [...word.phrases,...word.examples]) { expect(pair.en.length).toBeGreaterThan(0); expect(pair.zh.length).toBeGreaterThan(0); }
    }
    expect(content.license).toBe('CC-BY-SA-4.0');
  });
  it('360段本地音频存在，WAV头、时长与SHA-256清单匹配',()=>{
    const root=path.resolve('public/audio');
    const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8')) as {file:string;seconds:number;sha256:string}[];
    expect(manifest).toHaveLength(360); expect(new Set(manifest.map(x=>x.file)).size).toBe(360);
    const byName=new Map(manifest.map(x=>[x.file,x]));
    for(const word of words) for(const asset of [word.audio,...word.examples.map(x=>x.audio!)]) {
      const name=asset.replace('audio/',''),entry=byName.get(name)!; expect(entry).toBeDefined();
      const bytes=readFileSync(path.join(root,name));
      expect(bytes.subarray(0,4).toString()).toBe('RIFF'); expect(bytes.subarray(8,12).toString()).toBe('WAVE');
      expect(entry.seconds).toBeGreaterThan(.15); expect(entry.seconds).toBeLessThan(30);
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
    }
  });
});
