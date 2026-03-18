const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(cors());

// --- File Storage Setup ---
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- Database Connection ---
mongoose.connect('mongodb://127.0.0.1:27017/employeeDB')
    .then(() => console.log("Connected to MongoDB - employeeDB"))
    .catch(err => console.error("Database Connection Error:", err));

// --- Schemas ---

// 1. Session Settings
// Update your Session Schema to include timestamps
const sessionSchema = new mongoose.Schema({
    sessionName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true }
}, { timestamps: true }); // <--- CRITICAL: Adds createdAt and updatedAt automatically

const Session = mongoose.model('Session', sessionSchema, 'active_sessions');
// Update the GET route to fetch the LATEST updated session

// 2. Users
const userSchema = new mongoose.Schema({
    "Employee Code": Number,
    "Name": String,
    "Email": { type: String, required: true },
    "Password": { type: Number, required: true },
    "role": String,
    "department": String,
    "dept_code": Number,
    "staffType": { type: String, default: 'Teaching' }
}, { collection: 'users', versionKey: false });
const User = mongoose.model('User', userSchema);

// 3. Leave Types (Integrated Session-Wise Logic)
const leaveTypeSchema = new mongoose.Schema({
    leave_name: String,
    total_yearly_limit: Number,
    dept_code: Number,
    staffType: String,
    can_carry_forward: { type: Boolean, default: false },
    sessionName: String // Links quota to a specific year
}, { collection: 'leave_types', versionKey: false });
const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

// 4. Leave Applications
// 4. Leave Applications
const leaveSchema = new mongoose.Schema({
    sr_no: String,
    Emp_CODE: Number,
    Name: String,
    Dept_Code: Number,
    "Type of Leave": String,
    From: String,
    To: String,
    "Total Days": Number,
    sessionName: String,
    Status: { type: String, default: 'Pending' },
    HOD_Approved: { type: Boolean, default: false },
    Reject_Reason: String,
    Reason: String,
    document: String,
    VAL_working_dates: String  // 3 working dates required for VAL leave type
}, { collection: 'leave_applications', versionKey: false });
const Leave = mongoose.model('Leave', leaveSchema);

// 5. Balance Adjustments (Manual edits by Admin)
const balanceAdjustmentSchema = new mongoose.Schema({
    empCode: Number,
    leaveType: String,
    sessionName: String,
    adjustmentValue: Number, // The value the admin manually SETS as remaining
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'balance_adjustments', versionKey: false });
const BalanceAdjustment = mongoose.model('BalanceAdjustment', balanceAdjustmentSchema);

// --- ROUTES ---

// 1. ADMIN SESSION CONTROL
app.post('/api/admin/set-session', async (req, res) => {
    try {
        const { sessionName, startDate, endDate } = req.body;

        // 1. Update/Create the session record
        await Session.findOneAndUpdate(
            {}, // Empty filter updates the first/only record
            { sessionName, startDate, endDate },
            { upsert: true, returnDocument: 'after' }
        );

        // 2. AUTO-SEEDING LOGIC: If this session has no quotas, provide defaults
        const existingQuotas = await LeaveType.countDocuments({ sessionName });
        if (existingQuotas === 0) {
            const defaultTypes = [
                { name: 'CL', limit: 12, cf: false },
                { name: 'SL', limit: 12, cf: true },
                { name: 'AL', limit: 0,  cf: false },
                { name: 'VAL', limit: 0,  cf: false },
                { name: 'DL', limit: 0,  cf: false },
                { name: 'SAT', limit: 12, cf: false },
                { name: 'EL', limit: 12, cf: true }
            ];

            const seedData = defaultTypes.map(t => ({
                leave_name: t.name,
                total_yearly_limit: t.limit,
                dept_code: 0, // Global/All
                staffType: 'All',
                can_carry_forward: t.cf,
                sessionName: sessionName
            }));

            await LeaveType.insertMany(seedData);
            console.log(`Auto-seeded default quotas for session: ${sessionName}`);
        }

        res.json({ success: true });
    } catch (err) {
        console.error("Session Set Error:", err);
        res.status(500).send(err);
    }
});
// GET: All Saved Sessions for your Dropdown
app.get('/api/sessions/all', async (req, res) => {
    try {
        const sessions = await Session.find().sort({ sessionName: -1 });
        res.json(sessions);
    } catch (err) { res.status(500).json({ error: "Fetch sessions failed" }); }
});

