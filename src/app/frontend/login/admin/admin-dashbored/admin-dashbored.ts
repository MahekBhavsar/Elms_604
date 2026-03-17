import { Component, OnInit, ChangeDetectorRef, ViewChild, ElementRef, AfterViewInit, Inject, PLATFORM_ID, NgZone, OnDestroy } from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

Chart.register(...registerables);

@Component({
  selector: 'app-admin-dashbored',
  standalone: true,
  imports: [CommonModule, AdminSidebar],
  templateUrl: './admin-dashbored.html',
  styleUrl: './admin-dashbored.css'
})
export class AdminDashbored implements OnInit, AfterViewInit, OnDestroy {
  user: any = null;
  activeSession: any = null;
  quotaCards: any[] = [];
  
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

  dataReady = false;
  private viewReady = false;

  @ViewChild('leaveChart') leaveChartRef!: ElementRef;
  @ViewChild('staffChart') staffChartRef!: ElementRef;

  leaveChart: any;
  staffChart: any;

  constructor(
    private router: Router,
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
    let cachedSession = null;
    if (isPlatformBrowser(this.platformId)) {
      cachedSession = sessionStorage.getItem('activeSessionName');
    }
    
    forkJoin({
      session: this.http.get<any>('http://localhost:5000/api/active-session').pipe(catchError(() => of({ sessionName: "Not Set" }))),
      rules: this.http.get<any[]>('http://localhost:5000/api/leave-types').pipe(catchError(() => of([]))),
      leaves: this.http.get<any[]>('http://localhost:5000/api/leaves/admin').pipe(catchError(() => of([]))),
      staff: this.http.get<any[]>('http://localhost:5000/api/staff').pipe(catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        try {
          const currentSessionLabel = cachedSession || res.session?.sessionName || 'Not Set';
          this.activeSession = res.session; 
          
          if (cachedSession && cachedSession !== res.session?.sessionName) {
            this.activeSession = { sessionName: currentSessionLabel };
          }
          if (isPlatformBrowser(this.platformId)) {
            sessionStorage.setItem('activeSessionName', currentSessionLabel);
          }

          const startDate = new Date(res.session?.startDate);
          const endDate = new Date(res.session?.endDate);

          // 1. Calculate General Admin Stats
          this.calculateSystemStats(res.leaves, res.staff, startDate, endDate);

          // 2. Calculate PERSONAL Admin Quotas using Perfect Match logic
          const normalize = (v: any) => String(v || '').trim();
          const userDept = normalize(this.user.dept_code !== undefined ? this.user.dept_code : this.user.Dept_Code);
          const userStaffType = normalize(this.user.staffType || 'Teaching').toLowerCase();
          
          const allApplicableRules = res.rules.filter(r => {
            const rSession = normalize(r.sessionName);
            if (rSession !== normalize(currentSessionLabel)) return false;

            const rDept = normalize(r.dept_code);
            return userDept === rDept || rDept === '0' || rDept === '';
          });

          const bestRulesMap = new Map<string, any>();
          allApplicableRules.forEach(r => {
            const name = r.leave_name.toUpperCase().trim();
            const rStaffType = normalize(r.staffType || 'All').toLowerCase();
            const existing = bestRulesMap.get(name);

            if (!existing) {
              bestRulesMap.set(name, r);
            } else {
              const existingStaffType = normalize(existing.staffType || 'All').toLowerCase();
              if (rStaffType === userStaffType) {
                bestRulesMap.set(name, r);
              } else if (rStaffType === 'all' && existingStaffType !== userStaffType) {
                bestRulesMap.set(name, r);
              }
            }
          });
          
          let myCurrentRules = Array.from(bestRulesMap.values());

          // 3. Fallback logic
          if (myCurrentRules.length === 0 && currentSessionLabel && currentSessionLabel !== "Not Set") {
            const defaultNames = ['CL', 'SL', 'AL', 'VAL', 'EL'];
            myCurrentRules = defaultNames.map(name => ({
              leave_name: name,
              total_yearly_limit: 12,
              can_carry_forward: ['SL', 'EL'].includes(name)
            }));
          }

          if (myCurrentRules.length === 0) {
            this.dataReady = true;
            this.cdr.detectChanges();
            this.tryRenderCharts();
            return;
          }

          // 4. Fetch balances specifically for Admin as a staff member
          const balanceRequests = myCurrentRules.map(r => 
            this.http.get<any>(`http://localhost:5000/api/leaves/balance/${this.user.empCode}/${r.leave_name}?sessionName=${currentSessionLabel}`)
            .pipe(catchError(() => of({ balance: 0, usedThisYear: 0, limit: r.total_yearly_limit || 12 })))
          );

          forkJoin(balanceRequests).subscribe(balances => {
            this.quotaCards = myCurrentRules.map((rule, i) => {
              const b = (balances as any[])[i] || {};
              const name = rule.leave_name.toUpperCase().trim();
              const used = b.usedThisYear || 0;
              const limit = b.limit || rule.total_yearly_limit || 12;

              return {
                name,
                limit: limit,
                remaining: b.balance ?? 0,
                percent: limit > 0 ? (used / limit) * 100 : 0,
                isIncrementing: b.isIncrementing,
                isCarryForward: rule.can_carry_forward,
                carryForward: b.carryForward || 0,
                used: used
              };
            });

            this.dataReady = true;
            this.cdr.detectChanges();
            this.tryRenderCharts();
          });
        } catch (e) {
          console.error("Dashboard calculation error:", e);
          this.dataReady = true;
          this.cdr.detectChanges();
        }
      },
      error: (err) => {
        console.error("Dashboard API error:", err);
        this.dataReady = true;
        this.cdr.detectChanges();
      }
    });
  }

