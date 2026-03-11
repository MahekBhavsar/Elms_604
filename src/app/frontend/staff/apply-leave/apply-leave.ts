import { Component, OnInit, signal, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';

@Component({
  selector: 'app-apply-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, StaffSidebar],
  templateUrl: './apply-leave.html',
  styleUrl: './apply-leave.css'
})
export class ApplyLeave implements OnInit {
  staffData = signal<any>({});
  remainingBalance = signal<number>(0);
  activeSession = signal<string>(''); 
  selectedFile = signal<File | null>(null);
  // NEW: Dynamic Leave Types
  leaveTypes = signal<any[]>([]);
  
  leaveForm = {
    sr_no: '', 
    Emp_CODE: null,
    Name: '',
    Dept_Code: null,
    Type_of_Leave: '',
    From: '',
    To: '',
    Total_Days: signal(0),
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
        this.leaveForm.Dept_Code = user.dept_code;
        this.leaveForm.Role = user.role;
        
        this.fetchLeaveTypes();
      }
    }
  }

  fetchLeaveTypes() {
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (data) => {
        // Filter unique names for the dropdown
        const unique = [...new Set(data.map(item => item.leave_name))];
        this.leaveTypes.set(unique);
        if (unique.length > 0) {
          this.leaveForm.Type_of_Leave = unique[0];
          this.fetchBalance();
        }
      }
    });
  }

  fetchBalance() {
    const empCode = this.leaveForm.Emp_CODE;
    const type = this.leaveForm.Type_of_Leave;
    if (!empCode || !type) return;

    this.http.get<any>(`http://localhost:5000/api/leaves/balance/${empCode}/${type}`)
      .subscribe({
        next: (res) => {
          this.remainingBalance.set(res.balance);
          this.activeSession.set(res.sessionName); 
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
      const days = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      this.leaveForm.Total_Days.set(days);
    }
  }

  onSubmit() {
    const days = this.leaveForm.Total_Days();

    if (!this.leaveForm.sr_no) {
      alert("⚠️ Serial Number is required.");
      return;
    }

    // UPDATED SL LOGIC: Compulsory ONLY if days > 3
    if (this.leaveForm.Type_of_Leave === 'SL' && days > 3 && !this.selectedFile()) {
      alert("⚠️ Medical document is compulsory for Sick Leave (SL) exceeding 3 days.");
      return;
    }

    if (days > this.remainingBalance()) {
      alert(`Insufficient Balance! Available: ${this.remainingBalance()} days.`);
      return;
    }

    const formData = new FormData();
    formData.append('sr_no', this.leaveForm.sr_no);
    formData.append('Emp_CODE', String(this.leaveForm.Emp_CODE));
    formData.append('Name', this.leaveForm.Name);
    formData.append('Dept_Code', String(this.leaveForm.Dept_Code));
    formData.append('Type_of_Leave', this.leaveForm.Type_of_Leave);
    formData.append('From', this.leaveForm.From);
    formData.append('To', this.leaveForm.To);
    formData.append('Total_Days', String(days));
    formData.append('Role', this.leaveForm.Role);

    if (this.selectedFile()) {
      formData.append('document', this.selectedFile()!);
    }

    this.http.post('http://localhost:5000/api/leaves/apply', formData).subscribe({
      next: () => {
        alert(`✅ Application Submitted successfully!`);
        this.resetForm();
      },
      error: (err) => alert(err.error?.error || "Submission failed.")
    });
  }

  resetForm() {
    this.leaveForm.sr_no = '';
    this.leaveForm.From = '';
    this.leaveForm.To = '';
    this.leaveForm.Total_Days.set(0);
    this.selectedFile.set(null);
    this.fetchBalance(); 
  }
}