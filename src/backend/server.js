const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer'); // Added nodemailer

// --- Environment Helper: Support both CommonJS and ESM/SSR environments ---
// This prevents "ReferenceError: __dirname is not defined" when integrated with Angular SSR
const os = require('os');

// --- Windows Data Directory Helper ---
// Ensures we don't try to write to Program Files (which causes Code 1 crash)
function getDataDir() {
    const appName = 'ELMS-Desktop';
    const baseDir = process.env.APPDATA || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Preferences') : path.join(os.homedir(), '.local', 'share'));
    const dataDir = path.join(baseDir, appName);
    if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir, { recursive: true }); }
    return dataDir;
}

const _dirname = getDataDir();
console.log('📂 Safe Data Directory:', _dirname);

const app = express();
app.use(express.json());
app.use(cors());

// --- Email Notification Setup ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER || 'mahek.bhavsar29@gmail.com',
        pass: process.env.EMAIL_PASS || 'jtwo znwb kkzt tvsl'
    }
});

async function sendEmailNotification(to, subject, htmlContent) {
    const fromEmail = process.env.EMAIL_USER || 'mahek.bhavsar29@gmail.com';
    const fromPass = process.env.EMAIL_PASS || 'jtwo znwb kkzt tvsl';
    
    if (!fromEmail || !fromPass) {
        console.warn('⚠️  Email credentials not set. Skipping notification.');
        return;
    }
    try {
        await transporter.sendMail({
            from: `"ELMS Notification" <${fromEmail}>`,
            to,
            subject,
            html: htmlContent
        });
        console.log(`📧 Email sent successfully to: ${to}`);
    } catch (err) {
        console.error('❌ Email sending failed (Offline?):', err.message);
        // Save to Queue if failure seems network related
        try {
            await new PendingEmail({ to, subject, html: htmlContent }).save();
            console.log('📝 Email added to offline queue.');
        } catch (dbErr) {
            console.error('❌ Failed to queue email:', dbErr.message);
        }
    }
}

// Background Worker: Retry Pending Emails every 30 seconds
setInterval(async () => {
    try {
        const pending = await PendingEmail.find({});
        if (pending.length === 0) return;

        console.log(`🔄 Retrying ${pending.length} queued emails...`);
        for (const mail of pending) {
            try {
                await transporter.sendMail({
                    from: `"ELMS Notification" <${process.env.EMAIL_USER || 'mahek.bhavsar29@gmail.com'}>`,
                    to: mail.to,
                    subject: mail.subject,
                    html: mail.html
                });
                await PendingEmail.findByIdAndDelete(mail._id);
                console.log(`✅ Queued email sent to: ${mail.to}`);
            } catch (err) {
                // Still offline or other error
                await PendingEmail.findByIdAndUpdate(mail._id, { 
                    $inc: { attempts: 1 }, 
                    lastAttempt: new Date() 
                });
            }
        }
    } catch (err) {
        // DB error or similar
    }
}, 30000);

// Helper to generate a styled HTML email template
function generateEmailTemplate(headerTitle, message, detailsHtml, color = '#1e3c72') {
    return `
    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7f9; padding: 20px; color: #333;">
        <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
            <div style="background: ${color}; padding: 30px; text-align: center; color: white;">
                <h1 style="margin: 0; font-size: 24px; letter-spacing: 1px;">ELMS</h1>
                <p style="margin: 5px 0 0; opacity: 0.8; font-size: 14px;">${headerTitle}</p>
            </div>
            <div style="padding: 30px; line-height: 1.6;">
                <div style="margin-bottom: 25px;">${message}</div>
                <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; border-left: 4px solid ${color};">
                    <h4 style="margin-top: 0; color: ${color}; text-transform: uppercase; font-size: 13px; letter-spacing: 0.5px;">Application Details</h4>
                    <div style="font-size: 14px;">${detailsHtml}</div>
                </div>
                <p style="margin-top: 30px; font-size: 13px; color: #777; text-align: center;">
                    This is an automated notification from the Employee Leave Management System.
                </p>
            </div>
            <div style="background: #eee; padding: 15px; text-align: center; font-size: 12px; color: #888;">
                &copy; 2026 Employee Leave Management System
            </div>
        </div>
    </div>`;
}

