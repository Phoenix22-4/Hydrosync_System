import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function isMobileBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  if (isNativeApp()) return false;
  return /Android|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

export function shouldForceNativeUserFlow(): boolean {
  return isMobileBrowser();
}
