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

  constructor(
    private router: Router,
    private offlineSync: OfflineSyncService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { 
    if (isPlatformBrowser(this.platformId)) {
      setInterval(async () => {
        try {
          const count = await this.offlineSync.offlineLeaves.count();
          this.offlineCount.set(count);
        } catch (e) {}
      }, 2000);
    }
  }

  async viewOfflineQueue() {
    if (!isPlatformBrowser(this.platformId)) return;
    try {
      const leaves = await this.offlineSync.offlineLeaves.toArray();
      if (leaves.length === 0) {
        alert("✅ Your Offline Queue is currently empty.\nAll data is perfectly synced with MongoDB!");
      } else {
        let message = `🛑 You have ${leaves.length} applications securely waiting in the Local Database!\n\n`;
        leaves.forEach((l: any, idx: number) => {
          message += `${idx + 1}. Sr: ${l.payload.sr_no} | Name: ${l.payload.Name} | Leave: ${l.payload.Type_of_Leave} (${l.payload.Total_Days} days)\n`;
        });
        message += "\nThese will automatically sync the invisible second you reconnect to Wi-Fi.";
        alert(message);
      }
    } catch (err) {
      alert("Error reading local database.");
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