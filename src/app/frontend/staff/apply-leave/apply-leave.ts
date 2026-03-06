import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-apply-leave',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './apply-leave.html',
  styleUrl: './apply-leave.css'
})
export class ApplyLeave implements OnInit {
  // Staff Details from Login
  staffData: any = {};
  
  // Form Model matching your Leave Schema
  leaveForm: any = {
    Emp_CODE: null,
    Name: '',
    Dept_Code: null,
    Type_of_Leave: 'CL',
    From: '',
    To: '',
    Total_Days: 0,
    Role: ''
  };

  // Remaining Balance (Calculated from User collection)
  remainingBalance: number = 0;

  constructor(private http: HttpClient) {}

  ngOnInit() {
    // 1. Get logged-in user details
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.staffData = JSON.parse(savedUser);
      this.leaveForm.Emp_CODE = this.staffData.empCode;
      this.leaveForm.Name = this.staffData.name;
      this.leaveForm.Dept_Code = this.staffData.dept_code || 1; // Default if not set
      this.leaveForm.Role = this.staffData.role;
      this.fetchBalance();
    }
  }

  // Fetches current leaveBalance from the 'users' collection
  fetchBalance() {
    this.http.get<any>(`http://localhost:5000/api/staff`).subscribe(staffList => {
      const me = staffList.find((s: any) => s["Employee Code"] === this.leaveForm.Emp_CODE);
      if (me) {
        this.remainingBalance = me.leaveBalance || 30; // Matches your default
      }
    });
  }

  // Auto-calculate days when dates change
  calculateDays() {
    if (this.leaveForm.From && this.leaveForm.To) {
      const start = new Date(this.leaveForm.From);
      const end = new Date(this.leaveForm.To);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      this.leaveForm.Total_Days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    }
  }

  onSubmit() {
    // Perfect logic: prevent submission if days requested > remaining balance
    if (this.leaveForm.Total_Days > this.remainingBalance) {
      alert(`Insufficient Balance! You only have ${this.remainingBalance} days left.`);
      return;
    }

    if (this.leaveForm.Total_Days <= 0) {
      alert("Please select valid dates.");
      return;
    }

    this.http.post('http://localhost:5000/api/leaves/apply', this.leaveForm).subscribe({
      next: (res: any) => {
        alert("Leave application submitted successfully!");
        this.resetForm();
      },
      error: (err) => alert("Error applying for leave.")
    });
  }

  resetForm() {
    this.leaveForm.From = '';
    this.leaveForm.To = '';
    this.leaveForm.Total_Days = 0;
    this.fetchBalance(); // Refresh balance
  }
}