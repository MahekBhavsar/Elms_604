import { Component, OnInit, PLATFORM_ID, Inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { OfflineSyncService } from '../../../offline-sync.service';

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
    @Inject(PLATFORM_ID) private platformId: Object // Injected to check for browser environment
  ) {}

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
          const rawRoles = Array.isArray(user.role) ? user.role : [user.role];
          this.userRoles = rawRoles.map((r: string) => r ? r.toLowerCase() : '');
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
