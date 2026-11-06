import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import report from '../content/reports/scope.json';
import source from '../content/scope/source.json';
import release from '../content/reports/release.json';
import reviews from '../content/reviews.json';
import { words } from '../src/content';
describe('候选范围与正式内容的边界',()=>{
  it('基础、四级和六级取并集，保留来源标签而不冒充完整正式词库',()=>{
    const raw=readFileSync('content/scope/ecdict-words.tsv','utf8');
    const rows=raw.trim().split(/\r?\n/).slice(1).map(line=>line.split('\t') as [string,string]);
    const byWord=new Map(rows);
    expect(byWord.size).toBe(7109);expect(rows).toHaveLength(byWord.size);
    for(const word of ['a','the','go','and','because'])expect(byWord.has(word)).toBe(true);
    expect(rows.some(([,tags])=>tags.split(' ').includes('cet4'))).toBe(true);
    expect(rows.some(([,tags])=>tags.split(' ').includes('cet6'))).toBe(true);
    expect(createHash('sha256').update(raw).digest('hex')).toBe(source.adoptedSha256);
    expect(source.adoptedFields).toEqual(['word','tag']);expect(source.omittedFields).toContain('translation');
    expect(report.cards).toBe(600);expect(report.audioFiles).toBe(1800);
    for(const word of words.filter(w=>byWord.has(w.word.toLowerCase()))) {
      const tags=byWord.get(word.word.toLowerCase())!.split(' ');
      expect(word.level).toBe(tags.some(t=>t==='zk'||t==='gk')?'基础':tags.includes('cet4')?'四级':'六级');
    }
    expect(report.missingCards+report.candidateMatches).toBe(report.candidateWords);
    expect(report.structuralIssues).toHaveLength(0);
    expect(report.humanApprovedCards).toBeLessThanOrEqual(reviews.records.length);
    expect(release.ready).toBe(release.checks.every(check=>check.passed));
    expect(report.officialScopeVerification).toBe(release.checks.find(check=>check.id==='official-scope')?.passed?'approved':'pending');
  });
});
