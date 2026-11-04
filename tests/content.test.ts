import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { content, families, topics, scenes, concepts, words, wordIds, legacyCatalog, sceneById, conceptById } from '../src/content';
describe('随包内容完整性',()=>{
  it('300词覆盖10个主题和三级目录，原120词标识保留，每卡应用完整',()=>{
    expect(words).toHaveLength(300); expect(new Set(wordIds).size).toBe(300);
    expect(topics).toHaveLength(10); expect(families.length).toBeGreaterThan(46);
    expect(topics.flatMap(t=>t.words).sort()).toEqual([...wordIds].sort());
    expect(families.flatMap(f=>f.words).sort()).toEqual([...wordIds].sort());
    expect(scenes.flatMap(s=>s.words).sort()).toEqual([...wordIds].sort());
    expect(concepts.flatMap(c=>c.words).sort()).toEqual([...wordIds].sort());
    expect(legacyCatalog.wordIds.every(id=>wordIds.includes(id))).toBe(true);
    for(const level of ['基础','四级','六级']) expect(words.filter(w=>w.level===level)).toHaveLength(100);
    for(const word of words) {
      expect(sceneById.get(word.scene)?.topic).toBe(word.topic);
      expect(conceptById.get(word.concept)?.scene).toBe(word.scene);
      expect(conceptById.get(word.concept)?.words).toContain(word.id);
      expect(word.phrases.length).toBeGreaterThanOrEqual(2); expect(word.examples).toHaveLength(2);
      expect(word.ipa.startsWith('/')).toBe(true); expect(word.meaning.length).toBeGreaterThan(0);
      for(const pair of [...word.phrases,...word.examples]) { expect(pair.en.length).toBeGreaterThan(0); expect(pair.zh.length).toBeGreaterThan(0); }
    }
    expect(content.license).toBe('CC-BY-SA-4.0');
  });
  it('900段本地音频存在，WAV头、时长与SHA-256清单匹配',()=>{
    const root=path.resolve('public/audio');
    const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8')) as {file:string;seconds:number;sha256:string}[];
    expect(manifest).toHaveLength(900); expect(new Set(manifest.map(x=>x.file)).size).toBe(900);
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
