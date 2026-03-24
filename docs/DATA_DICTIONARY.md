# DATA DICTIONARY: ELMS v2.0
## Database Schema & Collection Information
**Database Type**: MongoDB (Mongoose Schema)
**Prepared by**: Mahek Bhavsar  •  March 2026

---

### 1. **Collections Overview**
This project uses five primary collections to manage sessions, users, leave rules, and applications. 

| Collection Name | Model Name | Description |
| :--- | :--- | :--- |
| `active_sessions` | `Session` | Stores the current and historical academic session labels and dates. |
| `users` | `User` | Main registry for staff and administrator accounts. |
| `leave_types` | `LeaveType` | Stores configuration and quotas for different leave categories per session. |
| `leave_applications` | `Leave` | Records every leave request and its approval lifecycle. |
| `balance_adjustments`| `BalanceAdjustment`| Stores manual overrides and synced balance snapshots by Admin. |

---

### 2. **Collection: `active_sessions`**
Tracks the institutional calendar periods.

| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique MongoDB internal identifier. |
| `sessionName` | `String` | Required | Unique label (e.g., "2025-2026"). |
| `startDate` | `String` | Required | Start date of the academic period. |
| `endDate` | `String` | Required | End date of the academic period. |
| `createdAt` | `Date` | Auto | System-generated creation timestamp. |
| `updatedAt` | `Date` | Auto | System-generated last update timestamp. |

---

### 3. **Collection: `users`**
The core entity representing all employees and administrators.

| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique MongoDB internal identifier. |
| `Employee Code` | `Number` | Unique | Primary identifier for the employee (e.g., 101, 102). |
| `Name` | `String` | - | Full name of the user. |
| `Email` | `String` | Required | Official email used for authentication. |
| `Password` | `Number` | Required | Numeric password (secure storage for demo). |
| `role` | `String` | - | Access level (e.g., **Admin**, **Staff**). |
| `department` | `String` | - | Human-readable department name. |
| `dept_code` | `Number` | - | Unique code for logical grouping (e.g., 604 for BCA). |
| `staffType` | `String` | `Default: 'Teaching'`| Grouping: 'Teaching', 'Non-Teaching', etc. |

---

### 4. **Collection: `leave_types`**
Defines the rules and global quotas per session.

| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique MongoDB internal identifier. |
| `leave_name` | `String` | - | Identifier (e.g., CL, SL, AL, VAL, SAT). |
| `total_yearly_limit`| `Number` | - | Max days allowed. (0 = Accumulating/Incrementing). |
| `dept_code` | `Number` | - | Restricts rule to a specific dept (0 = All). |
| `staffType` | `String` | - | Filters by staff group (e.g., 'Teaching', 'All'). |
| `can_carry_forward` | `Boolean` | `Default: false` | If true, unused days roll over to next session. |
| `sessionName` | `String` | - | Links the quota rule to a specific session. |

---

### 5. **Collection: `leave_applications`**
Central ledger for all leave-related transactions.

| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique MongoDB internal identifier. |
| `sr_no` | `String` | - | Global sequential tracking ID (e.g., "2025/001"). |
| `Emp_CODE` | `Number` | - | Foreign link to `users["Employee Code"]`. |
| `Name` | `String` | - | Denormalized applicant name for fast lookups. |
| `Dept_Code` | `Number` | - | Applicant's department code. |
| `Type of Leave` | `String` | - | Category (Normalized to Upper Case). |
| `From` | `String` | - | Selected start date of leave. |
| `To` | `String` | - | Selected end date of leave. |
| `Total Days` | `Number` | - | Duration calculated by the frontend/sync. |
| `sessionName` | `String` | - | Session year of the transaction. |
| `Status` | `String` | `Default: 'Pending'`| Lifecycle: 'Pending', 'Approved', 'Rejected'. |
| `HOD_Approved` | `Boolean` | `Default: false` | Specific flag for HOD-level preliminary approval. |
| `Reason` | `String` | - | Applicant's justification for the request. |
| `Reject_Reason` | `String` | - | Feedback from Admin if application is rejected. |
| `document` | `String` | - | Filename of medical cert or enclosure (if any). |
| `VAL_working_dates` | `String` | - | Required working context specifically for VAL type. |

---

### 6. **Collection: `balance_adjustments`**
Historical record of manual edits and automated snapshots.

| Field Name | Data Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique MongoDB internal identifier. |
| `empCode` | `Number` | - | Target employee code. |
| `leaveType` | `String` | - | Leave category identifier (e.g., "CL"). |
| `sessionName` | `String` | - | Session context for the adjustment. |
| `adjustmentValue` | `Number` | - | The final balance value forced/snapshotted. |
| `updatedAt` | `Date` | `Default: now` | Internal tracking for sync freshness. |

---
*Documentation generated for ELMS Project Lifecycle v2.0*
*Data Integrity & Compliance Check — March 2026*
