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
      const savedUser = sessionStorage.getItem('user');
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
      const currentSessionLabel = res.session.sessionName;
      this.activeSession = res.session; 
      
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.setItem('activeSessionName', currentSessionLabel);
      }

      // 0. Calculate Session Stats for Charts
      const sessionHistory = res.history.filter((l: any) => l.sessionName === currentSessionLabel);
      this.leaveStats = {
        approved: sessionHistory.filter((l: any) => this.isApproved(l.Status)).length,
        pending: sessionHistory.filter((l: any) => l.Status?.toLowerCase().trim() === 'pending').length,
        rejected: sessionHistory.filter((l: any) => l.Status?.toLowerCase().trim() === 'rejected').length
      };

      // 1. Filter rules for CURRENT session
      const rawCurrentRules = res.rules.filter(r => {
        const isSessionMatch = r.sessionName === currentSessionLabel;
        const userDept = String(this.user.dept_code || '');
        const ruleDept = String(r.dept_code || '');
        const isDeptMatch = userDept === ruleDept || ruleDept === '0';
        return isSessionMatch && isDeptMatch;
      });

      // 2. Deduplicate rules
      const uniqueRulesMap = new Map();
      rawCurrentRules.forEach(r => {
        const name = r.leave_name.toUpperCase().trim();
        if (!uniqueRulesMap.has(name)) uniqueRulesMap.set(name, r);
      });
      let myCurrentRules = Array.from(uniqueRulesMap.values());

      // 3. Fallback: If no rules found for active session, show standard default set
      if (myCurrentRules.length === 0 && currentSessionLabel && currentSessionLabel !== "Not Set") {
        const defaultNames = ['CL', 'SL', 'AL', 'VAL', 'EL'];
        myCurrentRules = defaultNames.map(name => ({
          leave_name: name,
          total_yearly_limit: 12,
          can_carry_forward: ['SL', 'EL'].includes(name) // VAL is now false
        }));
      }

      if (myCurrentRules.length === 0) {
        this.dataReady = true;
        this.cdr.detectChanges();
        return;
      }

      // 4. Fetch balances specifically for THIS session
      const balanceRequests = myCurrentRules.map(r => 
        this.http.get<any>(`http://localhost:5000/api/leaves/balance/${this.user.empCode}/${r.leave_name}?sessionName=${currentSessionLabel}`)
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
                 limit: limit, // Synced from Backend
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