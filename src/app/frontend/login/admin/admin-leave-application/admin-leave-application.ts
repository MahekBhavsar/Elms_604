import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { forkJoin } from 'rxjs';
import { OfflineSyncService } from '../../../../offline-sync.service';
@Component({
  selector: 'app-admin-leave-application',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar],
  templateUrl: './admin-leave-application.html',
  styleUrl: './admin-leave-application.css',
})
export class AdminLeaveApplication implements OnInit {
  // Helper to extract Sr No robustly
  getSrNo(l: any): any {
    return l?.sr_no ?? '-';
  }

  staffData = signal<any>({});
  remainingBalance = signal<number>(0);
  displayValue = signal<number>(0);
  isIncrementing = signal<boolean>(false);
  selectedFile = signal<File | null>(null);
  searchEmpCode = '';
  isEmpFound = signal<boolean>(false);
  employeeBalances = signal<any[]>([]);
  expandedType = signal<string | null>(null);
  leaveHistory = signal<any[]>([]);
  srNoAlreadyExists = signal<boolean>(false);
  
  leaveTypes = signal<any[]>([]);
  
  leaveForm = {
    sr_no: '', 
    Emp_CODE: null,
    Name: '',
    Dept_Code: null,
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
        this.leaveForm.Dept_Code = user.dept_code || 1;
        this.leaveForm.Role = user.role;
        
        this.fetchLastSrNo(user.empCode);
      }
    }
  }

  fetchLastSrNo(empCode: any) {
    if (!empCode) return;
    this.http.get<any>(`/api/leaves/next-sr-no/${empCode}`).subscribe({
      next: (res) => {
        this.leaveForm.sr_no = String(res.nextSrNo);
        this.srNoAlreadyExists.set(false);
      },
      error: () => { this.leaveForm.sr_no = '1'; }
    });
  }

  checkSrNoDuplicate() {
    const srNo = (this.leaveForm.sr_no || '').toString().trim();
    if (!srNo) return;
    this.http.get<any>(`/api/leaves/check-sr-no/${srNo}`).subscribe({
      next: (res) => {
        if (res.exists) {
          this.srNoAlreadyExists.set(true);
          alert(`⚠️ Sr. No. "${srNo}" Already Exists! Please use a different serial number.`);
        } else {
          this.srNoAlreadyExists.set(false);
        }
      },
      error: () => { this.srNoAlreadyExists.set(false); }
    });
  }

  onEmpCodeSearch() {
    if (!this.searchEmpCode) return;
    
    this.http.get<any>(`/api/admin/employee-results/${this.searchEmpCode}`).subscribe({
      next: (res) => {
        this.isEmpFound.set(true);
        const user = res.user;
        this.leaveForm.Emp_CODE = user.empCode;
        this.leaveForm.Name = user.name;
        this.leaveForm.Dept_Code = user.dept_code;
        this.leaveForm.Role = user.role;
        (this as any).searchedStaffType = user.staffType;
        
        this.employeeBalances.set(res.balances || []);
        
        // Auto-fill Sr. No. for this employee and fetch leave types
        this.fetchLastSrNo(user.empCode);
        this.fetchLeaveTypes();
      },
      error: (err) => {
        console.error("Employee not found", err);
        alert("❌ Employee not found!");
        this.isEmpFound.set(false);
      }
    });
  }

  onEmpCodeChange() {
    if (this.searchEmpCode && this.searchEmpCode.toString().length >= 3) {
      this.onEmpCodeSearch();
    } else if (!this.searchEmpCode) {
      this.isEmpFound.set(false);
    }
  }

  toggleHistory(type: string) {
    if (this.expandedType() === type) {
      this.expandedType.set(null);
      this.leaveHistory.set([]);
    } else {
      this.expandedType.set(type);
      this.http.get<any[]>(`/api/admin/leave-history/${this.leaveForm.Emp_CODE}/${type}`)
        .subscribe({
          next: (res) => this.leaveHistory.set(res),
          error: (err) => console.error("Error fetching history", err)
        });
    }
  }

  fetchLeaveTypes() {
    forkJoin({
      session: this.http.get<any>('/api/active-session'),
      rules: this.http.get<any[]>('/api/leave-types')
    }).subscribe({
      next: (res) => {
        const currentSessionLabel = res.session.sessionName;
        // FIX: use ?? '' so that numeric 0 is preserved as '0', not converted to ''
        const normalize = (v: any) => String(v ?? '').trim();
        
        // FIX: Admin is applying for a specific employee. Use the employee's Dept_Code, NOT the admin's!
        const userDept = normalize(this.leaveForm.Dept_Code);
        const userStaffType = normalize((this as any).searchedStaffType || 'Teaching').toLowerCase();

        const allApplicableRules = res.rules.filter(r => {
          const rSession = normalize(r.sessionName);
          if (rSession !== normalize(currentSessionLabel)) return false;

          const rDept = normalize(r.dept_code);
          // '0' or '' = global (all depts), otherwise must match employee's dept
          if (!(rDept === '0' || rDept === '' || userDept === rDept)) return false;

          const rStaffType = normalize(r.staffType || 'All').toLowerCase();
          return rStaffType === userStaffType || rStaffType === 'all';
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

        const uniqueNames = [...new Set(Array.from(bestRulesMap.values()).map(r => r.leave_name))];
        this.leaveTypes.set(uniqueNames);
        // Only auto-select EL if it's the first time and we have rules
        if (uniqueNames.length > 0 && !this.leaveForm.Type_of_Leave) {
          this.leaveForm.Type_of_Leave = uniqueNames[0];
          this.fetchBalance(); 
        } else if (this.leaveForm.Type_of_Leave) {
           this.fetchBalance();
        }
      },
      error: (err) => console.error("Error fetching leave types", err)
    });
  }

  fetchBalance() {
    if (!this.leaveForm.Emp_CODE || !this.leaveForm.Type_of_Leave) return;

    this.http.get<any>(`/api/leaves/balance/${this.leaveForm.Emp_CODE}/${this.leaveForm.Type_of_Leave}`)
      .subscribe({
        next: (res) => {
          this.isIncrementing.set(res.isIncrementing || false);
          const carryForward = Number(res.carry_forward || 0);
          const currentSession = Number(res.balance || 0);
          
          this.remainingBalance.set(carryForward + currentSession);
          this.displayValue.set(carryForward + currentSession);
        },
        error: (err) => {
          console.error("Error fetching balance", err);
          this.remainingBalance.set(0);
          this.displayValue.set(0);
          this.isIncrementing.set(false);
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
      if (end < start) {
        this.leaveForm.Total_Days.set(0);
        return;
      }
      
      let days = 0;
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end);
      endDate.setHours(0, 0, 0, 0);

      while (currentDate <= endDate) {
        // 0 corresponds to Sunday in JavaScript
        if (currentDate.getDay() !== 0) {
          days++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      this.leaveForm.Total_Days.set(days);
    }
  }

  onSubmit() {
    const totalDays = this.leaveForm.Total_Days();

    if (!this.leaveForm.sr_no) {
      alert("⚠️ Please enter a Serial Number (Sr. No.)");
      return;
    }

    if (this.srNoAlreadyExists()) {
      alert(`⚠️ Sr. No. "${this.leaveForm.sr_no}" Already Exists! Please use a different serial number.`);
      return;
    }

    // VAL working dates check
    if (this.leaveForm.Type_of_Leave === 'VAL' && !this.leaveForm.VAL_working_dates.trim()) {
      alert("⚠️ Please mention the 3 working dates during vacation for VAL leave.");
      return;
    }

    if (this.leaveForm.Type_of_Leave === 'SL' && totalDays > 3 && !this.selectedFile()) {
      alert("⚠️ Medical document is compulsory for Sick Leave (SL) exceeding 3 days.");
      return;
    }

    if (!this.isIncrementing() && totalDays > this.remainingBalance()) {
      alert(`Insufficient Balance! You only have ${this.remainingBalance()} days available.`);
      return;
    }

    const payload: any = {
      sr_no: Number(this.leaveForm.sr_no), // Strict Number
      Emp_CODE: String(this.leaveForm.Emp_CODE),
      Name: this.leaveForm.Name,
      Dept_Code: String(this.leaveForm.Dept_Code),
      Type_of_Leave: this.leaveForm.Type_of_Leave,
      From: this.leaveForm.From,
      To: this.leaveForm.To,
      Total_Days: String(totalDays),
      Role: this.leaveForm.Role,
      Reason: this.leaveForm.Reason,
      Applied_By_Admin: 'true'
    };

    if (this.leaveForm.Type_of_Leave === 'VAL') {
      payload.VAL_working_dates = this.leaveForm.VAL_working_dates;
    }

    // ALWAYS SAVE LOCALLY FIRST (Offline-First Architecture)
    this.offlineSync.saveLeaveOffline(payload, this.selectedFile() || null).then((success: boolean) => {
      if (success) {
        alert('✅ Application Saved Locally!');
        this.resetForm();
        this.fetchLastSrNo(this.leaveForm.Emp_CODE);
        
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
    this.leaveForm.Total_Days.set(0);
    this.leaveForm.VAL_working_dates = '';
    this.leaveForm.Reason = '';
    this.selectedFile.set(null);
    this.srNoAlreadyExists.set(false);
    this.fetchBalance(); 
  }
}
