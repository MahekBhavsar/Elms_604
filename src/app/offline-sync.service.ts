import { Injectable, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import Dexie, { Table } from 'dexie';
import { firstValueFrom } from 'rxjs';

export interface OfflineLeave {
  id?: number;
  payload: any;
  fileBlob?: Blob | null;
  fileName?: string;
  fileType?: string;
  createdAt: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineSyncService extends Dexie {
  offlineLeaves!: Table<OfflineLeave, number>;

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    super('ELMSDatabase');
    if (isPlatformBrowser(this.platformId)) {
      this.version(1).stores({
        offlineLeaves: '++id, createdAt'
      });
      
      // Auto-trigger sync when the internet reconnects globally!
      window.addEventListener('online', () => this.syncNow());
      setTimeout(() => this.syncNow(), 3000);
    }
  }

  // 1. Queue Leave Offline
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
      return true;
    } catch (err) {
      console.error('Offline DB save error:', err);
      return false;
    }
  }

  // 2. The Bi-Directional Synchronizer
  async syncNow() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!navigator.onLine) return; // Prevent sync if still offline

    try {
      const pendingLeaves = await this.offlineLeaves.orderBy('createdAt').toArray();
      if (pendingLeaves.length === 0) return;

      console.log(`[ELMS Sync] Found ${pendingLeaves.length} offline leave applications in Outbox. Starting upload to MongoDB...`);

      for (let record of pendingLeaves) {
        // Reconstruct exact payload format expected by Mongoose backend
        const formData = new FormData();
        Object.keys(record.payload).forEach(key => {
          formData.append(key, record.payload[key]);
        });

        if (record.fileBlob && record.fileName) {
          const fileToUpload = new File([record.fileBlob], record.fileName, { type: record.fileType || 'application/pdf' });
          formData.append('document', fileToUpload);
        }

        try {
          // Push securely to MongoDB Server
          await firstValueFrom(this.http.post('http://localhost:5000/api/leaves/apply', formData));
          
          // Clear it from the local queue on Success
          if (record.id) {
            await this.offlineLeaves.delete(record.id);
          }
          console.log(`[ELMS Sync] Uploaded leave task (Sr: ${record.payload.sr_no}) fully into MongoDB Server successfully!`);
        } catch (err) {
          console.error(`[ELMS Sync] Failed to upload leave queue... stopping background worker until next connection check.`, err);
          break; // Stop loop and try again later if the server rejected or crashed
        }
      }
    } catch (err) {
      console.error('[ELMS Sync] Fatal error syncing offline items', err);
    }
  }
}
