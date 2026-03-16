import { Component, OnInit, Inject, PLATFORM_ID, signal, computed } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../frontend/login/admin/admin-sidebar/admin-sidebar';
import { StaffSidebar } from '../frontend/staff/staff-sidebar/staff-sidebar';

@Component({
  selector: 'app-profile-update',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar, StaffSidebar],
  templateUrl: './profile-update.html',
  styleUrl: './profile-update.css'
})
export class ProfileUpdate implements OnInit {
  // Signals for state management
  user = signal<any>(null);
  loading = signal(false);
  successMessage = signal('');
  errorMessage = signal('');
  
  // Data signals
  email = signal('');
  password = signal('');

  // Computed signal to handle view logic automatically
  isAdmin = computed(() => {
    const currentUser = this.user();
    if (!currentUser) return false;
    const roles = Array.isArray(currentUser.role) ? currentUser.role : [currentUser.role];
    return roles.some((r: string) => r?.toLowerCase() === 'admin');
  });

  constructor(
    private router: Router,
    private http: HttpClient,
    @Inject(PLATFORM_ID) private platformId: Object
  ) { }

  ngOnInit() {
    if (isPlatformBrowser(this.platformId)) {
      const savedUser = sessionStorage.getItem('user');
      if (savedUser) {
        this.user.set(JSON.parse(savedUser));
        this.fetchProfile();
      } else {
        this.router.navigate(['/login']);
      }
    }
  }

  fetchProfile() {
    const empCode = this.user()?.empCode;
    if (!empCode) return;

    this.loading.set(true);
    this.http.get<any>(`http://localhost:5000/api/profile/${empCode}`).subscribe({
      next: (res) => {
        this.email.set(res.Email || '');
        this.password.set(res.Password || '');
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load profile data.');
        this.loading.set(false);
      }
    });
  }

  updateProfile() {
    if (!this.email() || !this.password()) {
      this.errorMessage.set('Email and Password are required.');
      return;
    }

    this.loading.set(true);
    this.successMessage.set('');
    this.errorMessage.set('');

    const body = {
      Email: this.email(),
      Password: this.password()
    };

    this.http.put<any>(`http://localhost:5000/api/profile/${this.user().empCode}`, body).subscribe({
      next: (res) => {
        if (res.success) {
          this.successMessage.set('Profile updated successfully!');
          
          // Sync local storage if email changed
          const updatedUser = { ...this.user(), email: this.email() };
          sessionStorage.setItem('user', JSON.stringify(updatedUser));
          this.user.set(updatedUser);
        } else {
          this.errorMessage.set(res.error || 'Failed to update profile.');
        }
        this.loading.set(false);
      },
      error: () => {
        this.errorMessage.set('An error occurred while updating profile.');
        this.loading.set(false);
      }
    });
  }
}