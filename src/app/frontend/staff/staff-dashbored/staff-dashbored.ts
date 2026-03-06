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
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (types) => {
        this.leaveTypes = types;
        this.calculateBalances();
      }
    });

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
        .filter(l => 
          l.Type_of_Leave?.toLowerCase() === type.leave_name?.toLowerCase() && 
          (l.Status === 'Approved' || l.Status === 'HOD Approved')
        )
        .reduce((acc, curr) => acc + (Number(curr.Total_Days) || 0), 0);

      this.leaveBalances[type.leave_name] = type.total_yearly_limit - used;
    });
    this.cdr.detectChanges(); // Fixes ExpressionChangedAfterItHasBeenCheckedError
  }

  isHOD(): boolean {
    return this.user?.role?.toUpperCase() === 'HOD';
  }
}