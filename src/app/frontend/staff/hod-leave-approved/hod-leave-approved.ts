import { Component, OnInit, ChangeDetectorRef, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { DisplayDatePipe } from '../../../shared/pipes/display-date.pipe';
import { OfflineSyncService } from '../../../offline-sync.service';
import { OnDestroy } from '@angular/core';

@Component({
  selector: 'app-hod-leave-approved',
  standalone: true,
  imports: [CommonModule, StaffSidebar, DisplayDatePipe],
  templateUrl: './hod-leave-approved.html',
  styleUrl: './hod-leave-approved.css',
})
export class HodLeaveApproved implements OnInit, OnDestroy {
  myDeptLeaves: any[] = [];
  hodData: any = {};
  private pollInterval: any;

  constructor(
    private http: HttpClient, 
    private cdr: ChangeDetectorRef,
    private offlineSync: OfflineSyncService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    // Safely access sessionStorage only in the browser to avoid SSR errors
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        this.hodData = JSON.parse(savedUser);
        this.fetchLeaves();
        // Poll for new requests in HOD's department
        this.pollInterval = setInterval(() => this.fetchLeaves(true), 120000); // 2 mins
        this.requestNotificationPermission();
      }
    }
  }

  fetchLeaves(isPoll = false) {
    this.http.get<any[]>('/api/leaves/admin').subscribe({
      next: (data) => {
        // --- OFFLINE MERGE LOGIC ---
        this.offlineSync.getQueue().then(queue => {
          const deptOffline = queue.filter(q => 
            Number(q.payload.Dept_Code) === Number(this.hodData.dept_code) &&
            Number(q.payload.Emp_CODE) !== Number(this.hodData.empCode)
          ).map(q => ({
            ...q.payload,
            _id: 'offline_' + q.id,
            Status: 'Offline Sync Pending',
            isOfflineRecord: true
          }));

          const combinedData = [...deptOffline, ...data];

          setTimeout(() => {
            this.myDeptLeaves = combinedData.filter(l => 
              Number(l.Dept_Code) === Number(this.hodData.dept_code) && 
              Number(l.Emp_CODE) !== Number(this.hodData.empCode)
            );
            
            this.cdr.detectChanges(); 
            this.checkNewDepartmentLeaves(this.myDeptLeaves);
          }, 0);
        });
      },
      error: (err) => console.error("Error fetching department leaves:", err)
    });
  }

  getPending() {
    return this.myDeptLeaves.filter(l => l.Status === 'Pending' || l.Status === 'Offline Sync Pending');
  }

  getProcessed() {
    return this.myDeptLeaves.filter(l => l.Status === 'HOD Approved' || l.Status === 'Rejected');
  }

  processLeave(id: string, decision: 'HOD Approved' | 'Rejected') {
    if (id.startsWith('offline_')) {
      alert("This application is still syncing from the local database. Please wait until it is uploaded to MongoDB.");
      return;
    }
    let remark = '';
    
    if (decision === 'Rejected') {
      const input = prompt("Please enter a reason for rejection:");
      if (input === null) return; 
      remark = input.trim();
      if (!remark) {
        alert("A rejection reason is required.");
        return;
      }
    }

    if (confirm(`Are you sure you want to mark this request as ${decision}?`)) {
      this.http.post(`/api/leaves/process/${id}`, { 
        status: decision,
        reason: remark 
      }).subscribe({
        next: () => {
          alert(`Leave marked as ${decision} successfully`);
          this.fetchLeaves();
        },
        error: (err) => {
          console.error(err);
          alert("Failed to process decision. Please ensure the server is running.");
        }
      });
    }
  }

  ngOnDestroy() {
    if (this.pollInterval) clearInterval(this.pollInterval);
  }

  // --- HOD NOTIFICATION LOGIC ---
  private requestNotificationPermission() {
    if (isPlatformBrowser(this.platformId) && 'Notification' in window) {
      if (Notification.permission === 'default') Notification.requestPermission();
    }
  }

  private checkNewDepartmentLeaves(leaves: any[]) {
    if (!isPlatformBrowser(this.platformId)) return;

    const storageKey = `elms_hod_notified_${this.hodData.empCode}`;
    const previousKnownIdsStr = localStorage.getItem(storageKey);
    const previousKnownIds: string[] = previousKnownIdsStr ? JSON.parse(previousKnownIdsStr) : [];
    
    let currentIds: string[] = [];
    const pending = leaves.filter(l => l.Status === 'Pending');

    pending.forEach(l => {
      currentIds.push(l._id);
      if (!previousKnownIds.includes(l._id)) {
        this.triggerHodNotification(l);
      }
    });

    localStorage.setItem(storageKey, JSON.stringify(currentIds));
  }

  private triggerHodNotification(l: any) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    new Notification('🆕 New Department Leave Request', {
      body: `${l.Name} applied for ${this.getLeaveTypeName(l)} (${l.Total_Days} days)`,
      icon: 'assets/favicon.ico'
    });
  }

  private getLeaveTypeName(l: any) {
    const n = l['Type of Leave'] || l.Type_of_Leave || l.leave_name || l.Type || '';
    return n.toString().trim().toUpperCase();
  }
}
