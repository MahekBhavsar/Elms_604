import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { OfflineSyncService } from '../../../../offline-sync.service';
import { API_BASE } from '../../../../api.config';

@Component({
  selector: 'app-admin-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, UpperCasePipe],
  templateUrl: './admin-leave.html'
})
export class AdminLeave implements OnInit {
  apiBase = API_BASE;
  private allLeaves = signal<any[]>([]);

  searchStaff = signal('');
  searchLeave = signal('');
  deptFilter = signal('');
  activeSessionName = signal('');

  constructor(
    private http: HttpClient,
    private offlineSync: OfflineSyncService,
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
        // --- OFFLINE MERGE LOGIC ---
        this.offlineSync.getQueue().then((queue: any[]) => {
          const offlineDecorated = queue.map((q: any) => ({
            ...q.payload,
            _id: 'offline_' + q.id,
            Status: 'Offline Sync Pending', // Custom status for UI
            role: 'Staff', 
            liveBalance: 0,
            isOfflineRecord: true
          }));

          const combinedData = [...offlineDecorated, ...data];

          if (combinedData.length === 0) {
            this.allLeaves.set([]);
            return;
          }

          // Create balance requests for every single leave item (only for those already in DB)
          const session = this.activeSessionName() || 'Active';
          const balanceRequests = combinedData.map(leave => {
            if (leave.isOfflineRecord) return of({ balance: 0, isIncrementing: false });
            const typeKey = leave['Type of Leave'] || leave.Type_of_Leave;
            return this.http.get<any>(`/api/leaves/balance/${leave.Emp_CODE}/${typeKey}?sessionName=${session}`)
            .pipe(catchError(() => of({ balance: 0, isIncrementing: false })));
          });

          forkJoin(balanceRequests).subscribe(balances => {
            const enrichedLeaves = combinedData.map((leave, index) => ({
              ...leave,
              role: leave.role || leave.Role || roleMap.get(leave.Emp_CODE) || 'Staff',
              liveBalance: (balances[index] as any).balance,
              isIncrementing: (balances[index] as any).isIncrementing
            }));
            
            this.allLeaves.set(enrichedLeaves.sort((a, b) => Number(a.Dept_Code || 0) - Number(b.Dept_Code || 0)));
          });
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
      return (l.Status === 'Pending' || l.Status === 'Offline Sync Pending') && !isDirect;
    });
  });

  getHodApproved = computed(() => {
    return this.filteredLeaves().filter(l => {
      if (l.Status === 'HOD Approved') return true;
      const roleLower = (l.role || '').toLowerCase();
      const rowDept = l.Dept_Code ?? l.dept_code;
      const isDirect = roleLower === 'hod' || roleLower === 'admin' || [0, "0", null, undefined, ''].includes(rowDept);
      return (l.Status === 'Pending' || l.Status === 'Offline Sync Pending') && isDirect;
    });
  });

  getFinalProcessed = computed(() => {
    return this.filteredLeaves().filter(l => ['Approved', 'Rejected'].includes(l.Status));
  });

  processLeave(id: string, decision: 'Approved' | 'Rejected') {
    if (id.startsWith('offline_')) {
      alert("This application is still syncing from the local database. Please wait until it is uploaded to MongoDB.");
      return;
    }

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
