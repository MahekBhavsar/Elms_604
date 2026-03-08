import { Component, OnInit, PLATFORM_ID, Inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule, isPlatformBrowser } from '@angular/common';

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

  constructor(
    private router: Router,
    @Inject(PLATFORM_ID) private platformId: Object // Injected to check for browser environment
  ) {}

  ngOnInit() {
    // Only access localStorage if running in the browser
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        try {
          const user = JSON.parse(savedUser);
          this.userName = user.name;
          
          // Convert roles to a flat array of lowercase strings
          const rawRoles = Array.isArray(user.role) ? user.role : [user.role];
          this.userRoles = rawRoles.map((r: string) => r ? r.toLowerCase() : '');
        } catch (e) {
          console.error("Error parsing user data from localStorage", e);
        }
      }
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
      localStorage.removeItem('user');
    }
    this.router.navigate(['/login']);
  }
}