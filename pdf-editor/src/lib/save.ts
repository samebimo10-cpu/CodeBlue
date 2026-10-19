import { Capacitor } from '@capacitor/core';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/**
 * Saves a file in the way that works best on each platform:
 * - Android/iOS app: writes to the app's Documents folder (visible in the iOS
 *   Files app) and opens the share sheet so it can go to Files, Drive, WhatsApp, print…
 * - Installed web app on a phone: uses the share sheet when available.
 * - Desktop browsers: a normal download.
 */
export async function saveFile(blob: Blob, filename: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const data = await blobToBase64(blob);
    const dir = Capacitor.getPlatform() === 'ios' ? Directory.Documents : Directory.Cache;
    const res = await Filesystem.writeFile({ path: filename, data, directory: dir, recursive: true });
    try {
      await Share.share({ title: filename, url: res.uri, dialogTitle: 'Save or send ' + filename });
    } catch {
      /* user closed the share sheet */
    }
    return Capacitor.getPlatform() === 'ios' ? 'Saved to Files › InkDesk PDF' : 'Ready to save or share';
  }

  const file = new File([blob], filename, { type: blob.type });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'Shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'Cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return 'Downloaded ' + filename;
}
