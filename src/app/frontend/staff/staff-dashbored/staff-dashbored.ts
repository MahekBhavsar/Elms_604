import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-staff-dashbored',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './staff-dashbored.html',
  styleUrl: './staff-dashbored.css',
})
export class StaffDashbored implements OnInit {
  user: any = null;

  ngOnInit() {
    // Retrieve the dynamic user data (Email String, Password Int32, staffType, etc.)
    const savedUser = localStorage.getItem('user');
    if (savedUser) {
      this.user = JSON.parse(savedUser);
    }
  }

  logout() {
    localStorage.removeItem('user');
    window.location.href = '/login';
  }
}