import { InjectionToken } from '@angular/core';

// Detect if running inside Electron (packaged desktop app)
function getApiBase(): string {
  // If we're in Electron or file:// protocol, use the full backend URL
  if (typeof window !== 'undefined') {
    const isElectron = window.location.protocol === 'file:' || 
                       (window as any).process?.type === 'renderer';
    if (isElectron) {
      return 'http://localhost:5000';
    }
  }
  // In browser dev mode, the Angular proxy handles /api -> localhost:5000
  return '';
}

export const API_BASE = getApiBase();
