import { Component, OnInit, signal, computed, Inject, PLATFORM_ID } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe, isPlatformBrowser } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';
import { forkJoin } from 'rxjs';

@Component({
  selector: 'app-admin-leave-type',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, UpperCasePipe],
  templateUrl: './admin-leave-type.html',
  styleUrl: './admin-leave-type.css',
})
export class AdminLeaveType implements OnInit {
  leaveTypes = signal<any[]>([]);
  editingId = signal<string | null>(null);
  
  // Dynamic Session State
  activeSession = signal<any>({ sessionName: '', startDate: '', endDate: '' });
  sessionsList = signal<any[]>([]); 

  availableDeptCodes = ['0', '1', '2', '3', '4', '5', '6', '7'];

  leaveLimit = {
    leave_name: '',
    total_yearly_limit: 0,
    dept_codes: [] as string[],
    can_carry_forward: false 
  };

  constructor(
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    this.fetchActiveSession();
    this.loadAllSavedSessions();
    this.fetchLeaveTypes();
  }

  // Load the current active session settings
  fetchActiveSession() {
    // 1. Check if we already have a session choice for this TAB
    let cachedSession = null;
    if (isPlatformBrowser(this.platformId)) {
      cachedSession = sessionStorage.getItem('activeSessionName');
    }
    
    this.http.get<any>(`http://localhost:5000/api/active-session?t=${Date.now()}`).subscribe(res => {
      if (res && res.sessionName !== "Not Set") {
        // If we have a cached choice, we fetch specifically THAT session details
        // Otherwise use the global active one
        const sessionToLoad = cachedSession || res.sessionName;
        
        if (sessionToLoad === res.sessionName) {
           this.activeSession.set(res);
           if (isPlatformBrowser(this.platformId)) {
             sessionStorage.setItem('activeSessionName', res.sessionName);
           }
        } else {
           // Fetch the specific session by name
           this.http.get<any[]>(`http://localhost:5000/api/sessions/all`).subscribe(list => {
             const match = list.find(s => s.sessionName === sessionToLoad);
             if (match) {
               this.activeSession.set(match);
             } else {
               this.activeSession.set(res);
               sessionStorage.setItem('activeSessionName', res.sessionName);
             }
           });
        }
      }
    });
  }

  // Load all sessions from the database for the dropdown
  loadAllSavedSessions() {
    this.http.get<any[]>(`http://localhost:5000/api/sessions/all?t=${Date.now()}`).subscribe(list => {
      this.sessionsList.set(list);
    });
  }

  // Set the UI to a specific saved session
  onSelectDropdownSession(s: any) {
    this.activeSession.set({
      sessionName: s.sessionName,
      startDate: s.startDate,
      endDate: s.endDate
    });
    if (isPlatformBrowser(this.platformId)) {
      sessionStorage.setItem('activeSessionName', s.sessionName);
    }
    this.fetchLeaveTypes(); // <--- Refresh data for new session
  }

  // Save or Update a Session and force it as the ACTIVE one
  saveSession() {
    if (!this.activeSession().sessionName) {
      alert("Please enter a Session Name");
      return;
    }
    this.http.post('http://localhost:5000/api/admin/set-session', this.activeSession()).subscribe({
      next: () => {
        alert(`✅ ${this.activeSession().sessionName} is now the Active Session!`);
        if (isPlatformBrowser(this.platformId)) {
          sessionStorage.setItem('activeSessionName', this.activeSession().sessionName);
        }
        this.loadAllSavedSessions(); 
        this.fetchLeaveTypes();    
      },
      error: () => alert("❌ Failed to save session.")
    });
  }

  fetchLeaveTypes() {
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (data) => this.leaveTypes.set(data),
      error: (err) => console.error("Error fetching types:", err)
    });
  }

  filteredLeaveTypes = computed(() => {
    const currentSession = this.activeSession().sessionName;
    return this.groupedLeaveTypes().filter(g => g.sessionName === currentSession);
  });

  toggleSelection(array: string[], item: string) {
    const index = array.indexOf(item);
    if (index > -1) array.splice(index, 1);
    else array.push(item);
  }

  saveYearlyLimit() {
    const name = this.leaveLimit.leave_name.toUpperCase();
    const isIncrementing = ['VAL', 'AL'].includes(name);
    const session = this.activeSession().sessionName;

    if (!session || session === 'Not Set') {
      alert("Please save/select an Academic Session first.");
      return;
    }

    const requests = [];
    const codesToSave = this.leaveLimit.dept_codes.includes('0') ? ['0'] : this.leaveLimit.dept_codes;

    for (const dept of codesToSave) {
      const payload = {
        leave_name: name,
        total_yearly_limit: this.leaveLimit.total_yearly_limit,
        dept_code: dept,
        staffType: 'All',
        can_carry_forward: this.leaveLimit.can_carry_forward,
        sessionName: session
      };
      requests.push(this.http.post('http://localhost:5000/api/leave-types/set', payload));
    }

    forkJoin(requests).subscribe({
      next: () => {
        alert(`Quotas for ${session} updated!`);
        this.fetchLeaveTypes();
        this.resetForm();
      }
    });
  }

  groupedLeaveTypes = computed(() => {
    const groups: any[] = [];
    this.leaveTypes().forEach((item: any) => {
      const existing = groups.find(g => 
        g.leave_name === item.leave_name && 
        g.total_yearly_limit === item.total_yearly_limit &&
        g.sessionName === item.sessionName &&
        g.can_carry_forward === item.can_carry_forward
      );
      if (existing) {
        if (!existing.all_depts.includes(item.dept_code)) existing.all_depts.push(item.dept_code);
      } else {
        groups.push({ ...item, all_depts: [item.dept_code] });
      }
    });
    return groups.map(g => ({
      ...g,
      dept_display: g.all_depts.includes(0) || g.all_depts.includes('0') 
        ? 'All Departments' 
        : g.all_depts.sort().join(', ')
    }));
  });

  editType(group: any) {
    this.editingId.set(group._id);
    this.leaveLimit = { 
      leave_name: group.leave_name,
      total_yearly_limit: group.total_yearly_limit,
      dept_codes: [...group.all_depts],
      can_carry_forward: group.can_carry_forward
    };
  }

  deleteType(id: string) {
    if (confirm("Delete this quota?")) {
      this.http.delete(`http://localhost:5000/api/leave-types/${id}`).subscribe(() => this.fetchLeaveTypes());
    }
  }

  resetForm() {
    this.editingId.set(null);
    this.leaveLimit = {
      leave_name: '', total_yearly_limit: 0,
      dept_codes: [], can_carry_forward: false
    };
  }
}