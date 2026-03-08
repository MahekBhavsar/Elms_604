import { 
  Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef, 
  ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone 
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';

Chart.register(...registerables);

@Component({
  selector: 'app-staff-dashbored',
  standalone: true,
  imports: [CommonModule, StaffSidebar],
  templateUrl: './staff-dashbored.html',
  styleUrl: './staff-dashbored.css'
})
export class StaffDashbored implements OnInit, AfterViewInit, OnDestroy {
  user: any = null;
  leaveTypes: any[] = [];
  myLeaves: any[] = [];
  allLeaves: any[] = [];
  leaveBalances: { [key: string]: number } = {};
  quotaCards: Array<{ name: string; limit: number; remaining: number; percent: number }> = [];
  leaveStats = { approved: 0, pending: 0, rejected: 0 };
  
  dataReady = false;
  private viewReady = false;

  @ViewChild('statusChart') statusChartRef!: ElementRef;
  @ViewChild('leaveTypeChart') leaveTypeChartRef!: ElementRef;
  
  statusChart: any;
  leaveTypeChart: any;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
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

  ngAfterViewInit() {
    this.viewReady = true;
    // Attempt render in case data arrived before view was ready
    this.tryRenderCharts();
  }

  ngOnDestroy() {
    if (this.statusChart) this.statusChart.destroy();
    if (this.leaveTypeChart) this.leaveTypeChart.destroy();
  }

  fetchData() {
    const leaveTypesReq = this.http.get<any[]>('http://localhost:5000/api/leave-types');
    const leavesReq = this.user?.empCode
      ? this.http.get<any[]>(`http://localhost:5000/api/leaves/staff/${this.user.empCode}`)
      : of([]);

    forkJoin([leaveTypesReq, leavesReq]).subscribe({
      next: ([types, leaves]) => {
        const uniqueTypesMap = new Map<string, any>();
        (types || []).forEach(type => {
          const leaveName = this.getLeaveTypeName(type);
          const limit = this.getYearlyLimit(type);
          if (!leaveName) return;
          
          if (!uniqueTypesMap.has(leaveName)) {
            uniqueTypesMap.set(leaveName, { ...type, leave_name: leaveName, total_yearly_limit: limit });
          } else {
            const existing = uniqueTypesMap.get(leaveName);
            if (limit > existing.total_yearly_limit) {
              existing.total_yearly_limit = limit;
            }
          }
        });

        this.leaveTypes = Array.from(uniqueTypesMap.values());
        this.allLeaves = leaves || [];
        this.myLeaves = [...this.allLeaves];
        
        this.calculateBalances();
        this.calculateLeaveStats();
        this.buildQuotaCards();
        
        this.dataReady = true;
        this.cdr.detectChanges();
        this.tryRenderCharts();
      },
      error: (err) => console.error("Error loading dashboard data:", err)
    });
  }

  calculateBalances() {
    this.leaveTypes.forEach(type => {
      const typeName = this.getLeaveTypeName(type).toLowerCase();
      const myUsed = this.allLeaves.filter(l => {
        const isMine = l.Emp_CODE?.toString() === this.user?.empCode?.toString();
        const lType = this.getLeaveTypeName(l).toLowerCase();
        const status = this.normalizeStatus(l.Status);
        return isMine && lType === typeName && ['approved', 'final approved', 'hod approved'].includes(status);
      }).reduce((acc, curr) => acc + (Number(curr['Total Days']) || Number(curr.Total_Days) || 0), 0);

      const limit = this.getYearlyLimit(type);
      this.leaveBalances[type.leave_name] = Math.max(0, limit - myUsed);
    });
  }

  buildQuotaCards() {
    this.quotaCards = this.leaveTypes.map(type => {
      const name = this.getLeaveTypeName(type);
      const limit = this.getYearlyLimit(type);
      const remaining = Number(this.leaveBalances[name] ?? limit) || 0;
      const percent = limit > 0 ? (remaining / limit) * 100 : 0;
      return { name, limit, remaining, percent };
    });
  }

  calculateLeaveStats() {
    this.leaveStats = {
      approved: this.myLeaves.filter(l => ['approved', 'final approved', 'hod approved'].includes(this.normalizeStatus(l.Status))).length,
      pending: this.myLeaves.filter(l => this.normalizeStatus(l.Status) === 'pending').length,
      rejected: this.myLeaves.filter(l => this.normalizeStatus(l.Status) === 'rejected').length
    };
  }

  getTotalStats(): number {
    return this.leaveStats.approved + this.leaveStats.pending + this.leaveStats.rejected;
  }

  getLeaveTypeName(item: any): string {
    return String(item?.leave_name || item?.['Type of Leave'] || item?.Type_of_Leave || '').trim().toUpperCase();
  }

  getYearlyLimit(item: any): number {
    return Number(item?.total_yearly_limit ?? item?.total_yearly ?? item?.yearly_limit ?? 0) || 0;
  }

  normalizeStatus(value: any): string {
    return String(value || '').trim().toLowerCase();
  }

  private tryRenderCharts() {
    if (!isPlatformBrowser(this.platformId) || !this.dataReady || !this.viewReady) return;

    // Use NgZone to run Chart.js outside of Angular for better refresh performance
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        this.renderStatusChart();
        this.renderLeaveTypeChart();
      }, 0);
    });
  }

  renderStatusChart() {
    if (!this.statusChartRef) return;
    if (this.statusChart) this.statusChart.destroy();

    const ctx = this.statusChartRef.nativeElement.getContext('2d');
    this.statusChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Approved', 'Pending', 'Rejected'],
        datasets: [{
          data: [this.leaveStats.approved, this.leaveStats.pending, this.leaveStats.rejected],
          backgroundColor: ['#198754', '#ffc107', '#dc3545'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  renderLeaveTypeChart() {
    if (!this.leaveTypeChartRef) return;
    if (this.leaveTypeChart) this.leaveTypeChart.destroy();

    const labels = this.quotaCards.map(c => c.name);
    const remaining = this.quotaCards.map(c => c.remaining);
    const used = this.quotaCards.map(c => Math.max(0, c.limit - c.remaining));

    const ctx = this.leaveTypeChartRef.nativeElement.getContext('2d');
    this.leaveTypeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Used', data: used, backgroundColor: '#0d6efd', borderRadius: 6 },
          { label: 'Remaining', data: remaining, backgroundColor: '#20c997', borderRadius: 6 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
      }
    });
  }
}