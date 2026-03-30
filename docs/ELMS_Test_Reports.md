# Employee Leave Management System (ELMS v2.0)
## Formal Test & Reports Document
> **Prepared by:** Mahek Bhavsar and Harshil Sureja
> **Project Scope:** Multi-Role Institutional Leave Architeture with Offline-Sync Capabilities.

---

### 1. Introduction
The objective of this Test and Reports Document is to comprehensively evaluate the functional integrity, offline resilience, and mathematical accuracy of the Employee Leave Management System (ELMS v2.0). Testing strictly verifies the separation of concerns across the three primary roles: **Admin**, **HOD**, and **Staff**.

### 2. Test Environment
* **Frontend UI Array:** Angular 17+ with Glassmorphism CSS.
* **Backend Architecture:** Node.js (Express Framework).
* **Database Infrastructure:** MongoDB (NoSQL) for high-speed CRUD operations.
* **Desktop Wrapper:** Electron.js (For offline execution stability).
* **Operating Systems:** Windows 10 & Windows 11.

---

### 3. Core Test Scenarios & Cases

#### 3.1 Staff / Customer Module Testing
| Test ID | Test Scenario | Expected Outcome | Actual Status |
| :--- | :--- | :--- | :--- |
| **STF-01** | Authentic login and JWT token generation | User is navigated directly to Staff Portal Dashboard. | <span style="color:green">**PASS**</span> |
| **STF-02** | Applying for Casual Leave (CL) exceeding Quota | System instantly blocks application and shows UI warning. | <span style="color:green">**PASS**</span> |
| **STF-03** | Date Overlap Validation | System rejects leave application if dates overlap with previous requests. | <span style="color:green">**PASS**</span> |
| **STF-04** | Offline Disconnect Submission | "Sync Queue" activates yellow warning; data is cached locally safely. | <span style="color:green">**PASS**</span> |
| **STF-05** | Reconnection Background Sync | Cached leaves push to the database automatically when internet restores. | <span style="color:green">**PASS**</span> |

#### 3.2 HOD / Supplier Module Testing
| Test ID | Test Scenario | Expected Outcome | Actual Status |
| :--- | :--- | :--- | :--- |
| **HOD-01** | Role-based Dashboard routing | HOD lands on dedicated filtered queue, not global institutional queue. | <span style="color:green">**PASS**</span> |
| **HOD-02** | Departmental Data Siloing | HOD can strictly only view pending requests from their specific department. | <span style="color:green">**PASS**</span> |
| **HOD-03** | Rapid Action (Approve/Reject) | Changing status instantly updates the Staff member's "My Status Log". | <span style="color:green">**PASS**</span> |

#### 3.3 Admin Module Testing
| Test ID | Test Scenario | Expected Outcome | Actual Status |
| :--- | :--- | :--- | :--- |
| **ADM-01** | Leave Rule Configurations | Toggling "Carry-Forward" math instantly updates global staff portfolios. | <span style="color:green">**PASS**</span> |
| **ADM-02** | Session Generation | Creating a "New Academic Session" successfully archives older leave data. | <span style="color:green">**PASS**</span> |
| **ADM-03** | Institutional Intelligence Analytics | Pie Charts and Bar graphs render correctly based on live MongoDB queries. | <span style="color:green">**PASS**</span> |

---

### 4. Bug Reports & Edge-Case Resolutions

1. **Bug Report #12-A:** *Quota Miscalculation on Semester Edge.*
   * **Issue:** Staff carry-forward leaves were duplicating when crossing into a new active session.
   * **Resolution:** Implemented strict MongoDB timestamp validations and a backend `pre-save` hook to verify session boundaries before calculating limits. 
   * **Status:** Resolved.

2. **Bug Report #15-C:** *Electron Desktop Blank Screen on Load.*
   * **Issue:** The local desktop executable would occasionally render a white screen due to asynchronous database boot times.
   * **Resolution:** Re-wrote the Inter-Process Communication (IPC) bootloader in Electron to wait for local server ping before rendering the UI Window.
   * **Status:** Resolved.

---

### 5. Conclusion
The ELMS v2.0 successfully passes all analytical and functional assessments. The offline-first queuing methodology performs exceptionally well during simulated network drops, absolutely guaranteeing that staff leave forms are never lost. The mathematical engines accurately deduct caps and enforce carry-forward policies universally. The project is highly stable and ready for production deployment within the institutional network.
