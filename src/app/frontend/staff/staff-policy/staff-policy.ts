import { Component, OnInit, ChangeDetectorRef, Inject, PLATFORM_ID } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { StaffSidebar } from '../staff-sidebar/staff-sidebar';

@Component({
  selector: 'app-staff-policy',
  standalone: true,
  imports: [CommonModule, StaffSidebar],
  templateUrl: './staff-policy.html',
  styleUrl: './staff-policy.css'
})
export class StaffPolicy implements OnInit {
  policies: any[] = [];
  loading = true;
  selectedPolicy: any = null;
  showModal = false;

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {}

  ngOnInit() {
    this.fetchPolicies();
  }

  fetchPolicies() {
    this.loading = true;
    // Staff role ensures only 'Published' policies are returned by the updated API
    this.http.get<any[]>('/api/policies?role=Staff').subscribe({
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

  viewDetail(policy: any) {
    this.selectedPolicy = policy;
    this.showModal = true;
  }

  closeModal() {
    this.showModal = false;
    this.selectedPolicy = null;
  }
}
