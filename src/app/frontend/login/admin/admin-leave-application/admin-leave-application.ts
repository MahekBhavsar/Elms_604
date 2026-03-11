import { Component, Inject, OnInit, PLATFORM_ID, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';

@Component({
  selector: 'app-admin-leave-application',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar],
  templateUrl: './admin-leave-application.html',
  styleUrl: './admin-leave-application.css',
})
export class AdminLeaveApplication implements OnInit {
  staffData = signal<any>({});
  remainingBalance = signal<number>(0);
  selectedFile = signal<File | null>(null);
  
  // Signal to store leave types fetched from the database
  leaveTypes = signal<any[]>([]);
  
  leaveForm = {
    sr_no: '', // Added Sr No
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
        this.leaveForm.Dept_Code = user.dept_code || 1;
        this.leaveForm.Role = user.role;
        
        this.fetchBalance();
        this.fetchLeaveTypes(); // Fetch dynamic names
      }
    }
  }

  fetchLeaveTypes() {
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (data) => {
        // Get unique leave names from the collection
        const uniqueNames = [...new Set(data.map(item => item.leave_name))];
        this.leaveTypes.set(uniqueNames);
        // Set a default value if types exist
        if (uniqueNames.length > 0) this.leaveForm.Type_of_Leave = uniqueNames[0];
      },
      error: (err) => console.error("Error fetching leave types", err)
    });
  }

  fetchBalance() {
    // Logic to fetch balance based on Emp_Code and Type_of_Leave
    if (!this.leaveForm.Emp_CODE || !this.leaveForm.Type_of_Leave) return;

    this.http.get<any>(`http://localhost:5000/api/leaves/balance/${this.leaveForm.Emp_CODE}/${this.leaveForm.Type_of_Leave}`)
      .subscribe(res => {
        this.remainingBalance.set(res.balance || 0);
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
    const totalDays = this.leaveForm.Total_Days();

    // 1. Validation: Sr No
    if (!this.leaveForm.sr_no) {
      alert("⚠️ Please enter a Serial Number (Sr. No.)");
      return;
    }

    // 2. Validation: SL Document (Compulsory ONLY if > 3 days)
    if (this.leaveForm.Type_of_Leave === 'SL' && totalDays > 3 && !this.selectedFile()) {
      alert("⚠️ Medical document is compulsory for Sick Leave (SL) exceeding 3 days.");
      return;
    }

    // 3. Validation: Balance
    if (totalDays > this.remainingBalance()) {
      alert(`Insufficient Balance! You only have ${this.remainingBalance()} days left.`);
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
    formData.append('Total_Days', String(totalDays));
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
    this.leaveForm.sr_no = '';
    this.leaveForm.From = '';
    this.leaveForm.To = '';
    this.leaveForm.Total_Days.set(0);
    this.selectedFile.set(null);
    this.fetchBalance(); 
  }
}