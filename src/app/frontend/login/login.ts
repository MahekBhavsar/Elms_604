import { Component } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './login.html'
})
export class Login {
  loginForm = { email: '', password: '' };
  rememberMe = false;
  errorMsg = '';

  constructor(private http: HttpClient, private router: Router) {}

  ngOnInit() {
    const saved = localStorage.getItem('remembered_user');
    if (saved) {
      const { email, password } = JSON.parse(saved);
      this.loginForm.email = email;
      this.loginForm.password = password;
      this.rememberMe = true;
    }
  }

  onLogin() {
    this.http.post('/api/login', this.loginForm).subscribe({
      next: (res: any) => {
        sessionStorage.setItem('user', JSON.stringify(res));

        if (this.rememberMe) {
          localStorage.setItem('remembered_user', JSON.stringify(this.loginForm));
        } else {
          localStorage.removeItem('remembered_user');
        }

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
