import { Component, OnInit, ChangeDetectorRef, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { DisplayDatePipe } from '../../../shared/pipes/display-date.pipe';

@Component({
  selector: 'app-hod-leave-approved',
  standalone: true,
  imports: [CommonModule, StaffSidebar, DisplayDatePipe],
  templateUrl: './hod-leave-approved.html',
  styleUrl: './hod-leave-approved.css',
})
export class HodLeaveApproved implements OnInit {
  myDeptLeaves: any[] = [];
  hodData: any = {};

  constructor(
    private http: HttpClient, 
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    // Safely access sessionStorage only in the browser to avoid SSR errors
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        this.hodData = JSON.parse(savedUser);
        this.fetchLeaves();
      }
    }
  }

  fetchLeaves() {
    this.http.get<any[]>('/api/leaves/admin').subscribe({
      next: (data) => {
        setTimeout(() => {
          // 1. Filter by Department Code
          // 2. EXCLUSION: Ensure HOD does NOT see their own application (Emp_CODE check)
          this.myDeptLeaves = data.filter(l => 
            Number(l.Dept_Code) === Number(this.hodData.dept_code) && 
            Number(l.Emp_CODE) !== Number(this.hodData.empCode)
          );
          
          this.cdr.detectChanges(); 
        }, 0);
      },
      error: (err) => console.error("Error fetching department leaves:", err)
    });
  }

  getPending() {
    return this.myDeptLeaves.filter(l => l.Status === 'Pending');
  }

  getProcessed() {
    return this.myDeptLeaves.filter(l => l.Status === 'HOD Approved' || l.Status === 'Rejected');
  }

  processLeave(id: string, decision: 'HOD Approved' | 'Rejected') {
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
}
