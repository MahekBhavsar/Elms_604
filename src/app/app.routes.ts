import { Routes } from '@angular/router';
import { Login } from './frontend/login/login';
import { AdminDashbored } from './frontend/login/admin/admin-dashbored/admin-dashbored';
import { StaffDashbored } from './frontend/staff/staff-dashbored/staff-dashbored';
import { AdminManagedStaff } from './frontend/login/admin/admin-managed-staff/admin-managed-staff';
import { AdminLeave } from './frontend/login/admin/admin-leave/admin-leave';

export const routes: Routes = [
  // 1. Default Route: Redirects to login page on application start
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  
  // 2. Login Route: The main entry point for all users
  { path: 'login', component: Login },
  
  // 3. Admin Route: Accessed by users with "Admin" role (e.g., Dr. Snehal)
  { path: 'admin-dashboard', component: AdminDashbored },
  {path:'admin-managed-staff',component:AdminManagedStaff},
{path:'admin-leave',component:AdminLeave},
  // 4. Staff Route: Accessed by HODs and regular staff (e.g., Dr. Rachna)
  { path: 'staff-dashboard', component: StaffDashbored },
  
  // 5. Wildcard Route: Redirects any unknown URL back to the login page
  { path: '**', redirectTo: 'login' }
];