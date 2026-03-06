import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-staff-dashbored',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './staff-dashbored.html',
  styleUrl: './staff-dashbored.css',
})
export class StaffDashbored implements OnInit {
  user: any = null;

  // Leave Form
  leaveData = {
    TypeOfLeave: '',
    FromDate: '',
    ToDate: ''
  };
  isSubmitting = false;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    // Retrieve the dynamic user data (Email String, Password Int32, staffType, etc.)
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.user = JSON.parse(savedUser);
      if (this.user.role === 'Hod' || this.user.staffType === 'permenet') {
        this.fetchHodLeaves();
      }
    }
  }

  submitLeave() {
    if (!this.leaveData.TypeOfLeave || !this.leaveData.FromDate || !this.leaveData.ToDate) {
      alert('Please fill all fields');
      return;
    }

    const from = new Date(this.leaveData.FromDate);
    const to = new Date(this.leaveData.ToDate);

    if (to < from) {
      alert('To Date cannot be before From Date');
      return;
    }

    const diffTime = Math.abs(to.getTime() - from.getTime());
    const totalDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    this.isSubmitting = true;

    // We expect user to have empCode after my previous login endpoint change, but fallback if not
    const deptCodeMap: { [key: string]: number } = {
      'IT': 1, 'HR': 2, 'Finance': 3, 'Marketing': 4
    };
    const deptCode = deptCodeMap[this.user.dept] || 0;

    const payload = {
      Emp_CODE: this.user.empCode || Math.floor(Math.random() * 10000), // Fallback if old token
      Name: this.user.name,
      Dept_Code: deptCode,
      Type_of_Leave: this.leaveData.TypeOfLeave,
      From: this.leaveData.FromDate,
      To: this.leaveData.ToDate,
      Total_Days: totalDays,
      Role: this.user.role || this.user.staffType
    };

    this.http.post('http://localhost:5000/api/leaves/apply', payload)
      .subscribe({
        next: (res: any) => {
          this.isSubmitting = false;
          if (res.success) {
            alert('Leave application submitted successfully! Pending admin approval.');
            // Reset form
            this.leaveData = { TypeOfLeave: '', FromDate: '', ToDate: '' };
          } else {
            alert('Failed to submit leave application.');
          }
        },
        error: (err) => {
          this.isSubmitting = false;
          alert('Error submitting application. Please try again.');
          console.error(err);
        }
      });
  }

  // --- HOD Logic ---
  hodLeaves: any[] = [];

  fetchHodLeaves() {
    this.http.get<any[]>(`http://localhost:5000/api/leaves/hod`).subscribe(data => {
      this.hodLeaves = data;
    });
  }

  processLeave(id: string, decision: 'HOD Approved' | 'Rejected') {
    if (confirm(`Are you sure you want to ${decision} this request?`)) {
      this.http.post(`http://localhost:5000/api/leaves/process/${id}`, { status: decision }).subscribe({
        next: () => {
          alert(`Leave ${decision} successfully`);
          this.fetchHodLeaves();
        },
        error: () => alert("Failed to process decision")
      });
    }
  }

  logout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}