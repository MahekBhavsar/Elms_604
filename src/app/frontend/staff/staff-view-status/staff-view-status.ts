import { Component, OnInit, PLATFORM_ID, Inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { DisplayDatePipe } from '../../../shared/pipes/display-date.pipe';

@Component({
  selector: 'app-staff-view-status',
  standalone: true,
  imports: [CommonModule, StaffSidebar, DisplayDatePipe],
  templateUrl: './staff-view-status.html',
  styleUrl: './staff-view-status.css',
})
export class StaffViewStatus implements OnInit {
  myLeaves = signal<any[]>([]); // Using Signals for better performance/SSR stability
  userName = signal<string>('');
  myBalances = signal<any[]>([]);
  activeSession = signal<string>('2025-26');

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object // Inject Platform ID to check for Browser
  ) {}

  ngOnInit() {
    // Only run this code if we are in the browser
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        this.userName.set(user.name);
        
        // Use the exact key from the login response (empCode)
        if (user.empCode) {
          this.fetchMyStatus(user.empCode);
        } else {
          console.warn("[StaffViewStatus] ERROR: No empCode found in session user object.");
        }
      }
    }
  }

  fetchMyBalances(empCode: number) {
    this.http.get<any>(`http://localhost:5000/api/admin/employee-results/${empCode}`)
      .subscribe({
        next: (res) => {
          this.myBalances.set(res.balances);
          this.activeSession.set(res.sessionName);
        },
        error: (err) => console.error("Error fetching balances:", err)
      });
  }

  fetchMyStatus(empCode: number) {
    this.http.get<any[]>(`http://localhost:5000/api/leaves/staff/${empCode}`)
      .subscribe({
        next: (res) => {
          this.myLeaves.set(res); 
        },
        error: (err) => console.error("Error fetching leave history:", err)
      });
  }

  getStatusBadge(status: string): string {
    switch (status) {
      case 'Approved': return 'bg-success shadow-sm text-white';
      case 'Rejected': return 'bg-danger shadow-sm text-white';
      case 'HOD Approved': return 'bg-info text-dark shadow-sm';
      default: return 'bg-warning text-dark shadow-sm';
    }
  }
}