// GET: The Single "Current" Active Session (Sorted by LATEST activity)
app.get('/api/active-session', async (req, res) => {
    try {
        const session = await Session.findOne().sort({ updatedAt: -1 });
        res.json(session || { sessionName: "Not Set", startDate: "", endDate: "" });
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.get('/api/sessions/list', async (req, res) => {
    try {
        // 1. Get existing session labels
        const historical = await Leave.distinct("sessionName");

        // 2. Scan dates for years not yet labeled
        const dates = await Leave.distinct("From");
        const yearsFromDates = dates.map(d => {
            const year = new Date(d).getFullYear();
            const month = new Date(d).getMonth() + 1;
            // If month is Jan-May, it belongs to (Year-1)-Year session
            return month <= 5 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
        });

        const active = await Session.findOne();

        let all = [...historical, ...yearsFromDates];
        if (active) all.push(active.sessionName);

        // Filter out nulls, remove duplicates, sort
        const unique = [...new Set(all)].filter(s => s && s !== "Not Set").sort().reverse();
        res.json(unique);
    } catch (err) { res.status(500).json(err); }
});
// 2. LIVE BALANCE CALCULATOR (Supports Incrementing VAL/AL & Deduction CL/SL)
async function calculateUserBalance(empCode, type, sessionName) {
    const employeeCode = Number(empCode);
    
    // VALIDATION: Prevent NaN or 0 codes from crashing Mongoose findOne
    if (isNaN(employeeCode) || employeeCode <= 0) {
        return { balance: 0, error: "Invalid Employee Code" };
    }

    const leaveTypeUpper = type.toUpperCase().trim();
    const currentSessionName = sessionName;

    // 1. Fetch User
    const emp = await User.findOne({ "Employee Code": employeeCode });
    if (!emp) return { balance: 0, error: "User not found" };
    
    const userDept = String(emp.dept_code || '');

    // 2. Fetch Rules
    const allRulesForType = await LeaveType.find({ leave_name: leaveTypeUpper }).lean();
    const userRules = allRulesForType.filter(r => 
        String(r.dept_code) === userDept || String(r.dept_code) === '0'
    );

    let currentRule = userRules.find(r => r.sessionName === currentSessionName);
    if (!currentRule) {
        currentRule = {
            leave_name: leaveTypeUpper,
            total_yearly_limit: (['AL', 'VAL', 'DL'].includes(leaveTypeUpper)) ? 0 : 12,
            can_carry_forward: (leaveTypeUpper === 'SL' || leaveTypeUpper === 'EL'),
            sessionName: currentSessionName
        };
    }

    // 3. Mode Selection
    const isIncrementing = Number(currentRule.total_yearly_limit) === 0;

    // 4. Calculate Used (Always Session Scoped)
    const leavesThisSession = await Leave.find({
        Emp_CODE: employeeCode,
        sessionName: currentSessionName,
        Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] },
        $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
    }).lean();

    const usedThisYear = leavesThisSession.reduce((sum, l) => sum + (Number(l["Total Days"] || l.Total_Days) || 0), 0);

    // 5. Manual Adjustment Fetch
    const manualAdjustment = await BalanceAdjustment.findOne({
        empCode: employeeCode,
        leaveType: leaveTypeUpper,
        sessionName: currentSessionName
    }).lean();

    // 6. MODE ACTIONS
    if (isIncrementing) {
        // CASE A: Accumulating (Starts at 0, goes up)
        const finalBalance = manualAdjustment ? manualAdjustment.adjustmentValue : usedThisYear;
        return { 
            balance: finalBalance, 
            isIncrementing: true, 
            sessionName: currentSessionName,
            isManuallyAdjusted: !!manualAdjustment,
            usedThisYear: usedThisYear,
            limit: '-'
        };
    } else {
        // CASE B: Deducting (Starts at Quota, goes down)
        let totalLimit = Number(currentRule.total_yearly_limit);
        let carryForwardAmount = 0;
        
        // Carry Forward Logic
        if (currentRule.can_carry_forward) {
            const currentYearStart = parseInt(currentSessionName.split('-')[0]);
            const pastRules = Array.from(new Map(userRules.filter(r => parseInt(r.sessionName.split('-')[0]) < currentYearStart).map(r => [r.sessionName, r])).values());

            for (let pastRule of pastRules) {
                const pastAdjustment = await BalanceAdjustment.findOne({
                    empCode: employeeCode,
                    leaveType: leaveTypeUpper,
                    sessionName: pastRule.sessionName
                }).lean();

                let carryAmount = 0;
                if (pastAdjustment) {
                    carryAmount = Number(pastAdjustment.adjustmentValue);
                } else {
                    const pastLeaves = await Leave.find({
                        Emp_CODE: employeeCode,
                        sessionName: pastRule.sessionName,
                        Status: { $in: ['Approved', 'Final Approved', 'HOD Approved'] },
                        $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
                    }).lean();
                    const pastUsed = pastLeaves.reduce((sum, l) => sum + (Number(l["Total Days"] || l.Total_Days) || 0), 0);
                    carryAmount = Math.max(0, Number(pastRule.total_yearly_limit) - pastUsed);
                }
                totalLimit += carryAmount;
                carryForwardAmount += carryAmount;
            }
        }

        let finalBalance = Math.max(0, totalLimit - usedThisYear);
        let finalLimit = totalLimit;

        if (manualAdjustment) {
            finalBalance = manualAdjustment.adjustmentValue;
            finalLimit = finalBalance + usedThisYear;
        }

        return { 
            balance: finalBalance, 
            isIncrementing: false,
            sessionName: currentSessionName,
            limit: finalLimit,
            carryForward: carryForwardAmount,
            currentLimit: Number(currentRule.total_yearly_limit),
            usedThisYear: usedThisYear,
            isManuallyAdjusted: !!manualAdjustment
        };
    }
}

app.get('/api/leaves/balance/:empCode/:type', async (req, res) => {
    try {
        const { empCode, type } = req.params;
        const { sessionName: querySession } = req.query;
        
        let sessionToUse;
        if (querySession) {
            sessionToUse = querySession;
        } else {
            const activeSession = await Session.findOne().sort({ updatedAt: -1 });
            if (!activeSession) return res.json({ balance: 0, error: "No active session set by admin" });
            sessionToUse = activeSession.sessionName;
        }

        const result = await calculateUserBalance(empCode, type, sessionToUse);
        res.json(result);

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Internal Server Error" });
    }
});
// Helper function to detect session from date strings like "6/18/2025"
function isDateInSession(dateStr, sessionLabel) {
    if (!dateStr || !sessionLabel) return false;
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const startYear = parseInt(sessionLabel.split('-')[0]);

    // Academic year: June (6) to March (3) of next year
    return (year === startYear && month >= 6) || (year === startYear + 1 && month <= 3);
}

// Ensure dates parse robustly into local time without UTC offset glitches
function parseDateLocal(dateStr) {
    if (!dateStr) return new Date(0);
    if (dateStr.includes('-')) {
        const parts = dateStr.split('-');
        return new Date(parts[0], parts[1]-1, parts[2]);
    } else if (dateStr.includes('/')) {
        const parts = dateStr.split('/');
        return new Date(parts[2], parts[0]-1, parts[1]);
    }
    return new Date(dateStr);
}

// 3. APPLY LEAVE
app.post('/api/leaves/apply', upload.single('document'), async (req, res) => {
    try {
        const { Type_of_Leave, Total_Days, Emp_CODE, From, To, sr_no, Name, Dept_Code, Role, VAL_working_dates, Reason } = req.body;

        // --- VAL WORKING DATES VALIDATION ---
        if (Type_of_Leave?.toUpperCase() === 'VAL' && !VAL_working_dates?.trim()) {
            return res.status(400).json({
                success: false,
                error: "Please mention the 3 working dates during vacation for VAL leave."
            });
        }
        
        // --- 1. OVERLAPPING DATE VALIDATION ---
        const existingLeaves = await Leave.find({
            Emp_CODE: Number(Emp_CODE),
            Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] }
        }).lean();

        const newStart = parseDateLocal(From);
        const newEnd = parseDateLocal(To);

        for (let leave of existingLeaves) {
            if (!leave.From || !leave.To) continue;
            const existStart = parseDateLocal(leave.From);
            const existEnd = parseDateLocal(leave.To);
            
            // Check for date range overlap
            if (newStart <= existEnd && newEnd >= existStart) {
                return res.status(400).json({
                    success: false,
                    error: `You already have a leave scheduled between ${leave.From} and ${leave.To}. Dates cannot overlap.`
                });
            }
        }

        // --- 2. SATURDAY LEAVE VALIDATION ---
        if (Type_of_Leave?.toUpperCase() === 'SAT') {
            let current = new Date(newStart);
            while (current <= newEnd) {
                if (current.getDay() !== 6) { // 6 = Saturday
                    return res.status(400).json({
                        success: false,
                        error: "SAT leaves can only be applied on Saturdays. Please select valid Saturday dates."
                    });
                }
                current.setDate(current.getDate() + 1);
            }
        }
        
        // --- 3. SL DOCUMENT VALIDATION ---
        if (Type_of_Leave?.toUpperCase() === 'SL' && Number(Total_Days) > 3 && !req.file) {
            return res.status(400).json({ 
                success: false, 
                error: "Medical document is required for Sick Leave exceeding 3 days." 
            });
        }

        const activeSession = await Session.findOne().sort({ updatedAt: -1 });
        
        const newLeave = new Leave({
            sr_no: sr_no,
            Emp_CODE: Number(Emp_CODE),
            Name: Name,
            Dept_Code: Number(Dept_Code),
            "Type of Leave": Type_of_Leave.toUpperCase(),
            From: From,
            To: To,
            "Total Days": Number(Total_Days),
            sessionName: activeSession?.sessionName || "2025-26",
            document: req.file ? req.file.filename : null,
            Status: 'Pending',
            Reason: Reason,
            VAL_working_dates: Type_of_Leave?.toUpperCase() === 'VAL' ? VAL_working_dates?.trim() : undefined
        });

        await newLeave.save();
        res.json({ success: true, data: newLeave });
    } catch (err) { 
        res.status(500).json({ success: false, error: "Submission failed" }); 
    }
});
// 4. LEAVE TYPES MANAGEMENT (Session-Wise Setting)
app.post('/api/leave-types/set', async (req, res) => {
    try {
        const { leave_name, total_yearly_limit, dept_code, staffType, can_carry_forward, sessionName } = req.body;

        const query = {
            leave_name: leave_name.toUpperCase(),
            dept_code,
            staffType,
            sessionName
        };

        const updatedType = await LeaveType.findOneAndUpdate(
            query,
            { total_yearly_limit: Number(total_yearly_limit), can_carry_forward },
            { upsert: true, returnDocument: 'after' }
        );
        res.json({ success: true, data: updatedType });
    } catch (err) { res.status(500).json({ success: false, error: "Database save failed" }); }
});