// --- File Storage Setup ---
const uploadDir = path.join(_dirname, 'uploads');
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir, { recursive: true }); }
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- Smart Dual Database Connection ---
// Priority: Atlas (cloud) first → Local MongoDB fallback
const ATLAS_URI  = process.env.MONGO_ATLAS_URI  || '';
const LOCAL_URI  = process.env.MONGO_LOCAL_URI  || 'mongodb://127.0.0.1:27017/employeeDB';

let dbMode = 'none'; // will be 'atlas' or 'local'

// Expose which DB is active via API
app.get('/api/db-status', (req, res) => {
    res.json({ mode: dbMode, connected: mongoose.connection.readyState === 1 });
});

async function connectDB() {
    // 1. Try Atlas first (only if URI configured)
    if (ATLAS_URI) {
        try {
            await mongoose.connect(ATLAS_URI, { serverSelectionTimeoutMS: 2000 });
            dbMode = 'atlas';
            console.log('🌐 CLOUD ACTIVE: Connected to MongoDB Atlas');
            return;
        } catch (err) {
            console.log('🔌 OFFLINE MODE: Cloud unavailable. Switching to local...');
        }
    }

    // 2. Fallback to Local MongoDB
    try {
        await mongoose.connect(LOCAL_URI, { serverSelectionTimeoutMS: 2000 });
        dbMode = 'local';
        console.log('🏠 LOCAL ACTIVE: Connected to Local Database');
    } catch (err) {
        console.error('❌ DATABASE ERROR: Local MongoDB is not running.');
    }
}

connectDB();

// --- Schemas ---

// 1. Session Settings
// Update your Session Schema to include timestamps
const sessionSchema = new mongoose.Schema({
    sessionName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true }
}, { timestamps: true }); // <--- CRITICAL: Adds createdAt and updatedAt automatically

const Session = mongoose.models.Session || mongoose.model('Session', sessionSchema, 'active_sessions');
// Update the GET route to fetch the LATEST updated session

// 2. Users
const userSchema = new mongoose.Schema({
    "sr_no": String, // Added to support real serial numbers
    "Employee Code": Number,
    "Name": String,
    "Email": { type: String, required: true },
    "Password": { type: Number, required: true },
    "role": String,
    "department": String,
    "dept_code": Number,
    "managed_depts": String,
    "staffType": { type: String, default: 'Teaching' }
}, { collection: 'users', versionKey: false });
const User = mongoose.models.User || mongoose.model('User', userSchema);

// 3. Leave Types (Integrated Session-Wise Logic)
const leaveTypeSchema = new mongoose.Schema({
    leave_name: String,
    total_yearly_limit: Number,
    dept_code: Number,
    staffType: String,
    can_carry_forward: { type: Boolean, default: false },
    sessionName: String // Links quota to a specific year
}, { collection: 'leave_types', versionKey: false });
const LeaveType = mongoose.models.LeaveType || mongoose.model('LeaveType', leaveTypeSchema);

