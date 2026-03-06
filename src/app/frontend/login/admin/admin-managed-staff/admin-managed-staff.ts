import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-managed-staff',
  standalone: true,
  imports: [RouterLink, CommonModule, FormsModule],
  templateUrl: './admin-managed-staff.html',
  styleUrl: './admin-managed-staff.css'
})
export class AdminManagedStaff implements OnInit {
  staffList: any[] = [];
  staffForm: any = {
    "Name": '',
    "Email": '',
    "Password": null,
    "role": 'Staff',
    "staffType": 'none',
    "department": '',
    "dept_code": 1
  };
  isEditMode = false;
  currentEditId = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.getAllStaff();
  }

  getAllStaff() {
    this.http.get<any[]>('http://localhost:5000/api/staff').subscribe({
      next: (res) => this.staffList = res,
      error: (err) => console.error("Error loading staff:", err)
    });
  }

  onSubmit() {
    if (this.isEditMode) {
      this.http.put(`http://localhost:5000/api/staff/${this.currentEditId}`, this.staffForm).subscribe({
        next: () => {
          alert("Staff Updated Successfully!");
          this.resetForm();
          this.getAllStaff();
        },
        error: (err) => alert("Update Failed: Check Console")
      });
    } else {
      this.http.post('http://localhost:5000/api/staff', this.staffForm).subscribe({
        next: () => {
          alert("Staff Added Successfully!");
          this.resetForm();
          this.getAllStaff();
        },
        error: (err) => alert("Add Failed: Check Console")
      });
    }
  }

  onEdit(staff: any) {
    this.isEditMode = true;
    this.currentEditId = staff._id;
    // We use spread to decouple the form from the table row
    this.staffForm = { ...staff };
  }

  onDelete(id: string) {
    if (confirm("Are you sure you want to delete this staff record?")) {
      this.http.delete(`http://localhost:5000/api/staff/${id}`).subscribe(() => {
        this.getAllStaff();
      });
    }
  }

  resetForm() {
    this.isEditMode = false;
    this.currentEditId = '';
    this.staffForm = { 
      "Name": '', "Email": '', "Password": null, 
      "role": 'Staff', "staffType": 'none', 
      "department": '', "dept_code": 1 
    };
  }
}