app.get('/api/leave-types', async (req, res) => { res.json(await LeaveType.find({})); });

app.delete('/api/leave-types/:id', async (req, res) => {
    await LeaveType.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// 5. PROCESS DECISION
app.post('/api/leaves/process/:id', async (req, res) => {
    const { status, reason } = req.body;
    const updateData = { Status: status };
    if (status === 'Rejected' && reason) updateData.Reject_Reason = reason;
    const updated = await Leave.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json({ success: true, data: updated });
});

// 6. MANUAL BALANCE ADJUSTMENT
app.post('/api/leaves/adjust-balance', async (req, res) => {
    try {
        const { empCode, leaveType, sessionName, adjustmentValue } = req.body;
        
        const query = {
            empCode: Number(empCode),
            leaveType: leaveType.toUpperCase(),
            sessionName: sessionName
        };

        const updated = await BalanceAdjustment.findOneAndUpdate(
            query,
            { adjustmentValue: Number(adjustmentValue), updatedAt: new Date() },
            { upsert: true, returnDocument: 'after' }
        );
        
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Adjustment failed" });
    }
});

// 6b. SYNC ALL BALANCES TO MONGODB (Force calculation and storage for all)
app.post('/api/admin/sync-all-balances', async (req, res) => {
    try {
        const activeSession = await Session.findOne().sort({ updatedAt: -1 });
        if (!activeSession) return res.status(400).json({ success: false, error: "No active session set." });

        const sessionName = activeSession.sessionName;
        const users = await User.find({}).lean();
        const leaveTypes = await LeaveType.distinct("leave_name", { sessionName });

        console.log(`[Sync] Starting full balance synchronization for session: ${sessionName}...`);
        let syncCount = 0;

        for (let user of users) {
            const empCode = user["Employee Code"];
            if (!empCode) continue;

            for (let type of leaveTypes) {
                // Calculate the LIVE balance
                const result = await calculateUserBalance(empCode, type, sessionName);
                
                // Update/Create the Master Copy in balance_adjustments
                const query = {
                    empCode: Number(empCode),
                    leaveType: type.toUpperCase(),
                    sessionName: sessionName
                };

                await BalanceAdjustment.findOneAndUpdate(
                    query,
                    { adjustmentValue: Number(result.balance), updatedAt: new Date() },
                    { upsert: true }
                );
                syncCount++;
            }
        }

        console.log(`[Sync] Completed! Total Records Updated: ${syncCount}`);
        res.json({ success: true, count: syncCount });

    } catch (err) {
        console.error("Sync Error:", err);
        res.status(500).json({ success: false, error: "Sync failed" });
    }
});


// Get next GLOBAL Sr. No (continuous across all staff — 1, 2, 3, ...)
app.get('/api/leaves/next-sr-no/:empCode', async (req, res) => {
    try {
        // Search ALL leaves (global sequence, not per-employee)
        const leaves = await Leave.find({}).lean();
        
        let maxSr = 0;
        for (const l of leaves) {
            // Parse the sr_no — handles "5", "2025/003", "001" etc.
            const raw = String(l.sr_no || l['Sr No'] || '0');
            const match = raw.match(/(\d+)$/);
            if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxSr) maxSr = num;
            }
        }
        
        res.json({ nextSrNo: maxSr + 1 });
    } catch (err) {
        res.json({ nextSrNo: 1 });
    }
});

