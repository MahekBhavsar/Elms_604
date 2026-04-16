import { InjectionToken } from '@angular/core';

// Detect if running inside Electron (packaged desktop app)
function getApiBase(): string {
  // If we're in Electron or file:// protocol, use the full backend URL
  if (typeof window !== 'undefined') {
    const protocol = window.location.protocol;
    const isElectron = protocol === 'file:' || protocol === 'app:' || (window as any).process?.type === 'renderer';
    
    if (isElectron) {
      return 'http://127.0.0.1:5789';
    }
  }
  // In browser dev mode, the Angular proxy handles /api -> 127.0.0.1:5789
  return '';
}

export const API_BASE = getApiBase();
