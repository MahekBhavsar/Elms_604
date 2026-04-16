import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  /**
   * IMPORTANT:
   * To use the app WITHOUT installing MongoDB on Staff PCs:
   * 1. The Admin's PC must run the server (npm run dev).
   * 2. Find the Admin PC's Local IP (e.g., 192.168.1.10).
   * 3. Change 'localhost' below to that IP.
   */
  private readonly baseUrl = 'http://127.0.0.1:5789';

  getApiUrl(endpoint: string): string {
    return `${this.baseUrl}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}
