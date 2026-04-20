import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { LanguageService } from '../../../../shared/language.service';
import { OfflineSyncService } from '../../../../offline-sync.service';
import { API_BASE, UPLOAD_BASE } from '../../../../api.config';

@Component({
  selector: 'app-admin-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, UpperCasePipe],
  templateUrl: './admin-leave.html'
})
export class AdminLeave implements OnInit {
  apiBase = API_BASE;
  uploadBase = UPLOAD_BASE;
  private allLeaves = signal<any[]>([]);

  searchStaff = signal('');
  searchLeave = signal('');
  deptFilter = signal('');
  activeSessionName = signal('');

  // ── Modal State ───────────────────────────────────────────────
  showConfirmModal = signal(false);
  showRejectModal  = signal(false);
  modalLeaveId     = signal('');
  modalDecision    = signal<'Approved' | 'Rejected'>('Approved');
  rejectRemark     = signal('');
  isProcessing     = signal(false);
  isLoading        = signal(false); // NEW: Track background refreshes
  toastMsg         = signal('');
  toastType        = signal<'success' | 'danger'>('success');

  constructor(
    private http: HttpClient,
    private offlineSync: OfflineSyncService,
    public langService: LanguageService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  t(key: string): string {
    return this.langService.translate(key);
  }

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
    this.isLoading.set(true);
    const session = this.activeSessionName() || 'Active';

    // 1. Fetch Leaves and Bulk Balances in parallel
    forkJoin({
      leaves: this.http.get<any[]>('/api/leaves/admin'),
      bulk: this.http.get<any[]>(`/api/leaves/balances/bulk?sessionName=${session}`)
    }).subscribe({
      next: (res) => {
        const data = res.leaves;
        const bulkData = res.bulk;

        // 2. Map bulk data for fast lookup
        const balanceMap = new Map<string, any>();
        bulkData.forEach(user => {
          user.balances.forEach((b: any) => {
            const key = `${user.empCode}_${b.leave.toUpperCase().trim()}`;
            balanceMap.set(key, b);
          });
        });

        // ── OFFLINE MERGE LOGIC ──
        this.offlineSync.getQueue().then((queue: any[]) => {
          const offlineDecorated = queue.map((q: any) => ({
            ...q.payload,
            _id: 'offline_' + q.id,
            Status: 'Offline Sync Pending',
            role: 'Staff',
            liveBalance: 0,
            isOfflineRecord: true
          }));

          const combinedData = [...offlineDecorated, ...data];

          // 3. Enrich leave records using the map
          const enrichedLeaves = combinedData.map(leave => {
            const typeKey = (leave['Type of Leave'] || leave.Type_of_Leave || '').toUpperCase().trim();
            const balanceKey = `${leave.Emp_CODE}_${typeKey}`;
            const b = balanceMap.get(balanceKey);

            return {
              ...leave,
              role: leave.role || leave.Role || roleMap.get(leave.Emp_CODE) || 'Staff',
              liveBalance: b ? b.balance : 0,
              isIncrementing: b ? b.isIncrementing : false
            };
          });

          this.allLeaves.set(enrichedLeaves.sort((a, b) => Number(a.Dept_Code || 0) - Number(b.Dept_Code || 0)));
          this.isLoading.set(false);
        });
      },
      error: (err) => {
        console.error("Fetch Data Error:", err);
        this.isLoading.set(false);
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
      const isDirect = roleLower.includes('hod') || roleLower.includes('admin') || [0, "0", null, undefined, ''].includes(rowDept);
      return (l.Status === 'Pending' || l.Status === 'Offline Sync Pending') && !isDirect;
    });
  });

  getHodApproved = computed(() => {
    return this.filteredLeaves().filter(l => {
      if (l.Status === 'HOD Approved') return true;
      const roleLower = (l.role || '').toLowerCase();
      const rowDept = l.Dept_Code ?? l.dept_code;
      const isDirect = roleLower.includes('hod') || roleLower.includes('admin') || [0, "0", null, undefined, ''].includes(rowDept);
      return (l.Status === 'Pending' || l.Status === 'Offline Sync Pending') && isDirect;
    });
  });

  getFinalProcessed = computed(() => {
    return this.filteredLeaves().filter(l => ['Approved', 'Rejected'].includes(l.Status));
  });

  // ── Modal Trigger (replaces alert/confirm/prompt) ─────────────
  processLeave(id: string, decision: 'Approved' | 'Rejected') {
    if (id.startsWith('offline_')) {
      this.showToast('This application is still syncing. Please wait.', 'danger');
      return;
    }
    this.modalLeaveId.set(id);
    this.modalDecision.set(decision);
    this.rejectRemark.set('');
    if (decision === 'Rejected') {
      this.showRejectModal.set(true);
    } else {
      this.showConfirmModal.set(true);
    }
  }

  confirmApprove() {
    this.showConfirmModal.set(false);
    this.submitDecision(this.modalLeaveId(), 'Approved', '');
  }

  confirmReject() {
    const remark = this.rejectRemark().trim();
    if (!remark) return; // require a reason
    this.showRejectModal.set(false);
    this.submitDecision(this.modalLeaveId(), 'Rejected', remark);
  }

  cancelModal() {
    this.showConfirmModal.set(false);
    this.showRejectModal.set(false);
  }

  private submitDecision(id: string, decision: 'Approved' | 'Rejected', remark: string) {
    this.isProcessing.set(true);

    // ── Optimistic update: immediately move record out of queue ──
    this.allLeaves.update(leaves =>
      leaves.map(l => l._id === id ? { ...l, Status: decision } : l)
    );

    this.http.post(`/api/leaves/process/${id}`, { status: decision, reason: remark })
      .subscribe({
        next: () => {
          this.isProcessing.set(false);
          this.showToast(`Leave ${decision} successfully!`, 'success');
          // Background refresh to ensure full sync
          this.fetchStaffAndLeaves();
        },
        error: (err) => {
          this.isProcessing.set(false);
          // Rollback optimistic update on error
          this.fetchStaffAndLeaves();
          this.showToast('Action failed. Please try again.', 'danger');
          console.error('processLeave error:', err);
        }
      });
  }

  private showToast(msg: string, type: 'success' | 'danger') {
    this.toastMsg.set(msg);
    this.toastType.set(type);
    setTimeout(() => this.toastMsg.set(''), 3500);
  }
}
