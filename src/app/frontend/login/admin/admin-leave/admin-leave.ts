import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

@Component({
  selector: 'app-admin-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, UpperCasePipe],
  templateUrl: './admin-leave.html'
})
export class AdminLeave implements OnInit {
  private allLeaves = signal<any[]>([]);

  searchStaff = signal('');
  searchLeave = signal('');
  deptFilter = signal('');
  activeSessionName = signal('');

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    this.initializeSession();
    this.fetchStaffAndLeaves();
  }

  initializeSession() {
    let cached = null;
    if (isPlatformBrowser(this.platformId)) {
      cached = sessionStorage.getItem('activeSessionName');
    }
    if (cached) {
      this.activeSessionName.set(cached);
    } else {
      this.http.get<any>('/api/active-session').subscribe(res => {
        if (res && res.sessionName && res.sessionName !== "Not Set") {
          this.activeSessionName.set(res.sessionName);
          if (isPlatformBrowser(this.platformId)) {
            sessionStorage.setItem('activeSessionName', res.sessionName);
          }
        }
      });
    }
  }

  fetchStaffAndLeaves() {
    this.http.get<any[]>('/api/staff').subscribe({
      next: (staffData) => {
        const roleMap = new Map<number, string>();
        staffData.forEach(staff => {
          roleMap.set(staff['Employee Code'], staff.role || staff.Role || 'Staff');
        });
        this.fetchLeaves(roleMap);
      },
      error: (err) => console.error("Error fetching staff:", err)
    });
  }

  fetchLeaves(roleMap: Map<number, string>) {
    this.http.get<any[]>('/api/leaves/admin').subscribe({
      next: (data) => {
        if (data.length === 0) {
          this.allLeaves.set([]);
          return;
        }

        // Create balance requests for every single leave item
        const session = this.activeSessionName() || 'Active';
        const balanceRequests = data.map(leave => 
          this.http.get<any>(`/api/leaves/balance/${leave.Emp_CODE}/${leave['Type of Leave'] || leave.Type_of_Leave}?sessionName=${session}`)
          .pipe(catchError(() => of({ balance: 0, isIncrementing: false })))
        );

        forkJoin(balanceRequests).subscribe(balances => {
          const enrichedLeaves = data.map((leave, index) => ({
            ...leave,
            role: leave.role || leave.Role || roleMap.get(leave.Emp_CODE) || 'Staff',
            liveBalance: balances[index].balance,
            isIncrementing: balances[index].isIncrementing
          }));
          
          this.allLeaves.set(enrichedLeaves.sort((a, b) => Number(a.Dept_Code || 0) - Number(b.Dept_Code || 0)));
        });
      }
    });
  }

  private filteredLeaves = computed(() => {
    const staff = this.searchStaff().toLowerCase();
    const leave = this.searchLeave().toLowerCase();
    const dept = this.deptFilter().toString().trim();

    return this.allLeaves().filter(l => {
      const nameMatch = !staff || l.Name?.toLowerCase().includes(staff) || l.Emp_CODE?.toString().includes(staff);
      const leaveMatch = !leave || (l['Type of Leave'] || l.Type_of_Leave || '').toLowerCase().includes(leave);
      const rowDept = (l.Dept_Code || l.dept_code || '').toString();
      return nameMatch && leaveMatch && (!dept || rowDept === dept);
    });
  });

  getPending = computed(() => {
    return this.filteredLeaves().filter(l => {
      const roleLower = (l.role || '').toLowerCase();
      const rowDept = l.Dept_Code ?? l.dept_code;
      const isDirect = roleLower === 'hod' || roleLower === 'admin' || [0, "0", null, undefined, ''].includes(rowDept);
      return l.Status === 'Pending' && !isDirect;
    });
  });

  getHodApproved = computed(() => {
    return this.filteredLeaves().filter(l => {
      if (l.Status === 'HOD Approved') return true;
      const roleLower = (l.role || '').toLowerCase();
      const rowDept = l.Dept_Code ?? l.dept_code;
      const isDirect = roleLower === 'hod' || roleLower === 'admin' || [0, "0", null, undefined, ''].includes(rowDept);
      return l.Status === 'Pending' && isDirect;
    });
  });

  getFinalProcessed = computed(() => {
    return this.filteredLeaves().filter(l => ['Approved', 'Rejected'].includes(l.Status));
  });

  processLeave(id: string, decision: 'Approved' | 'Rejected') {
    let remark = '';
    if (decision === 'Rejected') {
      const input = prompt("Enter rejection reason:");
      if (input === null || !input.trim()) return;
      remark = input.trim();
    }

    if (confirm(`Confirm ${decision}?`)) {
      this.http.post(`/api/leaves/process/${id}`, { status: decision, reason: remark })
        .subscribe(() => {
          alert(`Leave ${decision} successfully`);
          this.fetchStaffAndLeaves();
        });
    }
  }
}
