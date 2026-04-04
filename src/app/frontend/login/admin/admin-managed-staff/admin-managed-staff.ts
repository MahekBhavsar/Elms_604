import { Component, OnInit, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';

@Component({
  selector: 'app-admin-managed-staff',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar],
  templateUrl: './admin-managed-staff.html',
  styleUrl: './admin-managed-staff.css'
})
export class AdminManagedStaff implements OnInit {
  private rawStaff = signal<any[]>([]);
  searchTerm = signal<string>('');
  sortOrder = signal<'asc' | 'desc' | 'none'>('none');

  // Unified Search and Dept Code Sorting
  filteredStaff = computed(() => {
    let list = this.rawStaff().filter(s => 
      s.Name.toLowerCase().includes(this.searchTerm().toLowerCase()) ||
      s.Email.toLowerCase().includes(this.searchTerm().toLowerCase()) ||
      s.department?.toLowerCase().includes(this.searchTerm().toLowerCase()) ||
      s.dept_code?.toString().includes(this.searchTerm())
    );

    if (this.sortOrder() !== 'none') {
      list.sort((a, b) => {
        const codeA = Number(a.dept_code) || 99; // Non-coded staff go to bottom
        const codeB = Number(b.dept_code) || 99;
        return this.sortOrder() === 'asc' ? codeA - codeB : codeB - codeA;
      });
    }
    return list;
  });

  totalStaff = computed(() => this.rawStaff().length);

  staffForm: any = {
    "Name": '', "Email": '', "Employee Code": null, "Password": 1234,
    "role": 'Staff', "staffType": 'none',
    "department": '', "dept_code": 1, "managed_depts": ''
  };
  
  isEditMode = false;
  currentEditId = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.getAllStaff();
  }

  isRoleSelected(roleName: string): boolean {
    const roles = (this.staffForm.role || '').split(',').map((r: string) => r.trim());
    return roles.includes(roleName);
  }

  toggleRole(roleName: string) {
    let roles = (this.staffForm.role || '').split(',').map((r: string) => r.trim()).filter((r: string) => r);
    if (roles.includes(roleName)) {
      roles = roles.filter((r: string) => r !== roleName);
    } else {
      roles.push(roleName);
    }
    this.staffForm.role = roles.join(', ');
  }

  // Map staff types to your specific department code table
  onStaffTypeChange() {
    const type = this.staffForm.staffType;
    if (type === 'Peon') {
      this.staffForm.department = 'PEONS';
      this.staffForm.dept_code = 7; // Matches your image mapping
    } else if (type === 'Teaching') {
      this.staffForm.department = 'Computer'; // Defaulting to first dept
      this.staffForm.dept_code = 1;
    } else {
      this.staffForm.department = 'OTHERS';
      this.staffForm.dept_code = 5;
    }
  }

  toggleSort() {
    if (this.sortOrder() === 'none') this.sortOrder.set('asc');
    else if (this.sortOrder() === 'asc') this.sortOrder.set('desc');
    else this.sortOrder.set('none');
  }

  getAllStaff() {
    this.http.get<any[]>('/api/staff').subscribe({
      next: (res) => this.rawStaff.set(res),
      error: (err) => console.error("Error loading staff:", err)
    });
  }

  onSubmit() {
    const url = this.isEditMode ? `/api/staff/${this.currentEditId}` : '/api/staff';
    const request = this.isEditMode ? this.http.put(url, this.staffForm) : this.http.post(url, this.staffForm);

    request.subscribe({
      next: () => {
        alert(`✅ Staff Member ${this.isEditMode ? 'Updated' : 'Registered'}!`);
        this.resetForm();
        this.getAllStaff();
      },
      error: () => alert("❌ Operation Failed.")
    });
  }

  onEdit(staff: any) {
    this.isEditMode = true;
    this.currentEditId = staff._id;
    this.staffForm = { ...staff };
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  onDelete(id: string) {
    if (confirm("⚠️ Delete this record?")) {
      this.http.delete(`/api/staff/${id}`).subscribe({
        next: () => {
          alert("🗑️ Staff Member Deleted!");
          this.getAllStaff();
        }
      });
    }
  }

  resetForm() {
    this.isEditMode = false;
    this.currentEditId = '';
    this.staffForm = {
      "Name": '', "Email": '', "Employee Code": null, "Password": 1234,
      "role": 'Staff', "staffType": 'none',
      "department": '', "dept_code": 1, "managed_depts": ''
    };
  }
}
