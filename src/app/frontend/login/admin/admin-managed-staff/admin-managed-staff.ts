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
  // Object matches your MongoDB keys exactly
  staffForm: any = {
    "Name": '',
    "Email": '',
    "Password": null,
    "role": 'Staff',
    "staffType": 'none',
    "department": ''
  };
  isEditMode = false;
  currentEditId = '';

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.getAllStaff();
  }

  // Fixes the 404 error by calling the correct GET route
  getAllStaff() {
    this.http.get<any[]>('http://localhost:5000/api/staff').subscribe({
      next: (res) => this.staffList = res,
      error: (err) => console.error("Error loading staff table:", err)
    });
  }

  onSubmit() {
    if (this.isEditMode) {
      // Update logic
      this.http.put(`http://localhost:5000/api/staff/${this.currentEditId}`, this.staffForm).subscribe(() => {
        this.resetForm();
        this.getAllStaff();
      });
    } else {
      // Add logic
      this.http.post('http://localhost:5000/api/staff', this.staffForm).subscribe(() => {
        this.resetForm();
        this.getAllStaff();
      });
    }
  }

  onEdit(staff: any) {
    this.isEditMode = true;
    this.currentEditId = staff._id;
    // Spread operator to avoid modifying the table row while typing
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
    this.staffForm = { "Name": '', "Email": '', "Password": null, "role": 'Staff', "staffType": 'none', "department": '' };
  }
}