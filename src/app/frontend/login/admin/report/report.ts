import { Component, OnInit, signal, computed, effect, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe, DatePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { DisplayDatePipe } from '../../../../shared/pipes/display-date.pipe';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, DisplayDatePipe],
  templateUrl: './report.html',
  styleUrl: './report.css'
})
export class Report implements OnInit {
  // Master Data Signals
  allStaff = signal<any[]>([]);
  allLeaves = signal<any[]>([]);
  allLeaveTypes = signal<any[]>([]);

  // Navigation and Filter State
  activeTab = signal<'staff' | 'logs' | 'configs' | 'balance'>('staff');
  deptSearch = signal<string>(''); // Dynamic 1-7 Filter
  searchTerm = signal<string>('');
  selectedCategory = signal<string>(''); // New Leave Category Filter
  
  // Date Range Signals
  fromDate = signal<string>('');
  toDate = signal<string>('');

  // Staff balance summary (fetched on demand)
  staffBalanceSummary = signal<any[]>([]);
  balanceLoading = signal<boolean>(false);
  activeSession = signal<string>('');
  availableSessions = signal<string[]>([]); // All years from DB
  selectedSession = signal<string>('');    // Currently picked in dropdown
  
  // Inline editing state
  editingBalance = signal<{ empCode: any, leave: string } | null>(null);
  newBalanceValue = signal<number>(0);

  // Filtered Balance Summary Computed Signal
  filteredBalanceSummary = computed(() => {
    const summary = this.staffBalanceSummary();
    const term = this.searchTerm().toLowerCase();
    const dept = this.deptSearch();

    return summary.filter(s => {
      const matchDept = !dept || (s.dept || '').toString() === dept;
      const matchName = !term || 
        (s.name || '').toLowerCase().includes(term) || 
        (s.empCode || '').toString().toLowerCase().includes(term);
      return matchDept && matchName;
    });
  });

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>('http://localhost:5000/api/staff').subscribe(res => this.allStaff.set(res));
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe(res => this.allLeaves.set(res));
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe(res => this.allLeaveTypes.set(res));
    
