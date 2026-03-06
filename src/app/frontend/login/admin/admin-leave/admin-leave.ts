import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-leave',
  standalone: true,
  imports: [RouterLink, CommonModule],
  templateUrl: './admin-leave.html'
})
export class AdminLeave implements OnInit {
  allLeaves: any[] = [];

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchLeaves();
  }

  fetchLeaves() {
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe(data => {
      this.allLeaves = data;
    });
  }

  // 1. Pending HOD Section
  getPending() {
    return this.allLeaves.filter(l => l.Status === 'Pending');
  }

  // 2. Action Required (Cleared by HOD) Section
  getHodApproved() {
    return this.allLeaves.filter(l => l.Status === 'HOD Approved');
  }

  // 3. Final History Section
  getFinalProcessed() {
    return this.allLeaves.filter(l => l.Status === 'Approved' || l.Status === 'Rejected');
  }

  // Final Admin Decision Function
  processLeave(id: string, decision: 'Approved' | 'Rejected') {
    if (confirm(`Are you sure you want to ${decision} this request?`)) {
      this.http.post(`http://localhost:5000/api/leaves/process/${id}`, { status: decision }).subscribe({
        next: () => {
          alert(`Leave ${decision} successfully`);
          this.fetchLeaves();
        },
        error: () => alert("Failed to process decision")
      });
    }
  }
}