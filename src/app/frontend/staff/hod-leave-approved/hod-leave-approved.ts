import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-hod-leave-approved',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './hod-leave-approved.html',
  styleUrl: './hod-leave-approved.css',
})
export class HodLeaveApproved implements OnInit {
  myDeptLeaves: any[] = [];
  hodData: any = {};

  constructor(private http: HttpClient) { }

  ngOnInit() {
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.hodData = JSON.parse(savedUser);
      this.fetchLeaves();
    }
  }

  fetchLeaves() {
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe(data => {
      // Filter strictly by the HOD's department code
      this.myDeptLeaves = data.filter(l => l.Dept_Code === this.hodData.dept_code);
    });
  }

  getPending() {
    return this.myDeptLeaves.filter(l => l.Status === 'Pending');
  }

  getProcessed() {
    return this.myDeptLeaves.filter(l => l.Status === 'HOD Approved' || l.Status === 'Rejected');
  }

  processLeave(id: string, decision: 'HOD Approved' | 'Rejected') {
    if (confirm(`Are you sure you want to mark this request as ${decision}?`)) {
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
