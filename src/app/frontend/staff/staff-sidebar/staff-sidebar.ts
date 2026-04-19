import { Component, OnInit, PLATFORM_ID, Inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { OfflineSyncService } from '../../../offline-sync.service';
import { LanguageService } from '../../../shared/language.service';
import { FontSizeService } from '../../../shared/font-size.service';

@Component({
  selector: 'app-staff-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './staff-sidebar.html',
  styleUrl: './staff-sidebar.css'
})
export class StaffSidebar implements OnInit {
  isCollapsed = false;
  userRoles: string[] = [];
  userName: string = '';
  
  // Offline State Trackers
  isOnline = signal<boolean>(true);
  pendingCount = signal<number>(0);

  constructor(
    private router: Router,
    private offlineSync: OfflineSyncService,
    public langService: LanguageService,
    public fontSizeService: FontSizeService,
    @Inject(PLATFORM_ID) private platformId: Object // Injected to check for browser environment
  ) {}

  t(key: string): string {
    return this.langService.translate(key);
  }

  setLang(lang: string) {
    this.langService.setLanguage(lang);
  }

  zoomIn() {
    this.fontSizeService.increase();
  }

  zoomOut() {
    this.fontSizeService.decrease();
  }

  ngOnInit() {
    // Only access localStorage if running in the browser
    if (isPlatformBrowser(this.platformId)) {
      this.isOnline.set(navigator.onLine);
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));

      // Refresh pending count for visual feedback
      setInterval(() => this.checkPendingCount(), 3000);
      this.checkPendingCount();

      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          this.userName = user.name;
          
          // Convert roles to a flat array of lowercase strings
          const rawRoles = typeof user.role === 'string' ? user.role.split(',') : (Array.isArray(user.role) ? user.role : [user.role]);
          this.userRoles = rawRoles.map((r: string) => r ? r.trim().toLowerCase() : '');
        } catch (e) {
          console.error("Error parsing user data from sessionStorage", e);
        }
      }
    }
  }

  async checkPendingCount() {
    if (isPlatformBrowser(this.platformId)) {
      try {
        const count = await this.offlineSync.offlineLeaves.count();
        this.pendingCount.set(count);
      } catch (e) { /* DB not ready */ }
    }
  }

  async viewOfflineQueue() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const leafTable = this.offlineSync.table('offlineLeaves');
      if (!leafTable) {
        alert("⚠️ Offline queue table not found.");
        return;
      }

      const leaves = await leafTable.toArray();
      if (!leaves || leaves.length === 0) {
        alert("✅ Your Offline Sync Queue is empty.");
      } else {
        const count = leaves.length;
        if (confirm(`🛑 You have ${count} pending applications.\n\nDo you want to DELETE them all?\n(Click 'Cancel' if you'd rather try to SYNC.)`)) {
          // DELETE PATH
          if (confirm("Permanently delete local queue?")) {
            await this.offlineSync.clearQueue();
            this.checkPendingCount();
            alert("🗑️ Queue cleared.");
          }
        } else {
          // SYNC PATH
          if (confirm(`Attempt to SYNC these ${count} records?`)) {
            alert("🔄 Attempting manual sync...");
            await this.offlineSync.syncNow();
            this.checkPendingCount();
          }
        }
      }
    } catch (err: any) {
      console.error("[ELMS DB ERROR]:", err);
      const errorMsg = err?.message || JSON.stringify(err) || "Unknown Error";
      alert("❌ Error reading local database:\n" + errorMsg);
    }
  }

  // Case-insensitive check for HOD or hod
  isHOD(): boolean {
    return this.userRoles.includes('hod');
  }

  toggleSidebar() {
    this.isCollapsed = !this.isCollapsed;
  }

  logout() {
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.removeItem('user');
    }
    this.router.navigate(['/login']);
  }
}