    // Fetch active session AND all available session labels
    let cachedSession = null;
    if (isPlatformBrowser(this.platformId)) {
      cachedSession = sessionStorage.getItem('activeSessionName');
    }
    this.http.get<any>('http://localhost:5000/api/active-session').subscribe(res => {
      const active = res.sessionName || '';
      this.activeSession.set(active);
      const sessionToUse = cachedSession || active;
      this.selectedSession.set(sessionToUse);
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.setItem('activeSessionName', sessionToUse);
      }
    });
    this.http.get<string[]>('http://localhost:5000/api/sessions/list').subscribe(res => {
      this.availableSessions.set(res);
    });
  }

  onSessionChange(newSession: string) {
    this.selectedSession.set(newSession);
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('activeSessionName', newSession);
    }
    this.loadBalanceSummary();
    // Refresh lists for the new session
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe(res => this.allLeaves.set(res));
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe(res => this.allLeaveTypes.set(res));
  }

  /** DYNAMIC DEPT NAME LOOKUP (Zero Hardcoding) */
  getDeptName = computed(() => (code: any) => {
    if (!code) return 'GLOBAL';
    const staffMember = this.allStaff().find(s => 
      (s.dept_code || s.Dept_Code || '').toString() === code.toString()
    );
    return staffMember ? staffMember.department : 'Other';
  });

  /** 1. Staff Directory Report */
  filteredStaff = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const dept = this.deptSearch();
    return this.allStaff().filter(s => {
      const rowDept = (s.dept_code || s.Dept_Code || '').toString();
      const matchDept = !dept || rowDept === dept;
      
      const matchName = !term || 
        s.Name.toLowerCase().includes(term) || 
        (s['Employee Code'] || s.Employee_Code || '').toString().toLowerCase().includes(term);
        
      return matchDept && matchName;
    });
  });

  /** 2. Leave Application Logs (ADDED DATE LOGIC HERE) */
  filteredLogs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const dept = this.deptSearch();
    const cat = this.selectedCategory().toUpperCase();
    
    return this.allLeaves().filter(l => {
      const rowDept = (l.Dept_Code || l.dept_code || '').toString();
      const matchDept = !dept || rowDept === dept;
      
      const matchName = !term || 
        l.Name.toLowerCase().includes(term) || 
        (l.Employee_Code || l['Employee Code'] || '').toString().toLowerCase().includes(term);
      
      // Leave Category Filter
      const leaveCat = (l['Type of Leave'] || l.Type_of_Leave || '').toUpperCase();
      const matchCat = !cat || leaveCat === cat;

      // Date Filtering Logic
      const leaveDate = new Date(l.From).getTime();
      const startLimit = this.fromDate() ? new Date(this.fromDate()).getTime() : null;
      const endLimit = this.toDate() ? new Date(this.toDate()).getTime() : null;

      const matchFrom = !startLimit || leaveDate >= startLimit;
      const matchTo = !endLimit || leaveDate <= endLimit;

      // Also filter by session if selected
      const session = this.selectedSession();
      const matchSession = !session || l.sessionName === session;

      return matchDept && matchName && matchFrom && matchTo && matchSession && matchCat;
    });
  });

  /** 3. Leave Configuration Report */
  filteredConfigs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const dept = this.deptSearch();
    return this.allLeaveTypes().filter(c => {
      const rowDept = (c.dept_code || '').toString();
      const matchDept = !dept || rowDept === dept;
      const matchName = !term || c.leave_name.toLowerCase().includes(term);
      
      const session = this.selectedSession();
      const matchSession = !session || c.sessionName === session;

      return matchDept && matchName && matchSession;
    });
  });

  /** 4. Leave History grouped by leave category */
  logsGroupedByCategory = computed(() => {
    const logs = this.filteredLogs();
    const grouped: Record<string, { category: string; applications: any[]; totalDays: number }> = {};
    for (const l of logs) {
      const cat = (l['Type of Leave'] || l.Type_of_Leave || 'UNKNOWN').toUpperCase();
      if (!grouped[cat]) {
        grouped[cat] = { category: cat, applications: [], totalDays: 0 };
      }
      grouped[cat].applications.push(l);
      grouped[cat].totalDays += Number(l['Total Days'] || l.Total_Days || 0);
    }
    return Object.values(grouped).sort((a, b) => a.category.localeCompare(b.category));
  });

  /** 5. Load staff balance summary for all staff x all unique leave types */
  loadBalanceSummary() {
    this.balanceLoading.set(true);
    const staff = this.allStaff();
    const session = this.selectedSession() || this.activeSession();
    
    // Get unique leave names from configured types
    // (We show all unique names found across any session, or just current if preferred)
    const leaveNames = this.leaveNames;

    if (!staff.length || !leaveNames.length) {
      this.balanceLoading.set(false);
      return;
    }

    const calls = staff.map(s => {
      const empCode = s['Employee Code'] || s.Employee_Code || s.empCode;
      if (!empCode || isNaN(Number(empCode))) {
        return null;
      }
      const balCalls = leaveNames.map(name =>
        this.http.get<any>(`http://localhost:5000/api/leaves/balance/${empCode}/${name}?sessionName=${session}`)
      );
      return forkJoin(balCalls);
    }).filter(call => call !== null);

    forkJoin(calls).subscribe({
      next: (results: any[][]) => {
        const validStaff = staff.filter(s => {
          const code = s['Employee Code'] || s.Employee_Code || s.empCode;
          return code && !isNaN(Number(code));
        });
        const summary = validStaff.map((s, i) => ({
          name: s.Name,
          empCode: s['Employee Code'] || s.Employee_Code || s.empCode,
          dept: s.dept_code || s.Dept_Code, // Use code for filtering consistency
          deptName: s.department,
          balances: leaveNames.map((name, j) => ({
            leave: name,
            balance: results[i]?.[j]?.balance ?? 0,
            used: results[i]?.[j]?.usedThisYear ?? 0,
            limit: results[i]?.[j]?.limit ?? 0,
            isIncrementing: results[i]?.[j]?.isIncrementing ?? false,
            isManuallyAdjusted: results[i]?.[j]?.isManuallyAdjusted ?? false
          }))
        }));
        this.staffBalanceSummary.set(summary);
        this.balanceLoading.set(false);
      },
      error: () => this.balanceLoading.set(false)
    });
  }

  onTabChange(tab: 'staff' | 'logs' | 'configs' | 'balance') {
    this.activeTab.set(tab);
    if (tab === 'balance' && !this.staffBalanceSummary().length) {
      this.loadBalanceSummary();
    }
  }

  resetFilters() {
    this.deptSearch.set('');
    this.searchTerm.set('');
    this.selectedCategory.set('');
    this.fromDate.set('');
    this.toDate.set('');
  }

  /** Unique leave names across configured types (for balance table header) */
  get leaveNames(): string[] {
    const session = this.selectedSession() || this.activeSession();
    return [...new Set(
      this.allLeaveTypes()
        .filter((lt: any) => !session || lt.sessionName === session)
        .map((lt: any) => lt.leave_name as string)
    )] as string[];
  }

  getBalance(balances: any[], leaveName: string) {
    return balances.find(b => b.leave === leaveName) || { balance: '-', isIncrementing: false, isManuallyAdjusted: false };
  }

  startEdit(s: any, leaveName: string, currentBalance: any) {
    this.editingBalance.set({ empCode: s.empCode, leave: leaveName });
    this.newBalanceValue.set(Number(currentBalance) || 0);
  }

  cancelEdit() {
    this.editingBalance.set(null);
  }

  saveAdjustment(s: any, leaveName: string) {
    const payload = {
      empCode: s.empCode,
      leaveType: leaveName,
      sessionName: this.selectedSession() || this.activeSession(),
      adjustmentValue: this.newBalanceValue()
    };

    this.http.post('http://localhost:5000/api/leaves/adjust-balance', payload).subscribe({
      next: () => {
        this.editingBalance.set(null);
        this.loadBalanceSummary();
      },
      error: (err) => console.error('Adjustment failed', err)
    });
  }
}