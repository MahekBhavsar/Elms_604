import { Component, OnInit, signal, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { forkJoin, catchError, of } from 'rxjs';
import { OfflineSyncService } from '../../../offline-sync.service';

@Component({
  selector: 'app-apply-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, StaffSidebar],
  templateUrl: './apply-leave.html',
  styleUrl: './apply-leave.css'
})
export class ApplyLeave implements OnInit {
  staffData = signal<any>({});
  displayValue = signal<number>(0);
  isIncrementing = signal<boolean>(false);
  activeSession = signal<string>('');
  selectedFile = signal<File | null>(null);
  leaveTypes = signal<any[]>([]);

  // Balance Panel (same as Admin)
  employeeBalances = signal<any[]>([]);
  expandedType = signal<string | null>(null);
  leaveHistory = signal<any[]>([]);

  leaveForm = {
    sr_no: '',
    Emp_CODE: null as any,
    Name: '',
    Dept_Code: null as any,
    Type_of_Leave: '',
    From: '',
    To: '',
    Total_Days: signal(0),
    Role: '',
    VAL_working_dates: '',
    Reason: ''
  };

  constructor(
    private http: HttpClient,
    private offlineSync: OfflineSyncService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        this.staffData.set(user);
        this.leaveForm.Emp_CODE = user.empCode;
        this.leaveForm.Name = user.name;
        this.leaveForm.Dept_Code = user.dept_code;
        this.leaveForm.Role = user.role;
        this.fetchLeaveTypes();
        this.fetchLastSrNo();
      }
    }
  }

  fetchLastSrNo() {
    const empCode = this.leaveForm.Emp_CODE;
    if (!empCode) return;
    this.http.get<any>(`http://localhost:5000/api/leaves/next-sr-no/${empCode}`).subscribe({
      next: (res) => { this.leaveForm.sr_no = String(res.nextSrNo); },
      error: () => { this.leaveForm.sr_no = '1'; }
    });
  }

  fetchLeaveTypes() {
    forkJoin({
      session: this.http.get<any>('http://localhost:5000/api/active-session'),
      rules: this.http.get<any[]>('http://localhost:5000/api/leave-types')
    }).subscribe({
      next: (res) => {
        const currentSessionLabel = res.session.sessionName;
        const normalize = (v: any) => String(v || '').trim();
        const userDept = normalize(this.staffData().dept_code !== undefined ? this.staffData().dept_code : this.staffData().Dept_Code);
        const userStaffType = normalize(this.staffData().staffType || 'Teaching').toLowerCase();

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

        const uniqueNames = [...new Set(Array.from(bestRulesMap.values()).map(r => r.leave_name))].sort();
        this.leaveTypes.set(uniqueNames);
        this.activeSession.set(currentSessionLabel);

        if (uniqueNames.length > 0) {
          if (!uniqueNames.includes(this.leaveForm.Type_of_Leave)) {
            this.leaveForm.Type_of_Leave = uniqueNames[0];
          }
          this.fetchBalance();
        }

        // Fetch all balances for the side panel
        this.fetchAllBalances(currentSessionLabel, uniqueNames);
      },
      error: (err) => console.error('Error loading leave setup:', err)
    });
  }

  fetchAllBalances(session: string, leaveNames: string[]) {
    const empCode = this.leaveForm.Emp_CODE;
    if (!empCode || !leaveNames.length) return;

    const balanceCalls = leaveNames.map(name =>
      this.http.get<any>(`http://localhost:5000/api/leaves/balance/${empCode}/${name}?sessionName=${session}`)
        .pipe(catchError(() => of({ balance: 0, used: 0, limit: 0, isIncrementing: false })))
    );

    forkJoin(balanceCalls).subscribe({
      next: (results: any[]) => {
        const balances = leaveNames.map((name, i) => ({
          type: name,
          balance: results[i]?.balance ?? 0,
          used: results[i]?.usedThisYear ?? 0,
          limit: results[i]?.limit ?? 0,
          isIncrementing: results[i]?.isIncrementing ?? false
        }));
        this.employeeBalances.set(balances);
      }
    });
  }

  toggleHistory(type: string) {
    if (this.expandedType() === type) {
      this.expandedType.set(null);
      return;
    }
    this.expandedType.set(type);
    const empCode = this.leaveForm.Emp_CODE;
    const session = this.activeSession();
    this.http.get<any[]>(`http://localhost:5000/api/leaves/staff/${empCode}`)
      .pipe(catchError(() => of([])))
      .subscribe(all => {
        const filtered = all.filter((l: any) => {
          const lt = (l['Type of Leave'] || l.Type_of_Leave || '').toUpperCase();
          return lt === type && l.sessionName === session;
        });
        this.leaveHistory.set(filtered);
      });
  }

  fetchBalance() {
    const empCode = this.leaveForm.Emp_CODE;
    const type = this.leaveForm.Type_of_Leave;
    if (!empCode || !type) return;

    this.http.get<any>(`http://localhost:5000/api/leaves/balance/${empCode}/${type}`)
      .subscribe({
        next: (res) => {
          this.displayValue.set(res.balance);
          this.isIncrementing.set(res.isIncrementing);
          this.activeSession.set(res.sessionName || 'Active');
        }
      });
  }

  onFileSelected(event: any) {
    this.selectedFile.set(event.target.files[0]);
  }

  calculateDays() {
    if (this.leaveForm.From && this.leaveForm.To) {
      const start = new Date(this.leaveForm.From);
      const end = new Date(this.leaveForm.To);
      if (end < start) { this.leaveForm.Total_Days.set(0); return; }

      let days = 0;
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end);
      endDate.setHours(0, 0, 0, 0);

      while (currentDate <= endDate) {
        if (currentDate.getDay() !== 0) days++;
        currentDate.setDate(currentDate.getDate() + 1);
      }
      this.leaveForm.Total_Days.set(days);
    }
  }

  onSubmit() {
    const days = this.leaveForm.Total_Days();

    if (!this.leaveForm.sr_no) { alert('⚠️ Serial Number is required.'); return; }
    if (this.leaveForm.Type_of_Leave === 'VAL' && !this.leaveForm.VAL_working_dates.trim()) {
      alert('⚠️ Please mention the 3 working dates during vacation for VAL leave.'); return;
    }
    if (this.leaveForm.Type_of_Leave === 'SL' && days > 3 && !this.selectedFile()) {
      alert('⚠️ Medical document is compulsory for Sick Leave (SL) exceeding 3 days.'); return;
    }
    if (!this.isIncrementing() && days > this.displayValue()) {
      alert(`Insufficient Balance! Available: ${this.displayValue()} days.`); return;
    }

    const payload: any = {
      sr_no: this.leaveForm.sr_no,
      Emp_CODE: String(this.leaveForm.Emp_CODE),
      Name: this.leaveForm.Name,
      Dept_Code: String(this.leaveForm.Dept_Code),
      Type_of_Leave: this.leaveForm.Type_of_Leave,
      From: this.leaveForm.From,
      To: this.leaveForm.To,
      Total_Days: String(days),
      Role: this.leaveForm.Role,
      Reason: this.leaveForm.Reason || ''
    };
    if (this.leaveForm.Type_of_Leave === 'VAL') {
      payload.VAL_working_dates = this.leaveForm.VAL_working_dates;
    }

    // ALWAYS SAVE LOCALLY FIRST (Offline-First Architecture)
    this.offlineSync.saveLeaveOffline(payload, this.selectedFile() || null).then(success => {
      if (success) {
        alert('✅ Application Saved Locally!');
        this.resetForm();
        
        // Let the daemon securely push it to MongoDB if internet is on
        this.offlineSync.syncNow();
        
      } else {
        alert('❌ Local Database Save Failed.');
      }
    });
  }

  resetForm() {
    this.leaveForm.sr_no = '';
    this.leaveForm.From = '';
    this.leaveForm.To = '';
    this.leaveForm.Reason = '';
    this.leaveForm.Total_Days.set(0);
    this.leaveForm.VAL_working_dates = '';
    this.selectedFile.set(null);
    this.fetchLastSrNo();
    this.fetchBalance();
  }
}