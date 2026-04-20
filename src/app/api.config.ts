import { InjectionToken } from '@angular/core';

/** Returns true when running in the packaged Electron desktop app. */
export function isElectronApp(): boolean {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  return protocol === 'file:' || protocol === 'app:' || (window as any).process?.type === 'renderer';
}

/**
 * Base URL for /api calls.
 * - Electron desktop: 'http://127.0.0.1:5789' (backend spawned by Electron)
 * - Browser dev mode: '' (Angular proxy forwards /api → localhost:5000)
 */
export function getApiBase(): string {
  return isElectronApp() ? 'http://127.0.0.1:5789' : '';
}

/**
 * Base URL specifically for /uploads file links.
 * Same logic — desktop points directly to backend, browser uses the proxy.
 */
export function getUploadBase(): string {
  return isElectronApp() ? 'http://127.0.0.1:5789' : '';
}

export const API_BASE = getApiBase();
export const UPLOAD_BASE = getUploadBase();
