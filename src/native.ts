import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function saveBackupFile(text: string, day: string) {
  const filename = `词汇日报-学习备份-${day}.json`;
  if (Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({ path: filename, data: text, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: '保存词汇日报学习备份', files: [result.uri] });
  } else {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
}
