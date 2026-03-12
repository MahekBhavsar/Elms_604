import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { DisplayDatePipe } from '../../../../shared/pipes/display-date.pipe';

@Component({
  selector: 'app-report',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, DisplayDatePipe],
  templateUrl: './report.html',
  styleUrl: './report.css'
})
export class Report implements OnInit {
  // Master Data Signals
  allStaff = signal<any[]>([]);
  allLeaves = signal<any[]>([]);
  allLeaveTypes = signal<any[]>([]);

  // Navigation and Filter State
  activeTab = signal<'staff' | 'logs' | 'configs'>('staff');
  deptSearch = signal<string>(''); // Dynamic 1-7 Filter
  searchTerm = signal<string>('');
  
  // NEW: Date Range Signals
  fromDate = signal<string>('');
  toDate = signal<string>('');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>('http://localhost:5000/api/staff').subscribe(res => this.allStaff.set(res));
    this.http.get<any[]>('http://localhost:5000/api/leaves/admin').subscribe(res => this.allLeaves.set(res));
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe(res => this.allLeaveTypes.set(res));
  }

  /** DYNAMIC DEPT NAME LOOKUP (Zero Hardcoding) */
  getDeptName = computed(() => (code: any) => {
    if (!code) return 'GLOBAL';
    const staffMember = this.allStaff().find(s => 
      (s.dept_code || s.Dept_Code || '').toString() === code.toString()
    );
    return staffMember ? staffMember.department : 'Other';
  });

  /** 1. Staff Directory Report */
  filteredStaff = computed(() => {
    return this.allStaff().filter(s => {
      const rowDept = (s.dept_code || s.Dept_Code || '').toString();
      const matchDept = !this.deptSearch() || rowDept === this.deptSearch();
      const matchName = !this.searchTerm() || s.Name.toLowerCase().includes(this.searchTerm().toLowerCase());
      return matchDept && matchName;
    });
  });

  /** 2. Leave Application Logs (ADDED DATE LOGIC HERE) */
  filteredLogs = computed(() => {
    return this.allLeaves().filter(l => {
      const rowDept = (l.Dept_Code || l.dept_code || '').toString();
      const matchDept = !this.deptSearch() || rowDept === this.deptSearch();
      const matchName = !this.searchTerm() || l.Name.toLowerCase().includes(this.searchTerm().toLowerCase());
      
      // Date Filtering Logic
      const leaveDate = new Date(l.From).getTime();
      const startLimit = this.fromDate() ? new Date(this.fromDate()).getTime() : null;
      const endLimit = this.toDate() ? new Date(this.toDate()).getTime() : null;

      const matchFrom = !startLimit || leaveDate >= startLimit;
      const matchTo = !endLimit || leaveDate <= endLimit;

      return matchDept && matchName && matchFrom && matchTo;
    });
  });

  /** 3. Leave Configuration Report */
  filteredConfigs = computed(() => {
    return this.allLeaveTypes().filter(c => {
      const rowDept = (c.dept_code || '').toString();
      const matchDept = !this.deptSearch() || rowDept === this.deptSearch();
      const matchName = !this.searchTerm() || c.leave_name.toLowerCase().includes(this.searchTerm().toLowerCase());
      return matchDept && matchName;
    });
  });

  resetFilters() {
    this.deptSearch.set('');
    this.searchTerm.set('');
    this.fromDate.set(''); // Reset Date
    this.toDate.set('');   // Reset Date
  }
}