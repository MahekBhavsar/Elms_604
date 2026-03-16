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
                { name: 'AL', limit: 12, cf: false },
                { name: 'VAL', limit: 12, cf: false },
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
app.get('/api/leaves/balance/:empCode/:type', async (req, res) => {
    try {
        const { empCode, type } = req.params;
        const { sessionName: querySession } = req.query; // <--- ADDED: support for query param
        const employeeCode = Number(empCode);
        const leaveTypeUpper = type.toUpperCase().trim();

        if (isNaN(employeeCode)) {
            return res.status(400).json({ balance: 0, error: "Invalid Employee Code provided" });
        }

        // 1. Get the session to use
        let sessionToUse;
        if (querySession) {
            sessionToUse = querySession;
        } else {
            const activeSession = await Session.findOne().sort({ updatedAt: -1 });
            if (!activeSession) return res.json({ balance: 0, error: "No active session set by admin" });
            sessionToUse = activeSession.sessionName;
        }

        const currentSessionName = sessionToUse;

        // 2. Fetch User and ensure we have their dept_code as a String for safe comparison
        const emp = await User.findOne({ "Employee Code": employeeCode });
        if (!emp) return res.json({ balance: 0, error: "User not found" });
        
        const userDept = String(emp.dept_code || '');
        const userStaffType = emp.staffType || 'Teaching';

        // 3. CASE A: AL (Incrementing - Total History across all sessions)
        // Note: EL and VAL are now removed from here to support yearly quotas
        if (['AL'].includes(leaveTypeUpper)) {
            const history = await Leave.find({
                Emp_CODE: employeeCode,
                Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] },
                $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
            }).lean();
            const total = history.reduce((sum, l) => sum + (Number(l["Total Days"] || l.Total_Days) || 0), 0);
            
            // Check for manual adjustments (even for VAL/AL)
            const manualAdjustment = await BalanceAdjustment.findOne({
                empCode: employeeCode,
                leaveType: leaveTypeUpper,
                sessionName: currentSessionName
            }).lean();

            const finalTotal = manualAdjustment ? manualAdjustment.adjustmentValue : total;

            return res.json({ 
                balance: finalTotal, 
                isIncrementing: true, 
                sessionName: currentSessionName,
                isManuallyAdjusted: !!manualAdjustment,
                usedThisYear: total, // For incrementing, 'used' is the total accumulated
                limit: '-' // No limit for incrementing types usually
            });
        }

        // 4. Fetch ALL rules for this user's leave type to handle Current + Carry Forward
        const allRulesForType = await LeaveType.find({ 
            leave_name: leaveTypeUpper 
        }).lean();

        // Filter rules matching user's specific dept OR universal '0'
        const userRules = allRulesForType.filter(r => 
            String(r.dept_code) === userDept || String(r.dept_code) === '0'
        );

        // Find the rule for the target session
        let currentRule = userRules.find(r => r.sessionName === currentSessionName);
        
        // --- DEFAULT 12-DAY LOGIC ---
        // If no explicit rule is found, we fall back to a default limit of 12 (as requested)
        if (!currentRule) {
            currentRule = {
                leave_name: leaveTypeUpper,
                total_yearly_limit: 12,
                can_carry_forward: (leaveTypeUpper === 'SL' || leaveTypeUpper === 'EL'), // Only SL/EL
                sessionName: currentSessionName
            };
        }

        // 5. Calculate used leaves in the CURRENT session
        // We match by sessionName label to be 100% accurate to your DB table
        const leavesThisSession = await Leave.find({
            Emp_CODE: employeeCode,
            sessionName: currentSessionName,
            Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] },
            $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
        }).lean();

        const usedThisYear = leavesThisSession.reduce((sum, l) => sum + (Number(l["Total Days"] || l.Total_Days) || 0), 0);

        // 6. Handle Carry Forward (SL / SAT)
        let totalLimit = Number(currentRule.total_yearly_limit);
        let carryForwardAmount = 0;
        
        if (currentRule.can_carry_forward) {
            const currentYearStart = parseInt(currentSessionName.split('-')[0]); // e.g., 2025
            
            // Get rules from previous years (e.g., 2024)
            const rawPastRules = userRules.filter(r => {
                const rYear = parseInt(r.sessionName.split('-')[0]);
                return rYear < currentYearStart;
            });

            // Deduplicate past rules so we don't multiply carry forward because of legacy staffTypes
            const pastRulesMap = new Map();
            rawPastRules.forEach(r => {
                if (!pastRulesMap.has(r.sessionName)) {
                    pastRulesMap.set(r.sessionName, r);
                }
            });
            const pastRules = Array.from(pastRulesMap.values());

            for (let pastRule of pastRules) {
                // Check if there was a manual adjustment for this specific past year
                const pastAdjustment = await BalanceAdjustment.findOne({
                    empCode: Number(empCode),
                    leaveType: leaveTypeUpper,
                    sessionName: pastRule.sessionName
                }).lean();

                let carryAmount = 0;
                if (pastAdjustment) {
                    // If manually adjusted, that value IS the remainder for that year
                    carryAmount = Number(pastAdjustment.adjustmentValue);
                } else {
                    const pastLeaves = await Leave.find({
                        Emp_CODE: Number(empCode),
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

        // 7. Check for manual adjustments
        const manualAdjustment = await BalanceAdjustment.findOne({
            empCode: employeeCode,
            leaveType: leaveTypeUpper,
            sessionName: currentSessionName
        }).lean();

        let finalBalance = Math.max(0, totalLimit - usedThisYear);
        let finalLimit = totalLimit;

        if (manualAdjustment) {
            finalBalance = manualAdjustment.adjustmentValue;
            // Sync limit so that Used + Remaining = Limit (Perfect Math for UI)
            finalLimit = finalBalance + usedThisYear;
        }

        res.json({ 
            balance: finalBalance, 
            isIncrementing: false,
            sessionName: currentSessionName,
            limit: finalLimit, // <--- Synced
            carryForward: carryForwardAmount,
            currentLimit: Number(currentRule.total_yearly_limit),
            usedThisYear: usedThisYear,
            isManuallyAdjusted: !!manualAdjustment
        });

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
        const { Type_of_Leave, Total_Days, Emp_CODE, From, To, sr_no, Name, Dept_Code, Role, VAL_working_dates } = req.body;

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

// 6. LOGIN & STAFF MANAGEMENT
app.post('/login', async (req, res) => {
    try {
        const user = await User.findOne({ "Email": req.body.email, "Password": Number(req.body.password) });
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
    const leaves = await Leave.find({ Emp_CODE: Number(req.params.empCode) }).sort({ From: -1 });
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
        const user = await User.findOne({ "Employee Code": Number(req.params.empCode) });
        if (user) res.json(user);
        else res.status(404).json({ error: "User not found" });
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.put('/api/profile/:empCode', async (req, res) => {
    try {
        const { Email, Password } = req.body;
        const updated = await User.findOneAndUpdate(
            { "Employee Code": Number(req.params.empCode) },
            { Email: Email, Password: Number(Password) },
            { new: true }
        );
        res.json({ success: true, data: updated });
    } catch (err) { res.status(500).json({ success: false, error: "Update failed" }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));