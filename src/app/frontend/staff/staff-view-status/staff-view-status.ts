import { Component, OnInit, PLATFORM_ID, Inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, DatePipe, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { DisplayDatePipe } from '../../../shared/pipes/display-date.pipe';

@Component({
  selector: 'app-staff-view-status',
  standalone: true,
  imports: [CommonModule, DatePipe, UpperCasePipe, StaffSidebar, DisplayDatePipe],
  templateUrl: './staff-view-status.html',
  styleUrl: './staff-view-status.css',
})
export class StaffViewStatus implements OnInit {
  myLeaves = signal<any[]>([]); // Using Signals for better performance/SSR stability
  userName = signal<string>('');

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
        this.fetchMyStatus(user.empCode);
      }
    }
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
