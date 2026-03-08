import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, Inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-dashbored',
  standalone: true,
  imports: [CommonModule, AdminSidebar],
  templateUrl: './admin-dashbored.html',
  styleUrl: './admin-dashbored.css'
})
export class AdminDashbored implements OnInit {
  user: any = null;
  stats = {
    totalLeaves: 0,
    pendingLeaves: 0,
    hodApprovedLeaves: 0,
    finalApprovedLeaves: 0,
    rejectedLeaves: 0
  };

  staffStats = {
    totalStaff: 0,
    departments: {} as Record<string, number>
  };

  allLeaves: any[] = [];
  allStaff: any[] = [];
  allLeaveTypes: any[] = [];

  // Institution-wide totals
  institutionLeaveBalances: { [key: string]: { remaining: number, total: number } } = {};
  // PERSONAL Admin Balance (Like Staff Dashboard)
  adminLeaveBalances: { [key: string]: number } = {};

  balancesLoaded = false;

  @ViewChild('leaveChart') leaveChartRef!: ElementRef;
  @ViewChild('staffChart') staffChartRef!: ElementRef;

  leaveChart: any;
  staffChart: any;

  constructor(
    private router: Router,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        this.user = JSON.parse(savedUser);
      }
    }
    this.fetchData();
  }

  fetchData() {
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe({
      next: (leaves) => {
        this.allLeaves = leaves;
        this.calculateLeaveStats();
        this.processAllBalances();
      }
    });

    this.http.get<any[]>('http://localhost:5000/api/staff').subscribe({
      next: (staff) => {
        this.allStaff = staff;
        this.calculateStaffStats();
        this.processAllBalances();
      }
    });

    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (types) => {
        // Filter unique leave types to prevent duplicated quota cards on the dashboard 
        // when a leave type is assigned to multiple departments/categories
        const uniqueTypesMap = new Map<string, any>();
        types.forEach(t => {
          const uName = (t.leave_name || '').toUpperCase();
          const limit = Number(t.total_yearly_limit) || 0;
          if (!uniqueTypesMap.has(uName)) {
            uniqueTypesMap.set(uName, { ...t, leave_name: uName, total_yearly_limit: limit });
          } else {
            const existing = uniqueTypesMap.get(uName);
            if (limit > existing.total_yearly_limit) { existing.total_yearly_limit = limit; }
          }
        });

        this.allLeaveTypes = Array.from(uniqueTypesMap.values());
        this.processAllBalances();
      }
    });
  }

  processAllBalances() {
    if (!this.allLeaves.length || !this.allStaff.length || !this.allLeaveTypes.length) return;

    this.allLeaveTypes.forEach(type => {
      const typeName = type.leave_name || '';

      // 1. Calculate INSTITUTION wide balance
      const totalInstQuota = (Number(type.total_yearly_limit) || 0) * this.allStaff.length;
      const instUsed = this.allLeaves.filter(l => {
        const lType = (l['Type of Leave'] || l.Type_of_Leave || '').toLowerCase();
        return lType === typeName.toLowerCase() && ['Approved', 'Final Approved', 'HOD Approved'].includes(l.Status);
      }).reduce((acc, curr) => acc + (Number(curr['Total Days']) || Number(curr.Total_Days) || 0), 0);

      this.institutionLeaveBalances[typeName] = {
        remaining: Math.max(0, totalInstQuota - instUsed),
        total: totalInstQuota
      };

      // 2. Calculate PERSONAL Admin balance (Using same data)
      if (this.user?.empCode) {
        const myUsed = this.allLeaves.filter(l => {
          const isMine = l.Emp_CODE?.toString() === this.user.empCode.toString();
          const lType = (l['Type of Leave'] || l.Type_of_Leave || '').toLowerCase();
          return isMine && lType === typeName.toLowerCase() && ['Approved', 'Final Approved', 'HOD Approved'].includes(l.Status);
        }).reduce((acc, curr) => acc + (Number(curr['Total Days']) || Number(curr.Total_Days) || 0), 0);

        this.adminLeaveBalances[typeName] = Math.max(0, (type.total_yearly_limit || 0) - myUsed);
      }
    });

    this.balancesLoaded = true;
    this.cdr.detectChanges();
  }

  calculateLeaveStats() {
    this.stats = {
      totalLeaves: this.allLeaves.length,
      pendingLeaves: this.allLeaves.filter(l => l.Status === 'Pending').length,
      hodApprovedLeaves: this.allLeaves.filter(l => l.Status === 'HOD Approved').length,
      finalApprovedLeaves: this.allLeaves.filter(l => l.Status === 'Approved' || l.Status === 'Final Approved').length,
      rejectedLeaves: this.allLeaves.filter(l => l.Status === 'Rejected').length
    };
    setTimeout(() => this.renderLeaveChart(), 0);
  }

  calculateStaffStats() {
    this.staffStats.totalStaff = this.allStaff.length;
    const depts: Record<string, number> = {};
    this.allStaff.forEach(s => {
      const d = s.department || s.dept_code || 'Unknown Dept';
      depts[d] = (depts[d] || 0) + 1;
    });
    this.staffStats.departments = depts;
    setTimeout(() => this.renderStaffChart(), 0);
  }

  // --- Chart Render Methods ---
  renderLeaveChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.leaveChartRef) return;

    if (this.leaveChart) {
      this.leaveChart.destroy();
    }

    const ctx = this.leaveChartRef.nativeElement.getContext('2d');
    this.leaveChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Pending', 'HOD Approved', 'Final Approved', 'Rejected'],
        datasets: [{
          data: [
            this.stats.pendingLeaves,
            this.stats.hodApprovedLeaves,
            this.stats.finalApprovedLeaves,
            this.stats.rejectedLeaves
          ],
          backgroundColor: ['#ffc107', '#17a2b8', '#198754', '#dc3545'],
          borderWidth: 0,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          animateScale: true,
          animateRotate: true,
          duration: 1500,
          easing: 'easeOutQuart'
        },
        plugins: {
          legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 10 } }
        }
      }
    });
  }

  renderStaffChart() {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.staffChartRef) return;

    if (this.staffChart) {
      this.staffChart.destroy();
    }

    const ctx = this.staffChartRef.nativeElement.getContext('2d');
    const labels = Object.keys(this.staffStats.departments);
    const data = Object.values(this.staffStats.departments);

    this.staffChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Staff Count',
          data: data,
          backgroundColor: '#0d6efd',
          borderRadius: 4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 1500,
          easing: 'easeInOutQuart'
        },
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { stepSize: 1 }
          }
        }
      }
    });
  }

  logout() {
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}