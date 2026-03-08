import { Component, OnInit, signal, computed } from '@angular/core'; // FIXED: Corrected import from @angular/core
import { HttpClient } from '@angular/common/http';
import { CommonModule, UpperCasePipe } from '@angular/common';
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
  // Signals for state management
  leaveTypes = signal<any[]>([]);
  editingId = signal<string | null>(null);

  // Configuration options for pills
  availableDeptCodes = ['1', '2', '3', '4', '5', '6', '7'];
  availableStaffTypes = ['Teaching', 'Peon', 'Other'];

  // Form Model matching the HTML template
  leaveLimit = {
    leave_name: '',
    total_yearly_limit: 0, // Used for the "Days" input
    dept_codes: [] as string[],
    staffTypes: [] as string[]
  };

  // Grouped data for the table display to avoid repeated "CL" rows
  groupedLeaveTypes = computed(() => {
    const flatData = this.leaveTypes();
    const groups: any[] = [];

    // FIXED: Added type safety to 'item' to resolve TS7006
    flatData.forEach((item: any) => {
      const existing = groups.find(g => 
        g.leave_name === item.leave_name && 
        g.total_yearly_limit === item.total_yearly_limit
      );

      if (existing) {
        if (!existing.all_depts.includes(item.dept_code)) existing.all_depts.push(item.dept_code);
        if (!existing.all_categories.includes(item.staffType)) existing.all_categories.push(item.staffType);
      } else {
        groups.push({
          ...item,
          all_depts: [item.dept_code],
          all_categories: [item.staffType]
        });
      }
    });

    // Map the groups to join the arrays into comma-separated strings for display
    return groups.map(g => ({
      ...g,
      dept_display: g.all_depts.sort().join(', '),
      category_display: g.all_categories.sort().join(', ')
    })).sort((a, b) => a.leave_name.localeCompare(b.leave_name));
  });

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchLeaveTypes();
  }

  fetchLeaveTypes() {
    this.http.get<any[]>('http://localhost:5000/api/leave-types').subscribe({
      next: (data) => this.leaveTypes.set(data),
      error: (err) => console.error("Error fetching types:", err)
    });
  }

  toggleSelection(array: string[], item: string) {
    const index = array.indexOf(item);
    if (index > -1) array.splice(index, 1);
    else array.push(item);
  }

  // FIXED: Renamed saveLeaveConfig to saveYearlyLimit to match HTML
  saveYearlyLimit() {
    if (!this.leaveLimit.leave_name || this.leaveLimit.total_yearly_limit <= 0) {
      alert("Please fill all fields.");
      return;
    }

    const requests = [];
    for (const dept of this.leaveLimit.dept_codes) {
      for (const type of this.leaveLimit.staffTypes) {
        const payload = {
          leave_name: this.leaveLimit.leave_name.toUpperCase(),
          total_yearly_limit: this.leaveLimit.total_yearly_limit,
          dept_code: dept,
          staffType: type
        };
        requests.push(this.http.post('http://localhost:5000/api/leave-types/set', payload));
      }
    }

    forkJoin(requests).subscribe({
      next: () => {
        alert("Quota updated successfully!");
        this.fetchLeaveTypes();
        this.resetForm();
      },
      error: (err) => console.error("Server error:", err)
    });
  }

  editType(group: any) {
    this.editingId.set(group._id);
    this.leaveLimit = { 
      leave_name: group.leave_name,
      total_yearly_limit: group.total_yearly_limit,
      dept_codes: [...group.all_depts],
      staffTypes: [...group.all_categories]
    };
  }

  deleteType(id: string) {
    if (confirm("Delete this leave configuration?")) {
      this.http.delete(`http://localhost:5000/api/leave-types/${id}`).subscribe(() => this.fetchLeaveTypes());
    }
  }

  resetForm() {
    this.editingId.set(null);
    this.leaveLimit = {
      leave_name: '',
      total_yearly_limit: 0,
      dept_codes: [],
      staffTypes: []
    };
  }
}