// 6. LOGIN & STAFF MANAGEMENT
app.post('/login', async (req, res) => {
    try {
        const password = Number(req.body.password);
        if (isNaN(password)) return res.status(401).json({ success: false, error: "Invalid password format" });
        
        const user = await User.findOne({ "Email": req.body.email, "Password": password });
        if (user) {
            res.json({
                success: true, name: user["Name"], empCode: user["Employee Code"],
                role: user["role"], dept: user["department"], dept_code: user["dept_code"],
                staffType: user["staffType"] || 'Teaching'
            });
        } else { res.status(401).json({ success: false }); }
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/leaves/staff/:empCode', async (req, res) => {
    const empCode = Number(req.params.empCode);
    if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
    const leaves = await Leave.find({ Emp_CODE: empCode }).sort({ From: -1 }).lean();
    res.json(leaves);
});

app.get('/api/leaves/admin', async (req, res) => { res.json(await Leave.find({}).sort({ From: -1 }).lean()); });

app.get('/api/staff', async (req, res) => { res.json(await User.find({})); });

app.post('/api/staff', async (req, res) => {
    const latest = await User.findOne().sort({ "Employee Code": -1 });
    const nextCode = latest ? latest["Employee Code"] + 1 : 101;
    const newUser = new User({ ...req.body, "Employee Code": nextCode });
    await newUser.save();
    res.json(newUser);
});

app.put('/api/staff/:id', async (req, res) => {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
});

app.delete('/api/staff/:id', async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
});

