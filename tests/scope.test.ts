import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import report from '../content/reports/scope.json';
import source from '../content/scope/source.json';
import release from '../content/reports/release.json';
import reviews from '../content/reviews.json';
import study from '../content/scope/study-source.json';
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
    expect(report.cards).toBe(words.length);expect(report.audioFiles).toBe(words.length*3);
    const scopeRows=readFileSync('content/scope/study-scope.tsv','utf8').trim().split(/\r?\n/).slice(1).map(row=>row.split('\t'));
    const levels=new Map(scopeRows.map(row=>[row[0],row[2]]));
    const required=new Set(scopeRows.filter(row=>row[3]==='yes').map(row=>row[0]));
    expect(scopeRows).toHaveLength(study.candidateWords);
    for(const word of words) {
      expect(word.level).toBe(levels.get(word.word.toLowerCase())??'扩展');
    }
    expect(report.candidateMatches).toBe(words.filter(word=>required.has(word.word.toLowerCase())).length);
    expect(report.missingCards+report.candidateMatches).toBe(report.targetWords);
    expect(report.targetWords).toBe(study.targetWords);
    expect(report.structuralIssues).toHaveLength(0);
    expect(report.humanApprovedCards).toBeLessThanOrEqual(reviews.records.length);
    expect(release.ready).toBe(release.checks.every(check=>check.passed));
    expect(report.officialScopeVerification).toBe(release.checks.find(check=>check.id==='official-scope')?.passed?'approved':'pending');
  });
});
