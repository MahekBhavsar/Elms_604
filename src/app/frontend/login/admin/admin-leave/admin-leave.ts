import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

@Component({
  selector: 'app-admin-leave',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, CommonModule],
  templateUrl: './admin-leave.html'
})
export class AdminLeave implements OnInit {
  allLeaves: any[] = [];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchLeaves();
  }

  fetchLeaves() {
    // Fetches from the enriched admin endpoint
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe({
      next: (data) => {
        this.allLeaves = data;
      },
      error: (err) => console.error("Error fetching admin leaves:", err)
    });
  }

  // 1. Pending HOD Section: Staff entries waiting for their department head
  getPending() {
    return this.allLeaves.filter(l => l.Status === 'Pending');
  }

  // 2. Action Required: Entries already cleared by HOD
  getHodApproved() {
    return this.allLeaves.filter(l => l.Status === 'HOD Approved');
  }

  // 3. Final History Section: Shows 'Approved' or 'Rejected'
  getFinalProcessed() {
    return this.allLeaves.filter(l => l.Status === 'Approved' || l.Status === 'Rejected');
  }

  // Final Decision Logic
  processLeave(id: string, decision: 'Approved' | 'Rejected') {
    if (confirm(`Are you sure you want to ${decision} this request?`)) {
      this.http.post(`http://localhost:5000/api/leaves/process/${id}`, { status: decision }).subscribe({
        next: () => {
          alert(`Leave ${decision} successfully`);
          this.fetchLeaves(); // Refresh list to show updated Remaining_Leaves
        },
        error: () => alert("Failed to process decision")
      });
    }
  }
}