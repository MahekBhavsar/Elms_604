# Project Data Directory: ELMS v2.0
## Employee Leave Management System — Full-Stack Desktop & Web Application
**Prepared by**: Mahek Bhavsar  •  March 2026

---

### 1. Project Overview
ELMS (Employee Leave Management System) is a comprehensive, offline-capable platform designed to automate the process of leave application, approval, and management within an educational institution. It features an offline-first architecture for resilience and server-side synchronization for real-time updates.

### 2. Technical Stack
- **Frontend Framework**: Angular ^21.0.3 (Universal/SSR)
- **Runtime Environment**: Electron (for Desktop distribution)
- **State Management & Persistence**:
  - **Local Persistence**: IndexedDB / LocalStorage (for offline data)
  - **Global Sync Engine**: MongoDB (Remote) + Custom Offline-Sync Service
- **Backend Infrastructure**: Node.js + Express.js ^8.x
- **UI Frameworks**:
  - Bootstrap 5.3.8 (Structure)
  - Bootstrap Icons (Visuals)
  - Custom CSS Design System (Aesthetics)
- **Utilities**:
  - JS-PDF / HTML2Canvas (Report Generation)
  - Vitest (Component Testing)
  - Electron-Packager/Builder (Desktop Deployment)

### 3. Folder Architecture Map
```text
elms/
├── .angular/            # Angular build cache
├── .vscode/             # VS Code workspace settings
├── dist/                # Production build artifacts
├── electron/            # Electron-specific main/preload scripts
├── public/              # Global assets: logos, favicons, manifests
├── src/                 # Main source directory
│   ├── app/             # Application logic & components
│   │   ├── frontend/    # Portal-specific modules
│   │   │   ├── login/   # Auth module + Admin sub-module
│   │   │   │   └── admin/  # Admin-only components & dashboard
│   │   │   └── staff/   # Staff and HOD portal components
│   │   ├── shared/      # Reusable UI/logic elements
│   │   └── profile-update/ # Shared user profile management
│   ├── assets/          # Component-specific styles & images
│   ├── index.html       # Landing HTML page
│   ├── main.ts          # Angular entry point
│   ├── styles.css       # Global design token definitions
│   └── server.ts        # Angular SSR engine
├── uploads/             # Server-side file storage (docs/medical certs)
├── ecosystem.config.js  # PM2 process management
├── package.json         # Project manifests & dependencies
└── server.js            # Node.js Express server logic
```

### 4. Core Modules & Their Functionality
#### a. Administrative Portal (`/admin/*`)
- **Dashboard**: High-level metrics: total staff, pending approvals, leave trends.
- **Admin Managed Staff**: CRUD operations for employee records.
- **Admin Leave & Type**: Definition of leave categories (CL, Medical, Casual, etc.).
- **Report Engine**: Generates PDF reports with filtering by department/session.

#### b. Staff & HOD Portal (`/staff/*`)
- **Staff Dashboard**: Personal leave balance and upcoming absences.
- **Apply Leave**: Form with file upload for justification (medical certs).
- **HOD Leave Approved**: Approval queue for department heads.
- **Staff View Status**: Real-time tracking of application progress.

### 5. Data Flow Architecture
The project utilizes a hybrid synchronization model:
1. **User Input** → Saved to **Local IndexedDB** (Instant & Offline-Capable).
2. **Sync Service** → Detects internet connectivity.
3. **API Handler** → Sends data via **Node.js Express** server.
4. **Permanent Storage** → Persisted in **MongoDB** Atlas/Local cluster.
5. **Real-time Updates** → UI reflects changes via Angular RxJS Observables.

---
*Documentation generated for ELMS Project Lifecycle v2.0*
