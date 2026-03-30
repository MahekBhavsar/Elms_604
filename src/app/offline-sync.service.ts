import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import Dexie, { Table } from 'dexie';
import { firstValueFrom, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';

export interface OfflineLeave {
  id?: number;
  payload: any;
  fileBlob?: Blob | null;
  fileName?: string;
  fileType?: string;
  createdAt: number;
}

export interface CachedData {
  key: string; // e.g., 'leaves_101', 'balances_101'
  data: any;
  updatedAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService extends Dexie {
  offlineLeaves!: Table<OfflineLeave, number>;
  cachedData!: Table<CachedData, string>;

  private statusPollInterval: any;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    super('ELMSDatabase');
    if (isPlatformBrowser(this.platformId)) {
      this.version(2).stores({
        offlineLeaves: '++id, createdAt',
        cachedData: 'key'
      });
      
      this.requestNotificationPermission();

      // Passive Poller: Keeps track of HOD/Admin decisions on your leaves
      // This is safe even in manual sync mode as it only performs READ operations.
      setTimeout(() => {
        this.startStatusPoller();
      }, 3000);
    }
  }

  // --- MANUAL SYNC CONTROL ---
  async clearQueue(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      await this.offlineLeaves.clear();
      console.log('🗑️ Offline queue successfully cleared.');
    } catch (err) {
      console.error('❌ Failed to clear offline queue:', err);
    }
  }

  private startStatusPoller() {
    if (!isPlatformBrowser(this.platformId)) return;
    
    // Poll every 30 seconds for status updates
    this.statusPollInterval = setInterval(() => this.checkStatusUpdates(), 30000);
    this.checkStatusUpdates(); // Initial check
  }

  private async checkStatusUpdates() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!navigator.onLine) {
       // If offline, we can still poll if the backend is local (localhost:5000)
       // But if it's a remote backend, we skip to save battery/network
       // Let's assume most users have local backend in this hybrid app
    }

    const savedUser = sessionStorage.getItem('user');
    if (!savedUser) return;

    try {
      const user = JSON.parse(savedUser);
      const empCode = user.empCode || user['Employee Code'];
      if (!empCode) return;

      this.http.get<any[]>(`/api/leaves/staff/${empCode}`).subscribe({
        next: (leaves) => {
          if (!leaves || !Array.isArray(leaves)) return;

          const storageKey = `elms_notified_statuses_${empCode}`;
          const previousStatusesStr = localStorage.getItem(storageKey);
          const previousStatuses: { [id: string]: string } = previousStatusesStr ? JSON.parse(previousStatusesStr) : {};
          
          const currentStatuses: { [id: string]: string } = {};
          let hasChange = false;

          leaves.forEach(l => {
            const leaveId = l._id || l.id;
            currentStatuses[leaveId] = l.Status;
            
            // Notify if status changed AND it's not a fresh 'Pending'
            const oldStatus = previousStatuses[leaveId];
            if (oldStatus && oldStatus !== l.Status && !['Pending', 'Offline Sync Pending'].includes(l.Status)) {
              this.showStatusNotification(l);
              hasChange = true;
            }
          });

          // Only update storage if we actually have data (prevents clearing on error)
          if (Object.keys(currentStatuses).length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(currentStatuses));
          }
        },
        error: (err) => {
          // Silent error ok for polling
        }
      });
    } catch (e) {
      console.error("[OfflineSync] Poller Error:", e);
    }
  }

  private showStatusNotification(l: any) {
    const type = (l['Type of Leave'] || l.Type_of_Leave || 'Leave').toUpperCase();
    const status = l.Status;
    let title = '';
    let body = '';

    if (status === 'Approved' || status === 'Final Approved') {
      title = '✅ Leave Approved';
      body = `Your ${type} request from ${l.From} to ${l.To} has been APPROVED.`;
    } else if (status === 'Rejected') {
      title = '❌ Leave Rejected';
      body = `Your ${type} request has been REJECTED. Reason: ${l.Reject_Reason || 'Not specified'}`;
    } else if (status === 'HOD Approved') {
      title = 'ℹ️ HOD Approved';
      body = `Your ${type} request is now approved by HOD and pending final admin review.`;
    }

    if (title) {
      this.showNotification(title, body);
    }
  }

  // --- Notification System ---

  private async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted') {
      await Notification.requestPermission();
    }
  }

  private showNotification(title: string, body: string, icon: string = '/icons/icon-72x72.png') {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon });
    }
  }

  // --- 1. VIEW CACHING (Allows Staff to see data offline) ---

  async saveToCache(key: string, data: any) {
    if (!isPlatformBrowser(this.platformId)) return;
    await this.cachedData.put({ key, data, updatedAt: Date.now() });
  }

  async getFromCache(key: string): Promise<any | null> {
    if (!isPlatformBrowser(this.platformId)) return null;
    const record = await this.cachedData.get(key);
    return record ? record.data : null;
  }

  // Wrapper for HTTP GET with caching
  getCachedObservable(url: string, cacheKey: string): Observable<any> {
    if (!navigator.onLine) {
       // Offline: Use Cache
       return new Observable(obs => {
         this.getFromCache(cacheKey).then(data => {
           if (data) obs.next(data);
           obs.complete();
         });
       });
    }

    // Online: Fetch from Central Server and update Cache
    return this.http.get(url).pipe(
      tap(data => this.saveToCache(cacheKey, data)),
      catchError(err => {
        console.warn(`[ELMS Sync] Server unreachable, trying local cache for ${cacheKey}`);
        return this.getFromCache(cacheKey);
      })
    );
  }

  // --- 2. OFFLINE SUBMISSION (Queue Leave Offline) ---

  async saveLeaveOffline(payload: any, file: File | null): Promise<boolean> {
    if (!isPlatformBrowser(this.platformId)) return false;
    
    let dbRecord: OfflineLeave = { payload, createdAt: Date.now() };

    if (file) {
      dbRecord.fileBlob = file;
      dbRecord.fileName = file.name;
      dbRecord.fileType = file.type;
    }

    try {
      await this.offlineLeaves.add(dbRecord);
      
      // Desktop Notification for Offline Save
      this.showNotification(
        'ELMS: Saved Offline', 
        `Your ${payload.Type_of_Leave} leave request has been saved locally. It will sync automatically when you reconnect.`
      );
      
      return true;
    } catch (err) {
      console.error('Offline DB save error:', err);
      return false;
    }
  }

  // --- 3. AUTO-SYNC SYNC (Push data to MongoDB when online) ---

  async syncNow() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!navigator.onLine) return;

    try {
      const pendingLeaves = await this.offlineLeaves.orderBy('createdAt').toArray();
      if (pendingLeaves.length === 0) return;

      console.log(`[ELMS Sync] Found ${pendingLeaves.length} offline leave applications. Syncing to central server...`);

      for (let record of pendingLeaves) {
        const formData = new FormData();
        Object.keys(record.payload).forEach(key => {
          formData.append(key, record.payload[key]);
        });

        if (record.fileBlob && record.fileName) {
          formData.append('document', record.fileBlob as Blob, record.fileName);
        }

        try {
          const apiUrl = '/api/leaves/apply'; 
          const response: any = await firstValueFrom(this.http.post(apiUrl, formData));
          
          if (record.id) {
            await this.offlineLeaves.delete(record.id);
          }
          
          this.showNotification(
            'ELMS: Synchronized', 
            `Leave application (Sr: ${record.payload.sr_no}) has been uploaded to the central server.`
          );
          
          console.log(`[ELMS Sync] Successfully synced leave (Sr: ${record.payload.sr_no}) to central server.`);
        } catch (err: any) {
          const errMsg = err.error?.error || err.error?.message || err.message || 'Unknown Server Error';
          console.error(`[ELMS Sync] Sync failed for record ${record.id}: ${errMsg}`, err);
          
          // Show alert for 400 Bad Request to help the user debug
          if (err.status === 400) {
            alert(`⚠️ Sync Failed (Sr: ${record.payload.sr_no}): ${errMsg}\n\nPlease check for overlapping dates or missing fields.`);
          }
          
          break; // Stop syncing the rest of the queue to keep order
        }
      }
    } catch (err) {
      console.error('[ELMS Sync] Fatal error during sync', err);
    }
  }

  async getQueue(): Promise<OfflineLeave[]> {
    if (!isPlatformBrowser(this.platformId)) return [];
    return await this.offlineLeaves.orderBy('createdAt').toArray();
  }
}
