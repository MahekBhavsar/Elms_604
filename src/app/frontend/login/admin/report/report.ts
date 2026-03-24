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
  syncLoading = signal<boolean>(false);
  sortDirection = signal<'asc' | 'desc'>('desc');

  // Leave Editing state
  editingLeave = signal<any | null>(null);
  editLeaveFrom = signal<string>('');
  editLeaveTo = signal<string>('');
  editLeaveType = signal<string>('');
  editLeaveDays = signal<number>(0);

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
    this.http.get<any[]>('/api/staff').subscribe(res => this.allStaff.set(res));
    this.http.get<any[]>('/api/leaves/admin').subscribe(res => this.allLeaves.set(res));
    this.http.get<any[]>('/api/leave-types').subscribe(res => this.allLeaveTypes.set(res));
    
    // Fetch active session AND all available session labels
    let cachedSession = null;
    if (isPlatformBrowser(this.platformId)) {
      cachedSession = sessionStorage.getItem('activeSessionName');
    }
    this.http.get<any>('/api/active-session').subscribe(res => {
      const active = res.sessionName || '';
      this.activeSession.set(active);
      const sessionToUse = cachedSession || active;
      this.selectedSession.set(sessionToUse);
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.setItem('activeSessionName', sessionToUse);
      }
    });
    this.http.get<string[]>('/api/sessions/list').subscribe(res => {
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
    this.http.get<any[]>('/api/leaves/admin').subscribe(res => this.allLeaves.set(res));
    this.http.get<any[]>('/api/leave-types').subscribe(res => this.allLeaveTypes.set(res));
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
      const rowDept = (s.Dept_Code || s.dept_code || s.dept || '').toString();
      const matchDept = !dept || rowDept === dept;
      
      const empCode = (s.Emp_CODE || s['Employee Code'] || s.Employee_Code || '').toString();
      const matchName = !term || 
        s.Name.toLowerCase().includes(term) || 
        empCode.toLowerCase().includes(term);
        
      return matchDept && matchName;
    });
  });

  /** Extract Sr No robustly - prioritizes CSV format 'sr_no' */
  getSrNo(l: any): any {
    if (l.sr_no !== undefined && l.sr_no !== null) {
      if (typeof l.sr_no === 'object') {
        // Handle MongoDB object formats if they still exist
        if (l.sr_no.$numberLong !== undefined) return l.sr_no.$numberLong;
        if (l.sr_no.$numberInt !== undefined) return l.sr_no.$numberInt;
        return l.sr_no[''] ?? Object.values(l.sr_no)[0];
      }
      return l.sr_no;
    }
    
    // Fallbacks for older data
    const sr = l.Sr || l.sr || l.SR || l.srno;
    if (sr) {
      if (typeof sr === 'object') {
        const val = sr.NO ?? sr.no ?? sr.No ?? sr[''] ?? Object.values(sr)[0];
        return val;
      }
      return sr;
    }
    return '-';
  }

  toggleSort() {
    this.sortDirection.update(d => d === 'asc' ? 'desc' : 'asc');
  }

  /** 2. Leave Application Logs (ADDED DATE LOGIC HERE) */
  filteredLogs = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const dept = this.deptSearch();
    const cat = this.selectedCategory().toUpperCase();
    const sortDir = this.sortDirection();
    
    let logs = this.allLeaves().filter(l => {
      const rowDept = (l.Dept_Code || l.dept_code || '').toString();
      const matchDept = !dept || rowDept === dept;
      
      const empCode = (l.Emp_CODE || l.Employee_Code || l['Employee Code'] || '').toString();
      const matchName = !term || 
        l.Name.toLowerCase().includes(term) || 
        empCode.toLowerCase().includes(term);
      
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

    // Sort by Sr No
    return logs.sort((a, b) => {
      const valA = Number(this.getSrNo(a)) || 0;
      const valB = Number(this.getSrNo(b)) || 0;
      return sortDir === 'asc' ? valA - valB : valB - valA;
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

  /** 5. Load staff balance summary using the new BULK endpoint for HIGH PERFORMANCE */
  loadBalanceSummary() {
    this.balanceLoading.set(true);
    const session = this.selectedSession() || this.activeSession();

    this.http.get<any[]>(`/api/leaves/balances/bulk?sessionName=${session}`).subscribe({
      next: (summary) => {
        this.staffBalanceSummary.set(summary);
        this.balanceLoading.set(false);
      },
      error: (err) => {
        console.error('Bulk fetch failed:', err);
        this.balanceLoading.set(false);
      }
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

    this.http.post('/api/leaves/adjust-balance', payload).subscribe({
      next: () => {
        this.editingBalance.set(null);
        this.loadBalanceSummary();
      },
      error: (err) => console.error('Adjustment failed', err)
    });
  }

  /** Leave Editing Logic */
  startEditLeave(l: any) {
    this.editingLeave.set(l);
    
    // Safely format date from MM/DD/YYYY or YYYY-MM-DD to YYYY-MM-DD for the date input
    const toDateInputFormat = (val: string) => {
      if (!val) return '';
      const d = new Date(val);
      if (isNaN(d.getTime())) return val;
      return d.toISOString().split('T')[0];
    };

    this.editLeaveFrom.set(toDateInputFormat(l.From));
    this.editLeaveTo.set(toDateInputFormat(l.To));
    this.editLeaveType.set(l['Type of Leave'] || l.Type_of_Leave || '');
    this.editLeaveDays.set(l['Total Days'] || l.Total_Days || 0);
  }

  cancelEditLeave() {
    this.editingLeave.set(null);
  }

  saveLeaveEdit() {
    const leave = this.editingLeave();
    if (!leave) return;

    const payload = {
      From: this.editLeaveFrom(),
      To: this.editLeaveTo(),
      "Type of Leave": this.editLeaveType(),
      "Total Days": this.editLeaveDays()
    };

    this.http.put(`/api/leaves/${leave._id}`, payload).subscribe({
      next: () => {
        this.editingLeave.set(null);
        this.loadData(); // Reload all data to refresh lists
        if (this.activeTab() === 'balance') this.loadBalanceSummary(); // Also refresh balances
      },
      error: (err) => console.error('Failed to update leave', err)
    });
  }

  /** 6. Master Sync to MongoDB */
  syncAllMasterBalances() {
    if (!confirm('This will calculate and save LIVE balances for ALL employees into the database. Continue?')) return;
    
    this.syncLoading.set(true);
    this.http.post<any>('/api/admin/sync-all-balances', {}).subscribe({
      next: (res) => {
        alert(`Successfully synced ${res.count} balance records to MongoDB!`);
        this.syncLoading.set(false);
        this.loadBalanceSummary();
      },
      error: (err) => {
        console.error('Sync failed', err);
        alert('Synchronization failed. Check console for details.');
        this.syncLoading.set(false);
      }
    });
  }

  /** 7. Print Individual Staff Balance & Leave Report */
  printIndividualStaffReport(s: any) {
    const session = this.selectedSession() || this.activeSession();
    // Get ALL leaves for this staff in this session, sorted by date
    const staffLeaves = this.allLeaves()
      .filter(l => {
        const empCode = (l.Emp_CODE || l.Employee_Code || l['Employee Code'] || '').toString();
        const matchStaff = empCode === s.empCode.toString();
        const matchSession = !session || l.sessionName === session;
        return matchStaff && matchSession;
      })
      .sort((a, b) => new Date(a.From).getTime() - new Date(b.From).getTime());

    const formatDate = (d: any) => d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

    let printContents = `
    <html>
      <head>
        <title>Leave Summary Report - ${s.name}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e3c72; padding-bottom: 20px; margin-bottom: 30px; }
          .header-left h1 { margin: 0; color: #1e3c72; font-size: 28px; font-weight: 700; }
          .header-left p { margin: 5px 0 0; color: #666; font-size: 14px; }
          .header-right { text-align: right; }
          
          .employee-info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 35px; background: #f8fbff; padding: 20px; border-radius: 12px; border: 1px solid #e1e9f4; }
          .info-item { display: flex; flex-direction: column; }
          .info-label { font-size: 11px; font-weight: 700; text-transform: uppercase; color: #7b8a9b; letter-spacing: 0.5px; margin-bottom: 4px; }
          .info-value { font-size: 15px; font-weight: 600; color: #1e3c72; }

          .section-title { font-size: 18px; font-weight: 700; color: #1e3c72; margin: 30px 0 15px; display: flex; align-items: center; }
          .section-title::after { content: ''; flex: 1; height: 1px; background: #eee; margin-left: 15px; }

          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
          th { background-color: #f1f4f9; color: #1e3c72; font-weight: 700; text-align: left; padding: 12px 15px; border-bottom: 2px solid #e1e9f4; }
          td { padding: 12px 15px; border-bottom: 1px solid #eee; }
          tr:last-child td { border-bottom: none; }
          
          .balance-box-container { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 20px; }
          .balance-box { padding: 15px; border-radius: 10px; border: 1px solid #e1e9f4; background: white; transition: all 0.2s; }
          .balance-box .leave-name { font-weight: 700; font-size: 14px; color: #1e3c72; margin-bottom: 10px; display: block; border-bottom: 1px solid #f0f0f0; padding-bottom: 5px; }
          .balance-details { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 5px; }
          .balance-total { font-size: 16px; font-weight: 700; text-align: right; margin-top: 8px; }
          
          .status-badge { padding: 4px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
          .status-approved { background: #e6f7ed; color: #1d8a48; }
          .status-pending { background: #fff8e6; color: #b28900; }
          .status-rejected { background: #fde8e8; color: #c81e1e; }

          @media print {
            body { padding: 20px; }
            .balance-box { break-inside: avoid; }
            table { break-inside: auto; }
            tr { break-inside: avoid; break-after: auto; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h1>Leave Summary Report</h1>
            <p>Academic Session: ${session}</p>
          </div>
          <div class="header-right">
            <p style="font-size: 12px; color: #888;">Report Generated On:<br><strong>${new Date().toLocaleString()}</strong></p>
          </div>
        </div>

        <div class="employee-info-grid">
          <div class="info-item">
            <span class="info-label">Employee Name</span>
            <span class="info-value">${s.name}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Employee Code</span>
            <span class="info-value">${s.empCode}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Department</span>
            <span class="info-value">${s.deptName || 'N/A'}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Department Code</span>
            <span class="info-value">${s.dept}</span>
          </div>
        </div>

        <div class="section-title">Leave Balance Overview</div>
        <div class="balance-box-container">
          ${s.balances.map((bal: any) => `
            <div class="balance-box">
              <span class="leave-name">${bal.leave}</span>
              <div class="balance-details">
                <span>Annual Limit:</span>
                <span style="font-weight: 600;">${bal.limit}</span>
              </div>
              <div class="balance-details">
                <span>Total Consumed:</span>
                <span style="font-weight: 600; color: #c81e1e;">${bal.used}</span>
              </div>
              <div class="balance-total">
                <span style="font-size: 11px; color: #666; font-weight: 400;">Remaining:</span>
                <span style="color: ${bal.balance <= 0 ? '#c81e1e' : '#1d8a48'};">${bal.balance}</span>
              </div>
            </div>
          `).join('')}
        </div>

        <div class="section-title">Leave History Details</div>
        <table>
          <thead>
            <tr>
              <th width="50">Sr.</th>
              <th>Leave Period</th>
              <th>Leave Type</th>
              <th style="text-align: center;">Days</th>
              <th>Status</th>
              <th>Purpose / Remarks</th>
            </tr>
          </thead>
          <tbody>
            ${staffLeaves.length > 0 ? staffLeaves.map((l: any, i: number) => `
              <tr>
                <td>${i + 1}</td>
                <td><strong>${formatDate(l.From)}</strong><br><span style="color: #888; font-size: 11px;">to</span><br><strong>${formatDate(l.To)}</strong></td>
                <td>${l['Type of Leave'] || l.Type_of_Leave}</td>
                <td style="text-align: center; font-weight: 600;">${l['Total Days'] || l.Total_Days}</td>
                <td>
                  <span class="status-badge ${
                    (l.Status === 'Final Approved' || l.Status === 'Approved') ? 'status-approved' : 
                    l.Status === 'HOD Approved' ? 'status-approved' : 
                    (l.Status === 'Rejected' || l.Status === 'rejected') ? 'status-rejected' : 'status-pending'
                  }">
                    ${l.Status === 'Final Approved' || l.Status === 'Approved' ? 'APPROVED' : 
                      l.Status === 'HOD Approved' ? 'APPROVED HOD' : l.Status.toUpperCase()}
                  </span>
                </td>
                <td style="font-size: 11px; color: #555;">${l.Purpose || l.remarks || l.Reason || '-'}</td>
              </tr>
            `).join('') : '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #888;">No leave history found for this session.</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 50px; text-align: center; font-size: 10px; color: #aaa; border-top: 1px solid #eee; padding-top: 20px;">
          This is a computer generated report for internal records.
        </div>
      </body>
    </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContents);
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
        // printWindow.close(); // Optional: user might want to save it as PDF manually
      }, 500);
    }
  }

  /** 8. Print Balance Summary to PDF (Entire staff list) - PREMIUM VERSION */
  printToPDF() {
    const summary = this.filteredBalanceSummary();
    const headers = this.leaveNames;
    const session = this.selectedSession() || this.activeSession();
    
    let printContents = `
    <html>
      <head>
        <title>Master Leave Balance Summary - ${session}</title>
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap');
          body { font-family: 'Inter', sans-serif; padding: 40px; color: #333; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #1e3c72; padding-bottom: 15px; margin-bottom: 30px; }
          .header-left h2 { margin: 0; color: #1e3c72; font-size: 24px; font-weight: 700; }
          .meta { font-size: 13px; color: #666; font-style: italic; }
          
          table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; table-layout: fixed; }
          th { background-color: #f1f4f9; color: #1e3c72; font-weight: 700; text-align: center; padding: 10px 5px; border: 1px solid #e1e9f4; }
          td { padding: 8px 5px; border: 1px solid #eee; text-align: center; }
          
          .staff-col { text-align: left; font-weight: 700; width: 150px; }
          .code-col { width: 50px; }
          .dept-col { width: 50px; }
          .sr-col { width: 40px; }
          
          .bal-used { font-size: 9px; color: #888; display: block; border-bottom: 1px solid #f0f0f0; margin-bottom: 2px; }
          .bal-rem { font-weight: 700; color: #1e3c72; font-size: 11px; }
          
          @media print {
            body { padding: 20px; }
            th { -webkit-print-color-adjust: exact; background-color: #f1f4f9 !important; }
            table { page-break-inside: auto; }
            tr { page-break-inside: avoid; page-break-after: auto; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="header-left">
            <h2>Master Leave Balance Summary</h2>
            <div class="meta">Academic Session: ${session}</div>
          </div>
          <div class="meta">Generated: ${new Date().toLocaleDateString()}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th class="sr-col">Sr.</th>
              <th class="staff-col">Employee Name</th>
              <th class="code-col">Code</th>
              <th class="dept-col">Dept</th>
              ${headers.map(h => `<th>${h}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
    `;

    summary.forEach((s, i) => {
      printContents += `
        <tr>
          <td class="sr-col">${i + 1}</td>
          <td class="staff-col">${s.name}</td>
          <td class="code-col">${s.empCode}</td>
          <td class="dept-col">${s.dept}</td>
          ${headers.map(h => {
            const bal = this.getBalance(s.balances, h);
            return `
              <td>
                <span class="bal-used">${bal.used}/${bal.limit}</span>
                <span class="bal-rem">${bal.balance}</span>
              </td>
            `;
          }).join('')}
        </tr>
      `;
    });

    printContents += `
          </tbody>
        </table>
        <div style="margin-top: 30px; text-align: center; font-size: 9px; color: #aaa; border-top: 1px solid #eee; padding-top: 10px;">
          This internal report provides a live summary of leave balances for all staff members.
        </div>
      </body>
    </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(printContents);
      printWindow.document.close();
      printWindow.focus();
      
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 500);
    }
  }
}
