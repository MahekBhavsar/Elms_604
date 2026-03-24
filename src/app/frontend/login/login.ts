import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; // Required for ngModel
import { CommonModule } from '@angular/common'; // Required for @if

@Component({
  selector: 'app-login',
  standalone: true, // Ensure this is a standalone component
  imports: [FormsModule, CommonModule], // Import these modules here
  templateUrl: './login.html'
})
export class Login {
  loginForm = { email: '', password: '' };
  errorMsg = '';

  constructor(private http: HttpClient, private router: Router) {}

  onLogin() {
    this.http.post('/api/login', this.loginForm).subscribe({
      next: (res: any) => {
        sessionStorage.setItem('user', JSON.stringify(res));

        // Use exact role names from your MongoDB image (e.g., "Admin")
        if (res.role === 'Admin') {
          this.router.navigate(['/admin-dashboard']);
        } else {
          this.router.navigate(['/staff-dashboard']);
        }
      },
      error: () => this.errorMsg = "Login Failed. Check your email/password."
    });
  }
}
