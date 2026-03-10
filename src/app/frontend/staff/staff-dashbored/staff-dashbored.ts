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
        const startDate = new Date(res.session.startDate);
        const endDate = new Date(res.session.endDate);
        const currentSessionLabel = res.session.sessionName;

        const myCurrentRules = res.rules.filter(r => 
          String(r.dept_code) === String(this.user.dept_code) && 
          r.staffType === this.user.staffType &&
          r.sessionName === currentSessionLabel
        );

        this.quotaCards = myCurrentRules.map(rule => {
          const name = rule.leave_name.toUpperCase().trim();
          const isCarryForward = !!rule.can_carry_forward;
          const isIncrementing = ['VAL', 'AL'].includes(name);

          const usedInCurrentWindow = res.history.filter(l => {
            const d = new Date(l.From || l.From_Date);
            return this.getLeaveTypeName(l) === name && this.isApproved(l.Status) && (d >= startDate && d <= endDate);
          }).reduce((sum, l) => sum + this.getDays(l), 0);

          let remaining = 0;
          let displayLimit = rule.total_yearly_limit;

          if (isIncrementing) {
            remaining = usedInCurrentWindow;
          } 
          else if (isCarryForward) {
            const currentYearStart = parseInt(currentSessionLabel.split('-')[0]);
            const pastBalance = res.rules
              .filter(r => {
                const rYear = parseInt(r.sessionName.split('-')[0]);
                return r.leave_name.toUpperCase().trim() === name && 
                       String(r.dept_code) === String(this.user.dept_code) && 
                       r.staffType === this.user.staffType && rYear < currentYearStart;
              })
              .reduce((balance, pastRule) => {
                const pastUsed = res.history.filter(l => 
                  this.getLeaveTypeName(l) === name && this.isApproved(l.Status) && 
                  (l.sessionName === pastRule.sessionName || this.isDateInWindow(l.From, pastRule.startDate, pastRule.endDate))
                ).reduce((s, l) => s + this.getDays(l), 0);
                return balance + Math.max(0, pastRule.total_yearly_limit - pastUsed);
              }, 0);

            remaining = Math.max(0, (pastBalance + rule.total_yearly_limit) - usedInCurrentWindow);
            displayLimit = pastBalance + rule.total_yearly_limit;
          } 
          else {
            remaining = Math.max(0, rule.total_yearly_limit - usedInCurrentWindow);
          }

          return {
            name,
            limit: displayLimit,
            remaining,
            percent: isIncrementing ? 100 : (remaining / (displayLimit || 1)) * 100,
            isIncrementing,
            isCarryForward
          };
        });

        const sessionLeaves = res.history.filter(l => {
          const d = new Date(l.From || l.From_Date);
          return d >= startDate && d <= endDate;
        });

        this.leaveStats = {
          approved: sessionLeaves.filter(l => this.isApproved(l.Status)).length,
          pending: sessionLeaves.filter(l => l.Status?.toLowerCase().trim() === 'pending').length,
          rejected: sessionLeaves.filter(l => l.Status?.toLowerCase().trim() === 'rejected').length
        };

        this.dataReady = true;
        this.cdr.detectChanges(); // Update DOM to render canvas elements
        this.tryRenderCharts();
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
    const takenData = this.quotaCards.map(c => c.isIncrementing ? c.remaining : Math.max(0, c.limit - c.remaining));

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