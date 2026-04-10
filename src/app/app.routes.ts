import { Routes } from '@angular/router';
import { Login } from './frontend/login/login';
import { AdminDashbored } from './frontend/login/admin/admin-dashbored/admin-dashbored';
import { StaffDashbored } from './frontend/staff/staff-dashbored/staff-dashbored';
import { AdminManagedStaff } from './frontend/login/admin/admin-managed-staff/admin-managed-staff';
import { AdminLeave } from './frontend/login/admin/admin-leave/admin-leave';
import { AdminLeaveType } from './frontend/login/admin/admin-leave-type/admin-leave-type';
import { ApplyLeave } from './frontend/staff/apply-leave/apply-leave';
import { HodLeaveApproved } from './frontend/staff/hod-leave-approved/hod-leave-approved';
import { StaffViewStatus } from './frontend/staff/staff-view-status/staff-view-status';
import { Report } from './frontend/login/admin/report/report';
import { AdminLeaveApplication } from './frontend/login/admin/admin-leave-application/admin-leave-application';
import { ProfileUpdate } from './profile-update/profile-update';
import { AdminPolicy } from './frontend/login/admin/admin-policy/admin-policy';
import { StaffPolicy } from './frontend/staff/staff-policy/staff-policy';

export const routes: Routes = [
  // 1. Default Route
  { path: '', redirectTo: 'login', pathMatch: 'full' },

  // 2. Auth Route
  { path: 'login', component: Login },

  // 3. Admin Routes
  { path: 'admin-dashboard', component: AdminDashbored },
  { path: 'admin-managed-staff', component: AdminManagedStaff },
  { path: 'admin-leave', component: AdminLeave },
  { path: 'admin-leave-type', component: AdminLeaveType },
  { path: 'admin-report', component: Report },
  { path: 'admin-leave-application', component: AdminLeaveApplication },
  { path: 'admin-policy', component: AdminPolicy },

  // 4. Staff/HOD Dashboard
  { path: 'staff-dashboard', component: StaffDashbored },
  { path: 'apply-leave', component: ApplyLeave },
  { path: 'hod-leave-approved', component: HodLeaveApproved },
  { path: 'staff-view-status', component: StaffViewStatus },
  { path: 'staff-policy', component: StaffPolicy },

  // 5. Shared Profile Update
  { path: 'profile-update', component: ProfileUpdate },

  // 6. Wildcard Redirect
  { path: '**', redirectTo: 'login' }
];
