import { Component, OnInit, signal, PLATFORM_ID, Inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';
import { forkJoin } from 'rxjs';
@Component({
  selector: 'app-apply-leave',
  standalone: true,
  imports: [CommonModule, FormsModule, StaffSidebar],
  templateUrl: './apply-leave.html',
  styleUrl: './apply-leave.css'
})
export class ApplyLeave implements OnInit {
  staffData = signal<any>({});
  displayValue = signal<number>(0); // Holds either Balance or Total Taken
  isIncrementing = signal<boolean>(false); // True for VAL/AL
  activeSession = signal<string>(''); 
  selectedFile = signal<File | null>(null);
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
    Role: '',
    VAL_working_dates: ''
  };

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
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
  forkJoin({
    session: this.http.get<any>('http://localhost:5000/api/active-session'),
    rules: this.http.get<any[]>('http://localhost:5000/api/leave-types')
  }).subscribe({
    next: (res) => {
      const currentSessionLabel = res.session.sessionName;
      if (isPlatformBrowser(this.platformId)) {
        sessionStorage.setItem('activeSessionName', currentSessionLabel);
      }
          const userDept = (this.staffData().dept_code !== undefined && this.staffData().dept_code !== null) ? String(this.staffData().dept_code) : 
                       (this.staffData().Dept_Code !== undefined && this.staffData().Dept_Code !== null ? String(this.staffData().Dept_Code) : '');
      const userStaffType = this.staffData().staffType || 'Teaching';

      // PERFECT FILTER: 
      // 1. Must match Session
      // 2. Match user's specific Dept OR match "0" (Universal/Others)
      // 3. Match staffType OR "All"
      const applicableRules = res.rules.filter(r =>
        r.sessionName === currentSessionLabel &&
        (String(r.dept_code) === userDept || String(r.dept_code) === '0' || !r.dept_code) &&
        (r.staffType === userStaffType || r.staffType === 'All' || !r.staffType)
      );

      // Sort alphabetically and remove duplicates
      const uniqueNames = [...new Set(applicableRules.map(item => item.leave_name))].sort();
      
      this.leaveTypes.set(uniqueNames);
      this.activeSession.set(currentSessionLabel);

      if (uniqueNames.length > 0) {
        // Only reset if current selection isn't in the new list
        if (!uniqueNames.includes(this.leaveForm.Type_of_Leave)) {
          this.leaveForm.Type_of_Leave = uniqueNames[0];
        }
        this.fetchBalance();
      }
    },
    error: (err) => console.error("Error loading leave setup:", err)
  });
}

  fetchBalance() {
    const empCode = this.leaveForm.Emp_CODE;
    const type = this.leaveForm.Type_of_Leave;
    if (!empCode || !type) return;

    this.http.get<any>(`http://localhost:5000/api/leaves/balance/${empCode}/${type}`)
      .subscribe({
        next: (res) => {
          // res.balance will be 'Total Used' for VAL/AL and 'Remaining' for others
          this.displayValue.set(res.balance);
          this.isIncrementing.set(res.isIncrementing); 
          this.activeSession.set(res.sessionName || 'Active'); 
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
      
      let days = 0;
      const currentDate = new Date(start);
      currentDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end);
      endDate.setHours(0, 0, 0, 0);

      while (currentDate <= endDate) {
        // 0 corresponds to Sunday in JavaScript
        if (currentDate.getDay() !== 0) {
          days++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      this.leaveForm.Total_Days.set(days);
    }
  }

  onSubmit() {
    const days = this.leaveForm.Total_Days();

    if (!this.leaveForm.sr_no) {
      alert("⚠️ Serial Number is required.");
      return;
    }

    // VAL working dates check
    if (this.leaveForm.Type_of_Leave === 'VAL' && !this.leaveForm.VAL_working_dates.trim()) {
      alert("⚠️ Please mention the 3 working dates during vacation for VAL leave.");
      return;
    }

    // Medical proof check for SL > 3 days
    if (this.leaveForm.Type_of_Leave === 'SL' && days > 3 && !this.selectedFile()) {
      alert("⚠️ Medical document is compulsory for Sick Leave (SL) exceeding 3 days.");
      return;
    }

    // Only block submission if it's NOT an incrementing type (like CL/SL)
    if (!this.isIncrementing() && days > this.displayValue()) {
      alert(`Insufficient Balance! Available: ${this.displayValue()} days.`);
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
    if (this.leaveForm.Type_of_Leave === 'VAL') {
      formData.append('VAL_working_dates', this.leaveForm.VAL_working_dates);
    }

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
    this.leaveForm.VAL_working_dates = '';
    this.selectedFile.set(null);
    this.fetchBalance(); 
  }
}