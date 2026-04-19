import {
  Component, OnInit, Inject, PLATFORM_ID, ChangeDetectorRef,
  ViewChild, ElementRef, AfterViewInit, OnDestroy, NgZone
} from '@angular/core';
import { isPlatformBrowser, CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { Chart, registerables } from 'chart.js';
import { forkJoin, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { LanguageService } from '../../../shared/language.service';

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
  private pollInterval: any;

  @ViewChild('statusChart') statusChartRef!: ElementRef;
  @ViewChild('leaveTypeChart') leaveTypeChartRef!: ElementRef;

  statusChart: any;
  leaveTypeChart: any;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    public langService: LanguageService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  t(key: string): string {
    return this.langService.translate(key);
  }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        this.user = JSON.parse(savedUser);
        
        // Ensure we have a valid empCode before fetching
        if (this.user.empCode || this.user.Employee_Code) {
          this.fetchDashboardData();
          // Start polling for real-time desktop notifications
          this.pollInterval = setInterval(() => this.fetchDashboardData(true), 120000); // Poll every 2 mins
          this.requestNotificationPermission();
        } else {
          console.error("[StaffDashbored] ERROR: No employee code found in user session.");
          this.dataReady = true; // Stop skeleton/loader
        }
      }
    }
  }

  fetchDashboardData(isPoll = false) {
    if (!isPoll) this.dataReady = false;
    if (!this.user) return;

    let cachedSession = null;
    if (isPlatformBrowser(this.platformId)) {
      cachedSession = sessionStorage.getItem('activeSessionName');
    }

    forkJoin({
      session: this.http.get<any>('/api/active-session').pipe(timeout(8000), catchError(() => of({ sessionName: 'Not Set' }))),
      rules: this.http.get<any[]>('/api/leave-types').pipe(timeout(8000), catchError(() => of([]))),
      history: this.http.get<any[]>(`/api/leaves/staff/${this.user.empCode || this.user.Employee_Code}`).pipe(timeout(8000), catchError(() => of([])))
    }).subscribe({
      next: (res) => {
        try {
          const currentSessionLabel = cachedSession || res.session?.sessionName || 'Not Set';
          this.activeSession = res.session && res.session.sessionName !== 'Not Set' ? res.session : { sessionName: currentSessionLabel };

          if (isPlatformBrowser(this.platformId)) {
            sessionStorage.setItem('activeSessionName', currentSessionLabel);
          }
          this.cdr.detectChanges();

          // 0. Calculate Session Stats
          const sessionHistory = res.history.filter((l: any) => 
            normalize(l.sessionName) === normalize(currentSessionLabel)
          );
          this.leaveStats = {
            approved: sessionHistory.filter((l: any) => this.isApproved(l.Status)).length,
            pending: sessionHistory.filter((l: any) => (l.Status || '').toLowerCase().trim() === 'pending').length,
            rejected: sessionHistory.filter((l: any) => (l.Status || '').toLowerCase().trim() === 'rejected').length
          };
          
          // INSTANTLY clear the placeholder & render the Status History Chart!
          // We do not hold the status chart hostage waiting for the slow balance APIs over the network!
          this.cdr.detectChanges();
          this.ngZone.runOutsideAngular(() => {
            setTimeout(() => {
              if (this.statusChartRef) this.renderStatusChart();
              if (this.statusChartRef) {
                // Ensure placeholder opacity goes 0 for instant switch
                this.statusChartRef.nativeElement.classList.remove('invisible');
              }
            }, 50);
          });

          // 1. Filter rules for CURRENT session using Perfect Match logic
          function normalize(v: any) { return String(v || '').trim(); }
          const userDept = normalize(this.user.dept_code !== undefined ? this.user.dept_code : this.user.Dept_Code);
          const userStaffType = normalize(this.user.staffType || 'Teaching').toLowerCase();

          const allApplicableRules = res.rules.filter(r => {
            const rSession = normalize(r.sessionName);
            if (rSession !== normalize(currentSessionLabel)) return false;

            const rDept = normalize(r.dept_code);
            return userDept === rDept || rDept === '0' || rDept === '';
          });

          // 2. Pick the BEST record for each leave name
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
          
          let currentRulesToUse = Array.from(bestRulesMap.values());

          // 3. Fallback: If no rules found for active session, show standard default set
          if (currentRulesToUse.length === 0 && currentSessionLabel && currentSessionLabel !== "Not Set") {
            const defaultNames = ['CL', 'SL', 'AL', 'VAL', 'EL'];
            currentRulesToUse = defaultNames.map(name => ({
              leave_name: name,
              total_yearly_limit: 12,
              can_carry_forward: ['SL', 'EL'].includes(name)
            }));
          }

          if (currentRulesToUse.length === 0) {
            this.dataReady = true;
            this.cdr.detectChanges();
            this.tryRenderCharts();
            return;
          }

          // 4. Fetch balances specifically for THIS session
          const balanceRequests = currentRulesToUse.map(r => 
            this.http.get<any>(`/api/leaves/balance/${this.user.empCode}/${r.leave_name}?sessionName=${currentSessionLabel}`)
            .pipe(timeout(8000), catchError(() => of({ balance: 0, usedThisYear: 0, limit: r.total_yearly_limit || 12 })))
          );

          forkJoin(balanceRequests).subscribe({
            next: (balances: any[]) => {
              this.quotaCards = currentRulesToUse.map((rule, i) => {
                const b = balances[i] || {};
                const name = rule.leave_name.toUpperCase().trim();
                const used = b.usedThisYear ?? 0;
                const limit = b.limit || rule.total_yearly_limit || 12;
                return {
                  name: name,
                  remaining: b.balance ?? 0,
                  used: used,
                  limit: limit,
                  percent: limit > 0 ? (used / limit) * 100 : 0,
                  isIncrementing: b.isIncrementing || ['VAL', 'AL'].includes(name),
                  isCarryForward: rule.can_carry_forward,
                  carryForward: b.carryForward || 0
                };
              });
              
              this.dataReady = true;
              this.cdr.detectChanges();
              this.tryRenderCharts();

              // Check for status changes (Desktop Notifications)
              this.checkStatusChanges(res.history);
            },
            error: (err) => {
              console.error("Balance fetch error:", err);
              this.dataReady = true;
              this.cdr.detectChanges();
            }
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
        labels: [this.t('APPROVED'), this.t('PENDING'), this.t('REJECTED')],
        datasets: [{
          data: [this.leaveStats.approved, this.leaveStats.pending, this.leaveStats.rejected],
          backgroundColor: ['#10b981', '#f59e0b', '#ef4444'], // Modern beautiful vibrant tails
          borderWidth: 0,
          hoverOffset: 15
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        animation: { duration: 1800, easing: 'easeOutBack' }, // Gorgeous pop-in animation
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            padding: 12,
            bodyFont: { size: 14, weight: 'bold' },
            cornerRadius: 8
          }
        }
      }
    });
  }

  renderLeaveTypeChart() {
    const ctx = this.leaveTypeChartRef.nativeElement.getContext('2d');
    if (this.leaveTypeChart) this.leaveTypeChart.destroy();
    const labels = this.quotaCards.map(c => c.name);
    const takenData = this.quotaCards.map(c => c.used);

    // Apply a gorgeous dynamic vertical gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 250);
    gradient.addColorStop(0, '#3b82f6'); // rich light blue
    gradient.addColorStop(1, '#6366f1'); // deep indigo

    this.leaveTypeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Days Count',
          data: takenData,
          backgroundColor: gradient,
          borderRadius: 8,
          borderSkipped: false,
          barPercentage: 0.6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 1600, easing: 'easeOutBounce' }, // Sleek cascading entrance
        scales: {
          y: { 
             beginAtZero: true, 
             ticks: { stepSize: 1, font: { weight: 'bold', family: 'sans-serif' }, color: '#9ca3af' },
             grid: { color: '#f3f4f6' }, border: { display: false }
          },
          x: { 
             ticks: { font: { weight: 'bold', family: 'sans-serif' }, color: '#6b7280' },
             grid: { display: false }, border: { display: false }
          }
        },
        plugins: { 
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            padding: 12,
            titleFont: { size: 13, weight: 'normal' },
            bodyFont: { size: 15, weight: 'bold' },
            displayColors: false,
            cornerRadius: 8
          }
        }
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
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  // --- DESKTOP NOTIFICATION LOGIC ---
  private requestNotificationPermission() {
    if (isPlatformBrowser(this.platformId) && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }

  private checkStatusChanges(history: any[]) {
    if (!isPlatformBrowser(this.platformId)) return;

    const storageKey = `elms_last_statuses_${this.user.empCode || this.user.Employee_Code}`;
    const previousStatusesStr = localStorage.getItem(storageKey);
    const previousStatuses: Record<string, string> = previousStatusesStr ? JSON.parse(previousStatusesStr) : {};
    
    let currentStatuses: Record<string, string> = {};
    let notificationTriggered = false;

    history.forEach(l => {
      const id = l._id;
      const current = l.Status;
      currentStatuses[id] = current;

      // Only notify if we already had data about this leave AND status changed
      if (previousStatuses[id] && previousStatuses[id] !== current) {
        this.triggerDesktopNotification(l);
        notificationTriggered = true;
      }
    });

    localStorage.setItem(storageKey, JSON.stringify(currentStatuses));
  }

  private triggerDesktopNotification(l: any) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const title = 'Leave Update: ' + (l.Status || 'Status Changed');
    const options = {
      body: `Your ${this.getLeaveTypeName(l)} from ${l.From} to ${l.To} is now ${l.Status}.`,
      icon: 'assets/favicon.ico' // Ensure assets directory exists or use a web link
    };

    new Notification(title, options);
  }
}