// 4. Leave Applications
// 4. Leave Applications
const leaveSchema = new mongoose.Schema({
    sr_no: mongoose.Schema.Types.Mixed,
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
const Leave = mongoose.models.Leave || mongoose.model('Leave', leaveSchema);

// 5. Balance Adjustments (Manual edits by Admin)
const balanceAdjustmentSchema = new mongoose.Schema({
    empCode: Number,
    leaveType: String,
    sessionName: String,
    adjustmentValue: Number, // The value the admin manually SETS as remaining
    updatedAt: { type: Date, default: Date.now }
}, { collection: 'balance_adjustments', versionKey: false });
const BalanceAdjustment = mongoose.models.BalanceAdjustment || mongoose.model('BalanceAdjustment', balanceAdjustmentSchema);

// 6. Pending Emails (Offline Queue)
const pendingEmailSchema = new mongoose.Schema({
    to: String,
    subject: String,
    html: String,
    attempts: { type: Number, default: 0 },
    lastAttempt: { type: Date, default: Date.now }
}, { timestamps: true });
const PendingEmail = mongoose.models.PendingEmail || mongoose.model('PendingEmail', pendingEmailSchema, 'pending_emails');

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

    // 1. Fetch User with .lean() to access non-schema fields like "Department Code" safely
    const emp = await User.findOne({ "Employee Code": employeeCode }).lean();
    if (!emp) return { balance: 0, error: "User not found" };
    
    // Safely parse department fields
    const userDept = String(emp.dept_code ?? emp["Dept_Code"] ?? emp["Department Code"] ?? '');
    const userStaffType = String(emp.staffType || emp["Staff Type"] || 'Teaching').toLowerCase().trim();

    // 2. Fetch Rules
    const allRulesForType = await LeaveType.find({ leave_name: leaveTypeUpper }).lean();
    
    const userRules = allRulesForType.filter(r => 
        (String(r.dept_code) === userDept || String(r.dept_code) === '0' || !r.dept_code)
    );

    // Filter matching dept and session 
    const applicableRules = userRules.filter(r => r.sessionName === currentSessionName);

    let currentRule = null;
    if (applicableRules.length > 0) {
        // Favor perfect staffType match, fallback to 'All'
        const perfectMatch = applicableRules.find(r => String(r.staffType || 'All').toLowerCase().trim() === userStaffType);
        if (perfectMatch) {
            currentRule = perfectMatch;
        } else {
            const genericMatch = applicableRules.find(r => String(r.staffType || 'All').toLowerCase().trim() === 'all');
            currentRule = genericMatch || null;
        }
    }

    let isEligible = true;

    if (!currentRule) {
        // If other departments or staffTypes have a rule for this session, but this user doesn't,
        // it means this person is NOT ELIGIBLE for this leave.
        const ruleExistsForOthers = allRulesForType.some(r => r.sessionName === currentSessionName);
        if (ruleExistsForOthers) {
            isEligible = false;
        } else {
            // Unconfigured system fallback
            currentRule = {
                leave_name: leaveTypeUpper,
                total_yearly_limit: (['AL', 'VAL', 'DL'].includes(leaveTypeUpper)) ? 0 : 12,
                can_carry_forward: (leaveTypeUpper === 'SL' || leaveTypeUpper === 'EL'),
                sessionName: currentSessionName
            };
        }
    }

    if (!isEligible) {
        return {
            balance: '-',
            isIncrementing: false,
            sessionName: currentSessionName,
            limit: '-',
            carryForward: 0,
            currentLimit: 0,
            usedThisYear: '-',
            isManuallyAdjusted: false,
            isEligible: false
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

// NEW: Bulk Balance Calculation for high-performance reporting
app.get('/api/leaves/balances/bulk', async (req, res) => {
    try {
        const { sessionName: querySession } = req.query;
        let sessionName = querySession;
        if (!sessionName) {
            const activeSession = await Session.findOne().sort({ updatedAt: -1 });
            sessionName = activeSession?.sessionName || "Not Set";
        }

        const users = await User.find({}).lean();
        const leaveTypes = await LeaveType.distinct("leave_name", { sessionName });
        
        // Use Promise.all to compute all in parallel on the server
        const summary = await Promise.all(users.map(async (user) => {
            const empCode = user["Employee Code"];
            if (!empCode) return null;

            const balances = await Promise.all(leaveTypes.map(async (type) => {
                const result = await calculateUserBalance(empCode, type, sessionName);
                return {
                    leave: type,
                    balance: result.balance,
                    used: result.usedThisYear,
                    limit: result.limit,
                    isIncrementing: result.isIncrementing,
                    isManuallyAdjusted: result.isManuallyAdjusted,
                    isEligible: result.isEligible
                };
            }));

            return {
                name: user.Name,
                empCode: empCode,
                sr_no: user.sr_no || user.Sr || user.sr || user.SR || user.srno, // Support all variants
                dept: user.dept_code,
                deptName: user.department,
                balances: balances
            };
        }));

        res.json(summary.filter(s => s !== null));
    } catch (err) {
        console.error("Bulk Balance Error:", err);
        res.status(500).json({ error: "Bulk calculation failed" });
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
function parseDateLocal(dateRaw) {
    if (!dateRaw) return new Date(0);
    if (dateRaw instanceof Date) return dateRaw;
    
    // Convert to string safely to avoid 'includes is not a function' if MongoDB returns a non-string somehow
    const dateStr = String(dateRaw);
    
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
                // --- IDEMPOTENCY FIX ---
                // If it's the exact same leave type, start date, end date, and sr_no, this means the offline sync 
                // is trying to push a record that already successfully saved previously (but the client missed the 200 OK).
                // Just silently return success so the client deletes it from the queue without an overlapping error!
                const existingType = String(leave["Type of Leave"] || leave.Type_of_Leave).toUpperCase();
                const incomingType = String(Type_of_Leave).toUpperCase();
                
                if (existingType === incomingType && 
                    existStart.getTime() === newStart.getTime() && 
                    existEnd.getTime() === newEnd.getTime() &&
                    String(leave.sr_no) === String(sr_no)) {
                    
                    return res.json({ 
                        success: true, 
                        data: leave, 
                        message: "Duplicate offline sync ignored securely." 
                    });
                }

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
        
        // Prevent Mongoose CastError on NaN fields
        const empCodeNum = Number(Emp_CODE);
        const deptCodeNum = Number(Dept_Code);
        const totalDaysNum = Number(Total_Days);

        if (isNaN(empCodeNum) || isNaN(totalDaysNum)) {
            return res.status(400).json({ success: false, error: "Invalid Employee Code or Total Days." });
        }

        const newLeave = new Leave({
            sr_no: (!isNaN(Number(sr_no)) && String(sr_no).trim() !== '') ? Number(sr_no) : sr_no,
            Emp_CODE: empCodeNum,
            Name: Name,
            Dept_Code: isNaN(deptCodeNum) ? null : deptCodeNum,
            "Type of Leave": Type_of_Leave ? String(Type_of_Leave).toUpperCase() : "UNKNOWN",
            From: From || "",
            To: To || "",
            "Total Days": totalDaysNum,
            sessionName: activeSession?.sessionName || "2025-26",
            document: req.file ? req.file.filename : null,
            Status: req.body.Applied_By_Admin === 'true' ? 'Approved' : 'Pending',
            Reason: Reason || "",
            VAL_working_dates: Type_of_Leave?.toUpperCase() === 'VAL' ? VAL_working_dates?.trim() : undefined
        });

        await newLeave.save();
        res.json({ success: true, data: newLeave });

        // --- Post-Save Email Notifications ---
        try {
            // Find employee email from User model
            const userObj = await User.findOne({ "Employee Code": empCodeNum }).lean();
            const userEmail = userObj?.Email || '';
            const isAdminSubmission = req.body.Applied_By_Admin === 'true';
            const finalStatus = isAdminSubmission ? 'Approved' : 'Pending';
            
            const color = isAdminSubmission ? '#2ecc71' : '#1e3c72'; 

            const details = `
                <p><b>Type of Leave:</b> ${Type_of_Leave}</p>
                <p><b>From - To:</b> ${From} to ${To}</p>
                <p><b>Total Days:</b> ${Total_Days}</p>
                <p><b>Reason:</b> ${Reason || 'N/A'}</p>
                <p><b>Submission:</b> ${isAdminSubmission ? 'Admin Direct Entry' : 'Manual Submission'}</p>
            `;

            // 1. Email to Staff (Confirmation)
            if (userEmail) {
                const message = isAdminSubmission 
                    ? `<p>Hello <b>${Name}</b>,</p><p>Your leave has been <b>Directly Approved</b> by the Administrator. Your records have been updated automatically.</p>`
                    : `<p>Hello <b>${Name}</b>,</p><p>Your leave application has been submitted successfully and is currently <b>Pending</b> review.</p>`;

                await sendEmailNotification(
                    userEmail,
                    `Leave Application Update (${Type_of_Leave}) - ${finalStatus}`,
                    generateEmailTemplate(`Status Update: ${finalStatus}`, message, details, color)
                );
            }

            // 2. Email to Admin (Notification) - ONLY if NOT applied by Admin ourselves
            if (!isAdminSubmission) {
                const adminUsers = await User.find({ role: 'Admin' }).lean();
                const adminEmails = adminUsers.map(u => u.Email).filter(e => e);
                if (adminEmails.length > 0) {
                    const adminMsg = `<p>A new leave application from <b>${Name}</b> requires your review.</p>`;
                    await sendEmailNotification(
                        adminEmails.join(','),
                        `Action Required: ${Name} (${Type_of_Leave})`,
                        generateEmailTemplate("New Application Pending", adminMsg, details, '#f39c12')
                    );
                }
            }
        } catch (mailErr) {
            console.warn('⚠️  Could not send email:', mailErr.message);
        }

    } catch (err) { 
        console.error("=== APPLY LEAVE ERROR 500 ===", err);
        res.status(500).json({ success: false, error: err.message || "Submission failed" }); 
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

    // --- Post-Process Email Notifications ---
    try {
        if (updated) {
            const userObj = await User.findOne({ "Employee Code": updated.Emp_CODE }).lean();
            const userEmail = userObj?.Email || '';
            const staffName = userObj?.Name || 'Staff';

            const color = status === 'Approved' || status === 'Final Approved' || status === 'Staff Approved' ? '#2ecc71' : 
                          status === 'HOD Approved' ? '#3498db' : '#e74c3c';

            const details = `
                <p><b>Type of Leave:</b> ${updated["Type of Leave"]}</p>
                <p><b>From - To:</b> ${updated.From} to ${updated.To}</p>
                <p><b>Total Days:</b> ${updated["Total Days"]}</p>
                <p><b>Current Status:</b> <b>${status}</b></p>
                ${reason ? `<p><b>Admin Remark:</b> ${reason}</p>` : ''}
            `;

            if (userEmail) {
                let message = '';
                if (status === 'Approved' || status === 'Final Approved' || status === 'Staff Approved') {
                    message = `<p>Congratulations <b>${staffName}</b>!</p><p>Your leave application has been <b>Final Approved</b>. Your balance has been updated in the system.</p>`;
                } else if (status === 'HOD Approved') {
                    message = `<p>Hello <b>${staffName}</b>,</p><p>Good news! Your leave request has been <b>HOD Approved</b> and is now pending final review by the Administrator.</p>`;
                } else if (status === 'Rejected' || status === 'Rejected by HOD') {
                    message = `<p>Hello <b>${staffName}</b>,</p><p>We regret to inform you that your leave application has been <b>Rejected</b>.</p>`;
                } else {
                    message = `<p>Hello <b>${staffName}</b>,</p><p>The status of your leave application has been updated to: <b>${status}</b>.</p>`;
                }

                await sendEmailNotification(
                    userEmail,
                    `Leave Application Outcome: ${status}`,
                    generateEmailTemplate(`Decision: ${status}`, message, details, color)
                );

                // EXTRA: If HOD approves, notify Admin for final step
                if (status === 'HOD Approved') {
                    const adminUsers = await User.find({ role: 'Admin' }).lean();
                    const adminEmails = adminUsers.map(u => u.Email).filter(e => e);
                    if (adminEmails.length > 0) {
                        const adminMsg = `<p><b>${staffName}</b>'s leave application has been HOD Approved and is waiting for your final decision.</p>`;
                        await sendEmailNotification(
                            adminEmails.join(','),
                            `Final Action Needed: ${staffName} (HOD Approved)`,
                            generateEmailTemplate("Final Approval Pending", adminMsg, details, '#3498db')
                        );
                    }
                }
            }
        }
    } catch (mailErr) {
        console.warn('⚠️  Status Email failed:', mailErr.message);
    }
});

// Update Leave Details (From, To, Type, Days, Status)
app.put('/api/leaves/:id', async (req, res) => {
    try {
        const updateDataRaw = req.body;
        const updateData = {};
        
        if (updateDataRaw.From) updateData.From = updateDataRaw.From;
        if (updateDataRaw.To) updateData.To = updateDataRaw.To;
        
        const type = updateDataRaw["Type of Leave"] || updateDataRaw.Type_of_Leave || updateDataRaw.type;
        if (type) {
            updateData["Type of Leave"] = type;
            updateData["Type_of_Leave"] = type;
        }

        const days = updateDataRaw["Total Days"] || updateDataRaw.Total_Days || updateDataRaw.days;
        if (days !== undefined) {
            updateData["Total Days"] = Number(days);
            updateData["Total_Days"] = Number(days);
        }

        if (updateDataRaw.Status) updateData.Status = updateDataRaw.Status;
        if (updateDataRaw.Reason) updateData.Reason = updateDataRaw.Reason;

        const updated = await Leave.findByIdAndUpdate(req.params.id, updateData, { new: true });
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error("Update Leave Error:", err);
        res.status(500).json({ success: false, error: err.message });
    }
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

                if (result.isEligible === false) {
                    await BalanceAdjustment.deleteMany(query);
                    continue; // Skip inserting NaN rules
                }

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


// Check if a SR No already exists in any leave record
app.get('/api/leaves/check-sr-no/:srNo', async (req, res) => {
    try {
        const srNo = String(req.params.srNo).trim();
        const existing = await Leave.findOne({ sr_no: srNo }).lean();
        res.json({ exists: !!existing });
    } catch (err) {
        res.json({ exists: false });
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
app.post('/api/login', async (req, res) => {
    try {
        const password = Number(req.body.password);
        if (isNaN(password)) return res.status(401).json({ success: false, error: "Invalid password format" });
        
        const user = await User.findOne({ "Email": req.body.email, "Password": password }).lean();
        if (user) {
            res.json({
                success: true, name: user["Name"], empCode: user["Employee Code"],
                role: user["role"] || user["Role"], 
                dept: user["department"] || user["Department"], 
                dept_code: user["dept_code"] ?? user["Dept_Code"] ?? user["Department Code"],
                managed_depts: user["managed_depts"],
                staffType: user["staffType"] || user["Staff Type"] || 'Teaching'
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
    try {
        let empCode;
        if (req.body["Employee Code"]) {
            empCode = Number(req.body["Employee Code"]);
        } else {
            const latest = await User.findOne().sort({ "Employee Code": -1 });
            empCode = latest ? latest["Employee Code"] + 1 : 101;
        }
        
        // Ensure a default password if not provided (Schema requires Password as Number)
        const password = req.body.Password || 1234;

        const newUser = new User({ 
            ...req.body, 
            "Employee Code": empCode,
            "Password": Number(password)
        });
        
        await newUser.save();
        res.json(newUser);
    } catch (err) {
        console.error("❌ Staff Creation Error:", err);
        res.status(500).json({ error: "Creation failed", details: err.message });
    }
});

app.put('/api/staff/:id', async (req, res) => {
    try {
        const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updated);
    } catch (err) {
        console.error("❌ Staff Update Error:", err);
        res.status(500).json({ error: "Update failed", details: err.message });
    }
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
        const user = await User.findOne({ "Employee Code": empCode }).lean();
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
                name: user.Name || user.name,
                empCode: user["Employee Code"] || user.empCode,
                role: user.role || user.Role,
                dept_code: user.dept_code ?? user["Dept_Code"] ?? user["Department Code"],
                managed_depts: user.managed_depts || "",
                department: user.department || user.Department,
                staffType: user.staffType || user["Staff Type"]
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
app.get('/api/admin/clean-srnos', async (req, res) => {
    try {
        const leaves = await Leave.find({});
        let updatedCount = 0;
        
        for (let l of leaves) {
            let documentNeedsUpdate = false;
            let newSrNo = null;

            if (l.sr_no && typeof l.sr_no === 'string') {
                const num = Number(l.sr_no.trim());
                if (!isNaN(num) && l.sr_no.trim() !== '') {
                    newSrNo = num;
                    documentNeedsUpdate = true;
                }
            }

            if (!documentNeedsUpdate && l['Sr No']) {
                const num2 = Number(String(l['Sr No']).trim());
                if (!isNaN(num2) && String(l['Sr No']).trim() !== '') {
                   newSrNo = num2;
                   documentNeedsUpdate = true;
                }
            }

            if (documentNeedsUpdate && newSrNo !== null) {
                await Leave.updateOne(
                    { _id: l._id }, 
                    { 
                        $set: { sr_no: newSrNo },
                        $unset: { 'Sr No': "", 'srNo': "", 'SrNo': "", 'SR_NO': "" } 
                    }
                );
                updatedCount++;
            }
        }
        res.json({ success: true, updatedCount, message: `Successfully converted ${updatedCount} sr_no values to clean numbers.` });
    } catch (err) {
        res.status(500).json({ error: "Migration failed", details: err.message });
    }
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;