import pkg from '../package.json';
export const appVersion = pkg.version;
export const editionLabel = appVersion.includes('-') ? '开发版' : '正式版';
