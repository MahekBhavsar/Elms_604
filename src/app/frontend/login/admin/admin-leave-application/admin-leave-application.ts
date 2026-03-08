import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';

@Component({
  selector: 'app-admin-leave-application',
  imports: [CommonModule, FormsModule,AdminSidebar],
  templateUrl: './admin-leave-application.html',
  styleUrl: './admin-leave-application.css',
})
export class AdminLeaveApplication implements OnInit {
  // Signals for fine-grained reactivity (Angular 21+)
  staffData = signal<any>({});
  remainingBalance = signal<number>(0);
  selectedFile = signal<File | null>(null);
  
  leaveForm = {
    Emp_CODE: null,
    Name: '',
    Dept_Code: null,
    Type_of_Leave: 'CL',
    From: '',
    To: '',
    Total_Days: signal(0), // Signal for instant UI feedback on days count
    Role: ''
  };

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = localStorage.getItem('user');
      if (savedUser) {
        const user = JSON.parse(savedUser);
        this.staffData.set(user);
        
        this.leaveForm.Emp_CODE = user.empCode;
        this.leaveForm.Name = user.name;
        // Logic: HODs/Admins use their dept_code, others default to 1
        this.leaveForm.Dept_Code = user.dept_code || 1;
        this.leaveForm.Role = user.role;
        
        this.fetchBalance();
      }
    }
  }

  fetchBalance() {
    this.http.get<any[]>(`http://localhost:5000/api/staff`).subscribe(staffList => {
      const me = staffList.find((s: any) => s.Employee_Code === this.leaveForm.Emp_CODE);
      if (me) {
        this.remainingBalance.set(me.leaveBalance ?? 30);
      }
    });
  }

  onFileSelected(event: any) {
    this.selectedFile.set(event.target.files[0]);
  }

  calculateDays() {
    if (this.leaveForm.From && this.leaveForm.To) {
      const start = new Date(this.leaveForm.From);
      const end = new Date(this.leaveForm.To);
      if (end < start) {
        this.leaveForm.Total_Days.set(0);
        return;
      }
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      this.leaveForm.Total_Days.set(days);
    }
  }

  onSubmit() {
    // Sick Leave Validation
    if (this.leaveForm.Type_of_Leave === 'SL' && !this.selectedFile()) {
      alert("⚠️ Medical document is compulsory for Sick Leave (SL).");
      return;
    }

    if (this.leaveForm.Total_Days() > this.remainingBalance()) {
      alert(`Insufficient Balance! You only have ${this.remainingBalance()} days left.`);
      return;
    }

    const formData = new FormData();
    // Append fields including computed signal value
    formData.append('Emp_CODE', String(this.leaveForm.Emp_CODE));
    formData.append('Name', this.leaveForm.Name);
    formData.append('Dept_Code', String(this.leaveForm.Dept_Code));
    formData.append('Type_of_Leave', this.leaveForm.Type_of_Leave);
    formData.append('From', this.leaveForm.From);
    formData.append('To', this.leaveForm.To);
    formData.append('Total_Days', String(this.leaveForm.Total_Days()));
    formData.append('Role', this.leaveForm.Role);

    if (this.selectedFile()) {
      formData.append('document', this.selectedFile()!);
    }

    this.http.post('http://localhost:5000/api/leaves/apply', formData).subscribe({
      next: () => {
        alert("✅ Leave application submitted successfully!");
        this.resetForm();
      },
      error: () => alert("❌ Error applying. Please try again.")
    });
  }

  resetForm() {
    this.leaveForm.From = '';
    this.leaveForm.To = '';
    this.leaveForm.Total_Days.set(0);
    this.selectedFile.set(null);
    this.fetchBalance(); 
  }
}