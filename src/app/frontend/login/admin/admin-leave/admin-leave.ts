import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';

@Component({
  selector: 'app-admin-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, UpperCasePipe],
  templateUrl: './admin-leave.html'
})
export class AdminLeave implements OnInit {
  private allLeaves = signal<any[]>([]);

  // Search & Filter Signals
  searchStaff = signal('');
  searchLeave = signal('');
  deptFilter = signal('');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.fetchLeaves();
  }

  fetchLeaves() {
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe({
      next: (data) => {
        // Sort by Dept_Code initially for better organization
        const sorted = data.sort((a, b) => Number(a.Dept_Code || 0) - Number(b.Dept_Code || 0));
        this.allLeaves.set(sorted);
      },
      error: (err) => console.error("Error fetching admin leaves:", err)
    });
  }

  /** PERFECTED UNIFIED FILTER - Handles Search and Dept Code logic */
  private filteredLeaves = computed(() => {
    const staff = this.searchStaff().toLowerCase();
    const leave = this.searchLeave().toLowerCase();
    const dept = this.deptFilter().toString().trim();

    return this.allLeaves().filter(l => {
      const nameMatch = !staff || l.Name?.toLowerCase().includes(staff) || l.Emp_CODE?.toString().includes(staff);
      const leaveMatch = !leave || (l['Type of Leave'] || l.Type_of_Leave || '').toLowerCase().includes(leave);
      
      // Fix: Handle dept_code string/number variations from DB
      const rowDept = (l.Dept_Code || l.dept_code || '').toString();
      const deptMatch = !dept || rowDept === dept;

      return nameMatch && leaveMatch && deptMatch;
    });
  });

  /** 1. Awaiting HOD Approval (STRICT EXCLUSION) 
   * Uses filteredLeaves() to respect search bar while excluding HODs and Direct Staff
   */
  getPending = computed(() => {
    return this.filteredLeaves().filter(l => {
      const isPending = l.Status === 'Pending';
      const roleLower = l.role?.toLowerCase();
      // Exclusion logic: HOD requests and Direct Staff bypass this list
      const isNotHod = roleLower !== 'hod';
      const isNotDirectStaff = l.dept_code !== 0 && l.dept_code !== "0" && l.dept_code !== null && l.dept_code !== undefined;

      return isPending && isNotHod && isNotDirectStaff;
    });
  });

  /** 2. Action Required: Admin Decision (STRICT INCLUSION)
   * Uses filteredLeaves() to respect search bar
   */
  getHodApproved = computed(() => {
    return this.filteredLeaves().filter(l => {
      if (l.Status === 'HOD Approved') return true;

      const roleLower = l.role?.toLowerCase();
      // Inclusion logic: HODs and Direct Staff go straight to Admin
      const isDirectAction = l.Status === 'Pending' && (
        roleLower === 'hod' ||
        roleLower === 'admin' ||
        l.dept_code === 0 ||
        l.dept_code === "0" ||
        !l.dept_code
      );

      return isDirectAction;
    });
  });

  /** 3. Processed History (Computed) 
   * Uses filteredLeaves() to respect search bar
   */
  getFinalProcessed = computed(() => {
    return this.filteredLeaves().filter(l => l.Status === 'Approved' || l.Status === 'Rejected');
  });

  processLeave(id: string, decision: 'Approved' | 'Rejected') {
    let remark = '';
    if (decision === 'Rejected') {
      const input = prompt("Please enter the reason for rejection:");
      if (input === null) return;
      if (!input.trim()) {
        alert("A rejection reason is required.");
        return;
      }
      remark = input.trim();
    }

    if (confirm(`Are you sure you want to ${decision} this request?`)) {
      this.http.post(`http://localhost:5000/api/leaves/process/${id}`, {
        status: decision,
        reason: remark
      }).subscribe({
        next: () => {
          alert(`Leave ${decision} successfully`);
          this.fetchLeaves();
        },
        error: (err) => alert("Failed to process decision.")
      });
    }
  }
}