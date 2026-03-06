import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-admin-leave-type',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-leave-type.html',
  styleUrl: './admin-leave-type.css',
})
export class AdminLeaveType {
  // Object to bind to the form for setting yearly limits
  leaveLimit = { 
    leave_name: '', // e.g., 'CL', 'SL', 'SAT'
    limit: 0 
  };

  constructor(private http: HttpClient) {}

  // Sends the yearly limit to the leave_types collection in MongoDB
  saveYearlyLimit() {
    if (this.leaveLimit.leave_name && this.leaveLimit.limit > 0) {
      this.http.post('http://localhost:5000/api/leave-types/set', this.leaveLimit).subscribe({
        next: () => {
          alert(`Yearly limit for ${this.leaveLimit.leave_name} successfully set to ${this.leaveLimit.limit} days.`);
          this.resetForm();
        },
        error: (err) => {
          console.error("Error setting limit:", err);
          alert("Failed to update leave limit. Check if server is running on port 5000.");
        }
      });
    } else {
      alert("Please enter a valid Leave Type and a limit greater than 0.");
    }
  }

  resetForm() {
    this.leaveLimit = { leave_name: '', limit: 0 };
  }
}