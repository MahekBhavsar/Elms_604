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
    sr_no: String,        // <--- ADD THIS LINE
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
    document: String
}, { collection: 'leave_applications', versionKey: false });
const Leave = mongoose.model('Leave', leaveSchema);

// --- ROUTES ---

// 1. ADMIN SESSION CONTROL
app.post('/api/admin/set-session', async (req, res) => {
    try {
        const { sessionName, startDate, endDate } = req.body;

        // This ensures the single "Active" record is updated
        await Session.findOneAndUpdate(
            {}, // Empty filter updates the first/only record
            { sessionName, startDate, endDate },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
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

// GET: The Single "Current" Active Session (First record or specialized flag)
app.get('/api/active-session', async (req, res) => {
    try {
        // Sort by updatedAt descending to get the one you last clicked "Save & Set Active"
        const session = await Session.findOne().sort({ updatedAt: -1 });
        res.json(session || { sessionName: "Not Set" });
    } catch (err) { res.status(500).send(err); }
});
app.get('/api/active-session', async (req, res) => {
    try {
        const session = await Session.findOne();
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
        const leaveTypeUpper = type.toUpperCase();

        // 1. Get the current active session (from Admin)
        const activeSession = await Session.findOne().sort({ updatedAt: -1 });
        if (!activeSession) return res.json({ balance: 0 });

        const currentSessionName = activeSession.sessionName;
        const sessionStart = new Date(activeSession.startDate);
        const sessionEnd = new Date(activeSession.endDate);

        const emp = await User.findOne({ "Employee Code": Number(empCode) });
        if (!emp) return res.json({ balance: 0 });

        // 2. Get ALL sessions sorted chronologically to handle SL Carry Forward
        const allSessions = await Session.find().sort({ startDate: 1 });

        // Helper: Get used days for a specific session (Matching by Label OR Date Range)
        const getUsedForSessionWindow = async (sessionObj) => {
            const start = new Date(sessionObj.startDate);
            const end = new Date(sessionObj.endDate);
            const label = sessionObj.sessionName;

            const leaves = await Leave.find({
                Emp_CODE: Number(empCode),
                Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] },
                $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
            }).lean();

            return leaves.reduce((sum, l) => {
                const leaveDate = new Date(l.From);
                // Match if: has correct session label OR date falls within start/end dates
                const isMatch = l.sessionName === label || (leaveDate >= start && leaveDate <= end);
                return isMatch ? sum + (Number(l["Total Days"] || l.Total_Days) || 0) : sum;
            }, 0);
        };

        // Helper: Get quota rule for a session
        const getRule = async (sessionName) => {
            return await LeaveType.findOne({
                leave_name: leaveTypeUpper,
                dept_code: emp.dept_code,
                staffType: emp.staffType || 'Teaching', // FIX: default to Teaching if undefined matching login
                sessionName: sessionName
            });
        };

        // --- CALCULATION ---

        // CASE A: SL (Carry Forward Logic)
        // Per user requirements, carry-forward leaves should no longer automatically swell the dynamic limit.
        // It should match the base database rule just like regular leaves.
        // Thus, we skip explicit compounding history parsing for SL and let it drop down to CASE C.

        // CASE B: VAL / AL (Incrementing - Total History)
        if (['VAL', 'AL'].includes(leaveTypeUpper)) {
            const history = await Leave.find({
                Emp_CODE: Number(empCode),
                Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] },
                $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
            }).lean();
            const total = history.reduce((sum, l) => sum + (Number(l["Total Days"] || l.Total_Days) || 0), 0);
            return res.json({ balance: total, isIncrementing: true });
        }

        // CASE C: CL / DL / ML (Yearly Reset - Current Window Only)
        const currentRule = await getRule(currentSessionName);
        if (!currentRule) return res.json({ balance: 0 });

        const usedThisYear = await getUsedForSessionWindow(activeSession);
        const limit = Number(currentRule.total_yearly_limit);

        res.json({ balance: Math.max(0, limit - usedThisYear), isIncrementing: false });

    } catch (err) {
        res.status(500).send("Balance Calculation Error");
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
// 3. APPLY LEAVE
app.post('/api/leaves/apply', upload.single('document'), async (req, res) => {
    try {
        const { Type_of_Leave, Total_Days } = req.body;
        
        // --- SL DOCUMENT VALIDATION ---
        if (Type_of_Leave?.toUpperCase() === 'SL' && Number(Total_Days) > 3 && !req.file) {
            return res.status(400).json({ 
                success: false, 
                error: "Medical document is required for Sick Leave exceeding 3 days." 
            });
        }

        const activeSession = await Session.findOne().sort({ updatedAt: -1 });
        
        const newLeave = new Leave({
            sr_no: req.body.sr_no, // Saves manual Sr No from UI
            Emp_CODE: Number(req.body.Emp_CODE),
            Name: req.body.Name,
            Dept_Code: Number(req.body.Dept_Code),
            "Type of Leave": Type_of_Leave.toUpperCase(),
            From: req.body.From,
            To: req.body.To,
            "Total Days": Number(Total_Days),
            sessionName: activeSession?.sessionName || "2025-26",
            document: req.file ? req.file.filename : null,
            Status: 'Pending' 
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
            { upsert: true, new: true }
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