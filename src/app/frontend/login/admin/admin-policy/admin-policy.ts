import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AdminSidebar } from '../admin-sidebar/admin-sidebar';

@Component({
  selector: 'app-admin-policy',
  standalone: true,
  imports: [CommonModule, FormsModule, AdminSidebar],
  templateUrl: './admin-policy.html',
  styleUrl: './admin-policy.css'
})
export class AdminPolicy implements OnInit {
  policies: any[] = [];
  loading = true;
  showModal = false;
  isEditing = false;
  
  // Form Model
  currentPolicy: any = {
    title: '',
    description: '',
    content: '',
    category: 'General',
    status: 'Draft'
  };

  categories = ['General', 'Leave', 'Salary', 'Conduct', 'Health', 'Safety'];

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  getStatusCount(status: string): number {
    return this.policies.filter(p => p.status === status).length;
  }

  ngOnInit() {
    this.fetchPolicies();
  }

  fetchPolicies() {
    this.loading = true;
    this.http.get<any[]>('/api/policies?role=Admin').subscribe({
      next: (res) => {
        this.policies = res;
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error("Fetch policies failed", err);
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  openAddModal() {
    this.isEditing = false;
    this.currentPolicy = {
      title: '',
      description: '',
      content: '',
      category: 'General',
      status: 'Draft'
    };
    this.showModal = true;
  }

  editPolicy(policy: any) {
    this.isEditing = true;
    this.currentPolicy = { ...policy };
    this.showModal = true;
  }

  savePolicy() {
    if (!this.currentPolicy.title || !this.currentPolicy.content) {
      alert("Please fill in the title and content.");
      return;
    }

    if (this.isEditing) {
      this.http.put(`/api/policies/${this.currentPolicy._id}`, this.currentPolicy).subscribe({
        next: () => {
          this.closeModal();
          this.fetchPolicies();
        },
        error: (err) => alert("Update failed")
      });
    } else {
      this.http.post('/api/policies', this.currentPolicy).subscribe({
        next: () => {
          this.closeModal();
          this.fetchPolicies();
        },
        error: (err) => alert("Creation failed")
      });
    }
  }

  deletePolicy(id: string) {
    if (confirm("Are you sure you want to delete this policy?")) {
      this.http.delete(`/api/policies/${id}`).subscribe({
        next: () => this.fetchPolicies(),
        error: (err) => alert("Delete failed")
      });
    }
  }

  toggleStatus(policy: any) {
    const newStatus = policy.status === 'Draft' ? 'Published' : 'Draft';
    this.http.put(`/api/policies/${policy._id}`, { ...policy, status: newStatus }).subscribe({
      next: () => this.fetchPolicies(),
      error: (err) => alert("Status update failed")
    });
  }

  closeModal() {
    this.showModal = false;
  }
}
