import data from './data/content.json';
import legacy from '../content/catalogs/0.1.0.json';

export interface Bilingual { en: string; zh: string; audio?: string }
export interface Word {
  id: string; word: string; ipa: string; pos: string; meaning: string;
  level: string; topic: string; family: string;
  scene: string; concept: string;
  phrases: Bilingual[]; examples: Bilingual[]; forms: string[];
  audio: string; source: string; reviewStatus: string;
}
export interface Topic { id: string; label: string; subtitle: string; description: string; column: string; scenes: string[]; words: string[] }
export interface Scene { id: string; label: string; topic: string; concepts: string[]; words: string[] }
export interface Concept { id: string; label: string; topic: string; scene: string; words: string[] }
export interface Family { id: string; label: string; meaning: string; kind: string; note: string; words: string[]; reference: string }
export const content = data as typeof data & { words: Word[]; topics: Topic[]; scenes: Scene[]; concepts: Concept[]; families: Family[] };
export const words: Word[] = content.words;
export const topics: Topic[] = content.topics;
export const scenes: Scene[] = content.scenes;
export const concepts: Concept[] = content.concepts;
export const families: Family[] = content.families;
export const wordById = new Map(words.map(w => [w.id, w]));
export const topicById = new Map(topics.map(t => [t.id, t]));
export const familyById = new Map(families.map(f => [f.id, f]));
export const sceneById = new Map(scenes.map(s => [s.id, s]));
export const conceptById = new Map(concepts.map(c => [c.id, c]));
export const wordIds = words.map(w => w.id);
// The course range changes only when its word set changes, independently of app and editorial releases.
export const courseVersion: string = content.catalogVersion;
export const legacyCatalog = legacy;
type Catalog = { id:string; version:string; wordIds:string[]; hash:string };
const snapshots = import.meta.glob('../content/catalogs/*.json',{eager:true,import:'default'}) as Record<string,Catalog>;
export const historicalCatalogs = Object.values(snapshots).filter(snapshot=>snapshot.version!==courseVersion);
export const acceptedPackIds: string[] = [content.id,legacy.id];
export function catalogVersion(order: string[]) {
  if(new Set(order).size!==order.length) return undefined;
  for(const snapshot of [{version:courseVersion,wordIds},...historicalCatalogs]) {
    const expected=new Set(snapshot.wordIds);
    if(order.length===expected.size && order.every(id=>expected.has(id))) return snapshot.version;
  }
  return undefined;
}
export function assetUrl(path: string) { return new URL('./' + path, document.baseURI).href; }
