import { HttpInterceptorFn } from '@angular/common/http';
import { API_BASE } from './api.config';
import { timeout } from 'rxjs/operators';

/**
 * Automatically prefixes all relative API calls with the backend URL
 * when running inside Electron.
 * Also enforces a strict global timeout so pages NEVER get stuck in loading state.
 */
export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  let requestHandle = req;

  if (API_BASE && (req.url.startsWith('/api') || req.url.startsWith('/uploads'))) {
    requestHandle = req.clone({ url: `${API_BASE}${req.url}` });
  }
  
  // 10-second global timeout prevents any Angular component from hanging forever
  return next(requestHandle).pipe(timeout(10000));
};
