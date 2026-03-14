import {
  Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef,
  ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { Chart, registerables } from 'chart.js';
import { forkJoin } from 'rxjs';

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
  activeSession: any = null;
  quotaCards: any[] = [];
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
        this.fetchDashboardData();
      }
    }
  }

fetchDashboardData() {
  this.dataReady = false;
  forkJoin({
    session: this.http.get<any>('http://localhost:5000/api/active-session'),
    rules: this.http.get<any[]>('http://localhost:5000/api/leave-types'),
    history: this.http.get<any[]>(`http://localhost:5000/api/leaves/staff/${this.user.empCode}`)
  }).subscribe({
    next: (res) => {
      this.activeSession = res.session;
      const currentSessionLabel = res.session.sessionName; // e.g., "2025-2026"

      // 0. Calculate Session Stats for Charts
      const sessionHistory = res.history.filter((l: any) => l.sessionName === currentSessionLabel);
      this.leaveStats = {
        approved: sessionHistory.filter((l: any) => this.isApproved(l.Status)).length,
        pending: sessionHistory.filter((l: any) => l.Status?.toLowerCase().trim() === 'pending').length,
        rejected: sessionHistory.filter((l: any) => l.Status?.toLowerCase().trim() === 'rejected').length
      };

      // THE PERFECT FILTER
      const rawCurrentRules = res.rules.filter(r => {
        // 1. Session Match
        const isSessionMatch = r.sessionName === currentSessionLabel;

        // 2. Dept Code Match (Handles String "1" vs Number 1)
        const userDept = String(this.user.dept_code || '');
        const ruleDept = String(r.dept_code || '');
        const isDeptMatch = userDept === ruleDept || ruleDept === '0';

        return isSessionMatch && isDeptMatch;
      });

      // 3. Deduplicate by leave_name to prevent multiple cards
      const uniqueRulesMap = new Map();
      rawCurrentRules.forEach(r => {
        const name = r.leave_name.toUpperCase().trim();
        if (!uniqueRulesMap.has(name)) {
          uniqueRulesMap.set(name, r);
        }
      });
      const myCurrentRules = Array.from(uniqueRulesMap.values());

      // If no rules found, help the user understand why
      if (myCurrentRules.length === 0) {
        console.warn(`No rules found for Session: ${currentSessionLabel}, Dept: ${this.user.dept_code}`);
        this.dataReady = true;
        this.cdr.detectChanges();
        return;
      }

      const balanceRequests = myCurrentRules.map(r => 
        this.http.get<any>(`http://localhost:5000/api/leaves/balance/${this.user.empCode}/${r.leave_name}`)
      );

      forkJoin(balanceRequests).subscribe(balances => {
         this.quotaCards = myCurrentRules.map((rule, i) => {
             const b = balances[i];
             const name = rule.leave_name.toUpperCase().trim();
             const isIncrementing = ['VAL', 'AL'].includes(name);
             const used = b.usedThisYear || 0;
             const limit = b.limit || 0;

             return {
                 name,
                 limit: limit,
                 remaining: b.balance,
                 percent: limit > 0 ? (used / limit) * 100 : 0,
                 isIncrementing,
                 isCarryForward: rule.can_carry_forward,
                 carryForward: b.carryForward || 0,
                 currentLimit: b.currentLimit || rule.total_yearly_limit,
                 used: used
             };
         });

         this.dataReady = true;
         this.cdr.detectChanges();
         this.tryRenderCharts();
      });
    }
  });
}

  getLeaveTypeName(l: any) {
    const n = l['Type of Leave'] || l.Type_of_Leave || l.leave_name || l.Type || '';
    return n.toString().trim().toUpperCase();
  }
  getDays(l: any) { return Number(l['Total Days'] || l.Total_Days || 0); }
  isApproved(s: string) { return ['approved', 'final approved', 'hod approved'].includes(s?.toLowerCase().trim()); }
  isDateInWindow(date: any, start: any, end: any) {
    const d = new Date(date);
    return d >= new Date(start) && d <= new Date(end);
  }
  getTotalStats() { return this.leaveStats.approved + this.leaveStats.pending + this.leaveStats.rejected; }

  private tryRenderCharts() {
    if (!isPlatformBrowser(this.platformId) || !this.dataReady || !this.viewReady) return;
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        if (this.statusChartRef) this.renderStatusChart();
        if (this.leaveTypeChartRef) this.renderLeaveTypeChart();
      }, 100);
    });
  }

  renderStatusChart() {
    const ctx = this.statusChartRef.nativeElement.getContext('2d');
    if (this.statusChart) this.statusChart.destroy();
    this.statusChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Approved', 'Pending', 'Rejected'],
        datasets: [{
          data: [this.leaveStats.approved, this.leaveStats.pending, this.leaveStats.rejected],
          backgroundColor: ['#198754', '#ffc107', '#dc3545'],
          borderWidth: 2,
          borderColor: '#ffffff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { display: false } }
      }
    });
  }

  renderLeaveTypeChart() {
    const ctx = this.leaveTypeChartRef.nativeElement.getContext('2d');
    if (this.leaveTypeChart) this.leaveTypeChart.destroy();
    const labels = this.quotaCards.map(c => c.name);
    const takenData = this.quotaCards.map(c => c.used);

    this.leaveTypeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Days Taken',
          data: takenData,
          backgroundColor: '#007bff',
          borderRadius: 8
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 } },
          x: { grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  ngAfterViewInit() {
    this.viewReady = true;
    this.tryRenderCharts();
  }

  ngOnDestroy() {
    if (this.statusChart) this.statusChart.destroy();
    if (this.leaveTypeChart) this.leaveTypeChart.destroy();
  }
}