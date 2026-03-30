import { HttpInterceptorFn } from '@angular/common/http';
import { API_BASE } from './api.config';

/**
 * Automatically prefixes all relative API calls with the backend URL
 * when running inside Electron (packaged desktop app).
 * In browser dev mode, this does nothing (the proxy handles it).
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  // Only modify relative URLs (starting with /api)
  if (API_BASE && req.url.startsWith('/api')) {
    const modifiedReq = req.clone({ url: `${API_BASE}${req.url}` });
    return next(modifiedReq);
  }
  return next(req);
};
