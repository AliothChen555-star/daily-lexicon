import data from './data/content.json';

export interface Bilingual { en: string; zh: string; audio?: string }
export interface Word {
  id: string; word: string; ipa: string; pos: string; meaning: string;
  level: string; topic: string; family: string;
  phrases: Bilingual[]; examples: Bilingual[]; forms: string[];
  audio: string; source: string; reviewStatus: string;
}
export interface Topic { id: string; label: string; subtitle: string; description: string; column: string; words: string[] }
export interface Family { id: string; label: string; meaning: string; kind: string; note: string; words: string[]; reference: string }
export const content = data as typeof data & { words: Word[]; topics: Topic[]; families: Family[] };
export const words: Word[] = content.words;
export const topics: Topic[] = content.topics;
export const families: Family[] = content.families;
export const wordById = new Map(words.map(w => [w.id, w]));
export const topicById = new Map(topics.map(t => [t.id, t]));
export const familyById = new Map(families.map(f => [f.id, f]));
export const wordIds = words.map(w => w.id);
export function assetUrl(path: string) { return new URL('./' + path, document.baseURI).href; }
