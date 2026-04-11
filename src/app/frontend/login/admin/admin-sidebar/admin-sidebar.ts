import { Component, Input, Inject, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { OfflineSyncService } from '../../../../offline-sync.service';
import { signal } from '@angular/core';

@Component({
  selector: 'app-admin-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './admin-sidebar.html',
  styleUrl: './admin-sidebar.css',
})
export class AdminSidebar {
  isCollapsed = false;
  offlineCount = signal(0);
  isOnline = signal(true);

  constructor(
    private router: Router,
    private http: HttpClient,
    private offlineSync: OfflineSyncService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { 
    if (isPlatformBrowser(this.platformId)) {
      this.isOnline.set(navigator.onLine);
      setInterval(async () => {
        try {
          const count = await this.offlineSync.offlineLeaves.count();
          this.offlineCount.set(count);
          this.isOnline.set(navigator.onLine);
        } catch (e) {}
      }, 2000);
    }
  }

  async viewOfflineQueue() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      // Ensure we have a valid reference to the table
      const leafTable = this.offlineSync.table('offlineLeaves');
      if (!leafTable) {
        alert("⚠️ Local database table 'offlineLeaves' not found.");
        return;
      }

      const leaves = await leafTable.toArray();
      
      if (!leaves || leaves.length === 0) {
        alert("✅ Your Offline Sync Queue is empty.");
      } else {
        const count = leaves.length;
        if (confirm(`🛑 You have ${count} applications pending locally.\n\nDo you want to DELETE these records permanently?\n(Click 'Cancel' if you'd rather try to SYNC them.)`)) {
          // DELETE PATH
          if (confirm("FINAL WARNING: Are you sure you want to permanently DELETE these offline records?")) {
            await this.offlineSync.clearQueue();
            alert("🗑️ Offline queue cleared successfully.");
          }
        } else {
          // SYNC PATH (User clicked Cancel/No to delete)
          if (confirm(`Do you want to attempt to SYNC these ${count} records now?`)) {
            alert("🔄 Attempting manual sync...");
            await this.offlineSync.syncNow();
          }
        }
      }
    } catch (err: any) {
      console.error("[ELMS DB ERROR]:", err);
      // Show more helpful error info
      const errorMsg = err?.message || JSON.stringify(err) || "Unknown Error";
      alert("❌ Error reading local database:\n" + errorMsg);
    }
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }

  logout() {
    console.log("Admin logged out");
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.removeItem('user'); // Always good to clear just in case
    }
    this.router.navigate(['/login']);
  }

  async reconcileCloud() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!confirm("🔄 Do you want to check for missing data in the Cloud and sync it to your local machine (Data Reconciliation)?")) return;
    
    try {
      this.isOnline.set(navigator.onLine);
      if (!this.isOnline()) {
          alert("⚠️ You must be ONLINE to reconcile with the Cloud.");
          return;
      }

      alert("🔍 Checking Cloud parity... This might take a few seconds.");
      
      this.http.post<any>('/api/admin/reconcile', {}).subscribe({
        next: (data) => {
          if (data.success) {
            alert("✅ Reconciliation complete! If any missing records were found, they have been downloaded. Refreshing dashboard...");
            window.location.reload();
          } else {
            alert("❌ Reconciliation failed: " + (data.error || "Unknown error"));
          }
        },
        error: (err) => {
          console.error(err);
          alert("❌ Error connecting to server. Please ensure the backend is running.");
        }
      });
    } catch (err) {
      console.error(err);
      alert("❌ Critical error during reconciliation.");
    }
  }
}