// 7. PROFILE UPDATE
app.get('/api/profile/:empCode', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
        const user = await User.findOne({ "Employee Code": empCode });
        if (user) res.json(user);
        else res.status(404).json({ error: "User not found" });
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.put('/api/profile/:empCode', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
        const { Email, Password } = req.body;
        const updated = await User.findOneAndUpdate(
            { "Employee Code": empCode },
            { Email: Email, Password: Number(Password) },
            { new: true }
        );
        res.json({ success: true, data: updated });
    } catch (err) { res.status(500).json({ success: false, error: "Update failed" }); }
});

// 8. ADMIN HELPER ENDPOINTS
app.get('/api/admin/employee-results/:empCode', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        const user = await User.findOne({ "Employee Code": empCode });
        if (!user) return res.status(404).json({ error: "User not found" });

        const activeSession = await Session.findOne().sort({ updatedAt: -1 });
        const sessionName = activeSession?.sessionName || "2025-26";

        // Fetch all leave types applicable for this user/dept/session
        const allTypes = await LeaveType.distinct("leave_name", { sessionName });
        const balances = [];
        
        for (let type of allTypes) {
            const b = await calculateUserBalance(empCode, type, sessionName);
            balances.push({
                type,
                balance: b.balance,
                used: b.usedThisYear,
                limit: b.limit,
                isIncrementing: b.isIncrementing
            });
        }
        
        res.json({
            user: {
                name: user.Name,
                empCode: user["Employee Code"],
                role: user.role,
                dept_code: user.dept_code,
                department: user.department,
                staffType: user.staffType
            },
            balances,
            sessionName
        });
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.get('/api/admin/leave-history/:empCode/:type', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
        const type = req.params.type;
        const activeSession = await Session.findOne().sort({ updatedAt: -1 });
        const sessionName = activeSession?.sessionName || "2025-26";

        // Querying with EXACT schema field names
        // Including Pending to match the "taken" balance calculation
        const history = await Leave.find({ 
            Emp_CODE: empCode, 
            "Type of Leave": type.toUpperCase().trim(),
            sessionName: sessionName,
            Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] } 
        }).sort({ From: -1 }).lean(); 

        res.json(history);
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));