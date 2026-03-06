import { Component } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-dashbored',
  standalone: true,
  // RouterLink enables the [routerLink] directive in HTML
  imports: [CommonModule, RouterLink, RouterLinkActive], 
  templateUrl: './admin-dashbored.html',
  styleUrl: './admin-dashbored.css'
})
export class AdminDashbored {
  constructor(private router: Router) {}

  logout() {
    // Clear the session data stored during login
    localStorage.removeItem('user');
    this.router.navigate(['/login']);
  }
}