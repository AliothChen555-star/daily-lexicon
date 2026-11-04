import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import report from '../content/reports/scope.json';
import source from '../content/scope/source.json';
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
    expect(report.trialCards).toBe(300);expect(report.audioFiles).toBe(900);
    expect(report.missingCards+report.trialMatches).toBe(report.candidateWords);
    expect(report.structuralIssues).toHaveLength(0);expect(report.humanApprovedCards).toBe(0);
    expect(report.formalReleaseReady).toBe(false);expect(report.officialScopeVerification).toBe('pending');
  });
});
