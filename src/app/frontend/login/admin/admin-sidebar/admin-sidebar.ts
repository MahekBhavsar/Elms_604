import { Component, Input, Inject, PLATFORM_ID } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
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
}
