import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import pack from '../content/pack.json';
import batch from '../content/batches/0.5.0.json';
import { content, families, topics, scenes, concepts, words, wordIds, historicalCatalogs, sceneById, conceptById } from '../src/content';
describe('随包内容完整性',()=>{
  it('实际词数符合词包清单，所有词卡覆盖三级目录和构词分组，每卡应用完整',()=>{
    expect(words).toHaveLength(pack.expectedWords); expect(new Set(wordIds).size).toBe(words.length);
    expect(topics.flatMap(t=>t.words).sort()).toEqual([...wordIds].sort());
    expect(families.flatMap(f=>f.words).sort()).toEqual([...wordIds].sort());
    expect(scenes.flatMap(s=>s.words).sort()).toEqual([...wordIds].sort());
    expect(concepts.flatMap(c=>c.words).sort()).toEqual([...wordIds].sort());
    for(const catalog of historicalCatalogs) expect(catalog.wordIds.every(id=>wordIds.includes(id))).toBe(true);
    expect(new Set(words.map(w=>w.level))).toEqual(new Set(['基础','四级','六级','扩展']));
    for(const word of words) {
      expect(sceneById.get(word.scene)?.topic).toBe(word.topic);
      expect(conceptById.get(word.concept)?.scene).toBe(word.scene);
      expect(conceptById.get(word.concept)?.words).toContain(word.id);
      expect(word.phrases.length).toBeGreaterThanOrEqual(2); expect(word.examples).toHaveLength(2);
      expect(word.ipa.startsWith('/')).toBe(true); expect(word.meaning.length).toBeGreaterThan(0);
      expect(word.id).toBe('dl-'+word.word.toLowerCase());
      expect(word.audio).toBe('audio/'+word.word.toLowerCase()+'.wav');
      for(const pair of [...word.phrases,...word.examples]) { expect(pair.en.length).toBeGreaterThan(0); expect(pair.zh.length).toBeGreaterThan(0); }
    }
    expect(content.license).toBe('CC-BY-SA-4.0');
  });
  it('原630词的语义顺序保留，本批六级词按新主题追加',()=>{
    const previous=historicalCatalogs.find(catalog=>catalog.version==='0.4.0')!;
    expect(previous.wordIds).toHaveLength(630);
    expect(wordIds.slice(0,previous.wordIds.length)).toEqual(previous.wordIds);
    const additions=batch.topics.flatMap(topic=>topic.words.split(' ').map(word=>'dl-'+word));
    expect(wordIds.slice(previous.wordIds.length,previous.wordIds.length+additions.length)).toEqual(additions);
  });
  it('每词三段本地音频的WAV头、时长与SHA-256清单匹配',()=>{
    const root=path.resolve('public/audio');
    const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8')) as {file:string;seconds:number;sha256:string}[];
    expect(manifest).toHaveLength(words.length*3); expect(new Set(manifest.map(x=>x.file)).size).toBe(words.length*3);
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
