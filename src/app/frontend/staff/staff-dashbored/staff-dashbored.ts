import { Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-staff-dashbored',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './staff-dashbored.html',
  styleUrl: './staff-dashbored.css'
})
export class StaffDashbored implements OnInit {
  user: any = null;
  leaveTypes: any[] = [];
  myLeaves: any[] = [];
  leaveBalances: { [key: string]: number } = {};

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        this.user = JSON.parse(savedUser);
        this.fetchData();
      }
    }
  }

  fetchData() {
    // 1. Fetch Yearly Limits (cl/sl: 12)
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (types) => {
        this.leaveTypes = types;
        this.calculateBalances();
      }
    });

    // 2. Fetch Personal history
    if (this.user?.empCode) {
      this.http.get<any[]>(`http://localhost:5000/api/leaves/staff/${this.user.empCode}`).subscribe({
        next: (data) => {
          this.myLeaves = data;
          this.calculateBalances();
        }
      });
    }
  }

  calculateBalances() {
    if (!this.leaveTypes.length) return;

    this.leaveTypes.forEach(type => {
      const used = this.myLeaves
        .filter(l => {
          // Handles keys with spaces (CSV) and underscores (Manual)
          const typeOfLeave = (l['Type of Leave'] || l.Type_of_Leave || "").toLowerCase();
          const status = l.Status || "";
          
          return typeOfLeave === type.leave_name?.toLowerCase() && 
                 (status === 'Approved' || status === 'Final Approved' || status === 'HOD Approved');
        })
        .reduce((acc, curr) => {
          // Extracts days using both formats
          const days = Number(curr['Total Days']) || Number(curr.Total_Days) || 0;
          return acc + days;
        }, 0);

      const remaining = type.total_yearly_limit - used;
      this.leaveBalances[type.leave_name] = remaining > 0 ? remaining : 0;
    });
    
    this.cdr.detectChanges(); 
  }

  isHOD(): boolean {
    return this.user?.role?.toUpperCase() === 'HOD';
  }
}