  calculateSystemStats(leaves: any[], staff: any[], start: Date, end: Date) {
    this.staffStats.totalStaff = staff.length;
    const depts: Record<string, number> = {};
    staff.forEach(s => {
      const d = s.department || s.dept_code || 'Others';
      depts[d] = (depts[d] || 0) + 1;
    });
    this.staffStats.departments = depts;

    const sessionLeaves = leaves.filter(l => {
      const d = new Date(l.From || l.From_Date);
      return d >= start && d <= end;
    });

    this.stats = {
      totalLeaves: sessionLeaves.length,
      pendingLeaves: sessionLeaves.filter(l => l.Status === 'Pending').length,
      hodApprovedLeaves: sessionLeaves.filter(l => l.Status === 'HOD Approved').length,
      finalApprovedLeaves: sessionLeaves.filter(l => l.Status === 'Approved' || l.Status === 'Final Approved').length,
      rejectedLeaves: sessionLeaves.filter(l => l.Status === 'Rejected').length
    };
  }

  getLeaveTypeName(l: any) { 
    const n = l['Type of Leave'] || l.Type_of_Leave || l.leave_name || l.Type || '';
    return n.toString().trim().toUpperCase(); 
  }
  getDays(l: any) { return Number(l['Total Days'] || l.Total_Days || 0); }
  isApproved(s: string) { return ['approved', 'final approved', 'hod approved'].includes(s?.toLowerCase().trim()); }

  private tryRenderCharts() {
    if (!isPlatformBrowser(this.platformId) || !this.dataReady || !this.viewReady) return;
    this.ngZone.runOutsideAngular(() => {
      setTimeout(() => {
        if (this.leaveChartRef) this.renderLeaveChart();
        if (this.staffChartRef) this.renderStaffChart();
      }, 100);
    });
  }

  renderLeaveChart() {
    if (this.leaveChart) this.leaveChart.destroy();
    const ctx = this.leaveChartRef.nativeElement.getContext('2d');
    this.leaveChart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: ['Pending', 'HOD Appr.', 'Approved', 'Rejected'],
        datasets: [{
          data: [this.stats.pendingLeaves, this.stats.hodApprovedLeaves, this.stats.finalApprovedLeaves, this.stats.rejectedLeaves],
          backgroundColor: ['#ffc107', '#17a2b8', '#198754', '#dc3545'],
          borderWidth: 2, borderColor: '#ffffff'
        }]
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
  }

  renderStaffChart() {
    if (this.staffChart) this.staffChart.destroy();
    const ctx = this.staffChartRef.nativeElement.getContext('2d');
    this.staffChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: Object.keys(this.staffStats.departments),
        datasets: [{ label: 'Staff Count', data: Object.values(this.staffStats.departments), backgroundColor: '#0d6efd', borderRadius: 8 }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }

  ngAfterViewInit() { this.viewReady = true; this.tryRenderCharts(); }
  ngOnDestroy() { if (this.leaveChart) this.leaveChart.destroy(); if (this.staffChart) this.staffChart.destroy(); }
}