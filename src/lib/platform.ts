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

// Detect if running as PWA (standalone mode)
export function isPWA(): boolean {
  if (typeof window === 'undefined') return false;
  // Check for standalone display mode
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
  // iOS Safari standalone
  const isIOSStandalone = (navigator as any).standalone === true;
  return isStandalone || isIOSStandalone;
}

// Check if should skip landing page (native app or PWA)
export function shouldSkipLandingPage(): boolean {
  return isNativeApp() || isPWA();
}

// Get the base URL for API calls (Netlify functions)
// Always use the full Netlify URL where the function is deployed
const NETLIFY_SITE_URL = 'https://vantixa2228.netlify.app';

export function getApiBaseUrl(): string {
  return NETLIFY_SITE_URL;
}
