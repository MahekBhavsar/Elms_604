const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
// --- 1. Robust Environment Loading (.env) ---
const possibleEnvPaths = [
    path.resolve(__dirname, '../../.env'), // Dev (src/backend/server.js)
    path.resolve(__dirname, '../.env'),    // Build (dist/backend/server.js)
    path.resolve(process.cwd(), '.env'),   // Execution root
    path.resolve(__dirname, '.env')        // Same directory
];

let envLoaded = false;
for (const p of possibleEnvPaths) {
    if (fs.existsSync(p)) {
        require('dotenv').config({ path: p });
        console.log('✅ Environment (.env) loaded from:', p);
        envLoaded = true;
        break;
    }
}

if (!envLoaded) {
    console.warn('⚠️  Warning: No .env file found. Using default/system environment variables.');
}
const nodemailer = require('nodemailer'); 

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
const ATLAS_URI  = process.env.MONGO_ATLAS_URI  || 'mongodb+srv://mahekbhavsar29_db_user:Hopeu33dSs0e6zUH@cluster0.0xfniym.mongodb.net/employeeDB?retryWrites=true&w=majority&appName=Cluster0';
const LOCAL_URI  = process.env.MONGO_LOCAL_URI  || 'mongodb://127.0.0.1:27017/employeeDB';

// Initialize connections
const localDB = mongoose.createConnection(LOCAL_URI, { serverSelectionTimeoutMS: 2000 });
const atlasDB = ATLAS_URI ? mongoose.createConnection(ATLAS_URI, { serverSelectionTimeoutMS: 5000 }) : null;

localDB.on('connected', () => console.log('🏠 LOCAL ACTIVE: Connected to Local Database'));
localDB.on('error', (err) => console.error('❌ DATABASE ERROR: Local MongoDB is not running:', err.message));

if (atlasDB) {
    atlasDB.on('connected', () => console.log('🌐 CLOUD ACTIVE: Connected to MongoDB Atlas'));
    atlasDB.on('error', (err) => {
        console.error('❌ ATLAS CONNECTION ERROR:', err.message);
        console.log('🔌 OFFLINE MODE: Background sync will retry automatically.');
    });
}

// --- Dual-Sync Helper Functions ---

/**
 * Picks the most available model: Local if connected, otherwise Atlas.
 */
function getSmartModel(local, atlas) {
    if (localDB.readyState === 1) return local;
    if (atlas && atlasDB && atlasDB.readyState === 1) return atlas;
    return local; 
}

/**
 * Performs a robust fetch: Uses Local if available and NOT empty.
 * Fallbacks to Atlas if Local is missing OR empty (new installations).
 */
async function fetchSmart(localModel, atlasModel, query = {}, sort = {}, autoSeed = false) {
    try {
        // 1. Try Local First
        if (localDB.readyState === 1) {
            const localResults = await localModel.find(query).sort(sort).lean();
            if (localResults && (Array.isArray(localResults) ? localResults.length > 0 : true)) {
                return localResults;
            }
        }
        
        // 2. Fallback to Atlas if local is empty/disconnected
        if (atlasDB && atlasDB.readyState === 1) {
            console.log(`📡 [SmartFetch] Falling back to Atlas for ${localModel.modelName}...`);
            const cloudResults = await atlasModel.find(query).sort(sort).lean();
            
            // 3. Auto-Seed locally if requested and data found
            if (autoSeed && cloudResults && cloudResults.length > 0 && localDB.readyState === 1) {
                console.log(`🌱 [Seed] Bootstrapping local ${localModel.modelName} from Cloud...`);
                // Batch insert to local
                try {
                    // For single objects (like findOne result wrapped in array), use save
                    // For arrays, use insertMany but be careful with existing IDs
                    for (const doc of cloudResults) {
                        try {
                            const seedDoc = { ...doc, atlasSynced: true };
                            await localModel.replaceOne({ _id: doc._id }, seedDoc, { upsert: true });
                        } catch (e) {}
                    }
                } catch (seedErr) { console.warn("Seed failed:", seedErr.message); }
            }

            return cloudResults;
        }

        return [];
    } catch (err) {
        console.error(`❌ SmartFetch Error for ${localModel.modelName}:`, err.message);
        return [];
    }
}


// --- Dual-Sync Helper Functions ---

/**
 * Synchronizes a document to Atlas. 
 * Used both during initial save and by the background worker.
 */
async function syncToAtlas(localDoc, atlasModel) {
    if (!atlasModel || atlasDB.readyState !== 1) return false;
    try {
        const data = localDoc.toObject();
        data.atlasSynced = true;
        // Use replaceOne with upsert to ensure we create or fully update the cloud copy
        await atlasModel.replaceOne({ _id: localDoc._id }, data, { upsert: true });
        return true;
    } catch (err) {
        console.error(`❌ Sync failed for ${localDoc._id}:`, err.message);
        return false;
    }
}

/**
 * Performs a dual write (CREATE or REPLACEMENT): Always to localDB, then tries Atlas.
 * This ensures data exists in both places.
 */
async function performDualWrite(localModel, atlasModel, data, query = null) {
    let localDoc;
    // For new records or strict replacements, we ensure atlasSynced is false initially
    const writeData = { ...data, atlasSynced: false };

    if (query) {
        localDoc = await localModel.findOneAndUpdate(query, writeData, { upsert: true, new: true });
    } else {
        localDoc = await new localModel(writeData).save();
    }

    // Try immediate sync
    console.log(`📡 [Sync] Attempting immediate cloud push for ${localModel.modelName}...`);
    const synced = await syncToAtlas(localDoc, atlasModel);
    if (synced) {
        await localModel.findByIdAndUpdate(localDoc._id, { atlasSynced: true });
        console.log(`✅ [Sync] Successfully pushed to Cloud.`);
    } else {
        console.log('📝 [Sync] Saved Locally Only. Queued for background worker.');
    }

    return localDoc;
}

/**
 * Performs a dual update (PATCH): Updates local record and resets sync flag.
 * Ensures the background worker will pick it up if immediate sync fails.
 */
async function performDualUpdate(localModel, atlasModel, id, updateData) {
    // 1. Update Local and RESET atlasSynced to false
    const updatedLocal = await localModel.findByIdAndUpdate(
        id, 
        { ...updateData, atlasSynced: false }, 
        { new: true }
    );

    if (!updatedLocal) return null;

    // 2. Try immediate sync
    const synced = await syncToAtlas(updatedLocal, atlasModel);
    if (synced) {
        await localModel.findByIdAndUpdate(updatedLocal._id, { atlasSynced: true });
        console.log(`✅ [Sync] Update pushed to Cloud successfully.`);
    } else {
        console.log(`📝 [Sync] Update saved locally. Background sync pending.`);
    }

    return updatedLocal;
}

/**
 * Pushes unsynced local records to MongoDB Atlas.
 */
async function runSyncWorker() {
    if (!atlasDB || atlasDB.readyState !== 1 || localDB.readyState !== 1) return;

    const models = [
        { local: Session, atlas: AtlasSession, name: 'Sessions' },
        { local: User, atlas: AtlasUser, name: 'Users' },
        { local: LeaveType, atlas: AtlasLeaveType, name: 'LeaveTypes' },
        { local: Leave, atlas: AtlasLeave, name: 'Leaves' },
        { local: BalanceAdjustment, atlas: AtlasBalanceAdjustment, name: 'BalanceAdjustments' },
        { local: Policy, atlas: AtlasPolicy, name: 'Policies' }
    ];

    for (const m of models) {
        try {
            if (!m.atlas) continue;
            const unsyncedDocs = await m.local.find({ atlasSynced: { $ne: true } }).limit(20);
            if (unsyncedDocs.length > 0) {
                console.log(`🔄 [Sync] Pushing ${unsyncedDocs.length} ${m.name} to Cloud...`);
                for (const doc of unsyncedDocs) {
                    const success = await syncToAtlas(doc, m.atlas);
                    if (success) {
                        await m.local.findByIdAndUpdate(doc._id, { atlasSynced: true });
                    }
                }
            }
        } catch (err) {
            console.error(`❌ Push sync failed for ${m.name}:`, err.message);
        }
    }
}

// --- Global Sync Controls ---
let isReconciling = false;

/**
 * Reconciliation: Pulls missing or updated records from Atlas to Local.
 * This ensures 100% parity across all devices.
 */
async function reconcileCloudToLocal() {
    if (!atlasDB || atlasDB.readyState !== 1 || localDB.readyState !== 1) return;
    
    if (isReconciling) {
        console.log('⏳ [Reconcile] Already in progress, skipping loop...');
        return;
    }

    const models = [
        { local: Session, atlas: AtlasSession, name: 'Sessions' },
        { local: User, atlas: AtlasUser, name: 'Users' },
        { local: LeaveType, atlas: AtlasLeaveType, name: 'LeaveTypes' },
        { local: Leave, atlas: AtlasLeave, name: 'Leaves' },
        { local: Policy, atlas: AtlasPolicy, name: 'Policies' }
    ];

    isReconciling = true;
    console.log('🔄 [Reconcile] Starting deep cloud parity check...');
    
    try {
        for (const m of models) {
            if (!m.atlas) continue;

            const cloudCount = await m.atlas.countDocuments();
            if (cloudCount === 0) continue;

            // Fetch the 1000 most recently updated docs
            const cloudDocs = await m.atlas.find({}).sort({ updatedAt: -1 }).limit(1000).lean();
            
            // Prepare Bulk Operations for Atomicity (Collision-Proof)
            const bulkOps = cloudDocs.map(cDoc => ({
                replaceOne: {
                    filter: { _id: cDoc._id },
                    replacement: { ...cDoc, atlasSynced: true },
                    upsert: true
                }
            }));

            if (bulkOps.length > 0) {
                const result = await m.local.bulkWrite(bulkOps, { ordered: false });
                const changed = (result.upsertedCount || 0) + (result.modifiedCount || 0);
                if (changed > 0) {
                    console.log(`📥 [Reconcile] ${m.name}: Recovered/Updated ${changed} records from Cloud.`);
                }
            }
        }
    } catch (err) {
        console.error(`❌ Reconciliation failed:`, err.message);
    } finally {
        isReconciling = false;
    }
}

// --- Background Sync Worker ---
// Runs push/pull cycles to ensure total consistency
setInterval(async () => {
    await runSyncWorker();
    await reconcileCloudToLocal();
}, 120000); 

// Trigger initial sync 5 seconds after startup to clear any offline backlog
setTimeout(async () => {
    console.log('🚀 [Sync] Initializing startup synchronization...');
    await runSyncWorker();
    await reconcileCloudToLocal(); // ALSO reconcile on startup!
}, 5000);

// --- Schemas ---

// 1. Session Settings
// Update your Session Schema to include timestamps
const sessionSchema = new mongoose.Schema({
    sessionName: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    atlasSynced: { type: Boolean, default: false } // NEW: Sync tracking
}, { timestamps: true });

const Session = localDB.model('Session', sessionSchema, 'active_sessions');
const AtlasSession = atlasDB ? atlasDB.model('Session', sessionSchema, 'active_sessions') : null;
// Update the GET route to fetch the LATEST updated session

// 2. Users
const userSchema = new mongoose.Schema({
    "sr_no": Number,
    "Employee Code": Number,
    "Name": String,
    "Email": { type: String, required: true },
    "Password": { type: Number, required: true },
    "role": String,
    "department": String,
    "dept_code": Number,
    "managed_depts": String,
    "staffType": { type: String, default: 'Teaching' },
    atlasSynced: { type: Boolean, default: false }
}, { collection: 'users', versionKey: false, timestamps: true });

const User = localDB.model('User', userSchema);
const AtlasUser = atlasDB ? atlasDB.model('User', userSchema) : null;

// 3. Leave Types (Integrated Session-Wise Logic)
const leaveTypeSchema = new mongoose.Schema({
    leave_name: String,
    total_yearly_limit: Number,
    dept_code: Number,
    staffType: String,
    can_carry_forward: { type: Boolean, default: false },
    sessionName: String,
    atlasSynced: { type: Boolean, default: false }
}, { collection: 'leave_types', versionKey: false, timestamps: true });

const LeaveType = localDB.model('LeaveType', leaveTypeSchema);
const AtlasLeaveType = atlasDB ? atlasDB.model('LeaveType', leaveTypeSchema) : null;

// 4. Leave Applications
const leaveSchema = new mongoose.Schema({
    sr_no: Number,
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
    VAL_working_dates: String,
    atlasSynced: { type: Boolean, default: false }
}, { collection: 'leave_applications', versionKey: false, timestamps: true });

const Leave = localDB.model('Leave', leaveSchema);
const AtlasLeave = atlasDB ? atlasDB.model('Leave', leaveSchema) : null;

// 5. Balance Adjustments (Manual edits by Admin)
const balanceAdjustmentSchema = new mongoose.Schema({
    empCode: Number,
    leaveType: String,
    sessionName: String,
    adjustmentValue: Number,
    updatedAt: { type: Date, default: Date.now },
    atlasSynced: { type: Boolean, default: false }
}, { collection: 'balance_adjustments', versionKey: false });

const BalanceAdjustment = localDB.model('BalanceAdjustment', balanceAdjustmentSchema);
const AtlasBalanceAdjustment = atlasDB ? atlasDB.model('BalanceAdjustment', balanceAdjustmentSchema) : null;

// 6. Pending Emails (Offline Queue) - Keep local only for email reliability
const pendingEmailSchema = new mongoose.Schema({
    to: String,
    subject: String,
    html: String,
    attempts: { type: Number, default: 0 },
    lastAttempt: { type: Date, default: Date.now }
}, { timestamps: true });
const PendingEmail = localDB.model('PendingEmail', pendingEmailSchema, 'pending_emails');

// 7. Policies
const policySchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: String,
    content: String,
    category: { type: String, default: 'General' },
    status: { type: String, enum: ['Draft', 'Published'], default: 'Draft' },
    createdBy: String,
    publishedAt: Date,
    atlasSynced: { type: Boolean, default: false }
}, { timestamps: true });

const Policy = localDB.model('Policy', policySchema);
const AtlasPolicy = atlasDB ? atlasDB.model('Policy', policySchema) : null;

// 1. ADMIN SESSION CONTROL
app.post('/api/admin/set-session', async (req, res) => {
    try {
        const { sessionName, startDate, endDate } = req.body;

        // 1. Update/Create the session record in BOTH databases
        await performDualWrite(Session, AtlasSession, { sessionName, startDate, endDate }, {});

        // 2. AUTO-SEEDING LOGIC: If this session has no quotas, provide defaults
        const existingQuotaDocs = await fetchSmart(LeaveType, AtlasLeaveType, { sessionName });
        const existingQuotas = existingQuotaDocs.length;
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
        const sessions = await fetchSmart(Session, AtlasSession, {}, { sessionName: -1 });
        res.json(sessions);
    } catch (err) { res.status(500).json({ error: "Fetch sessions failed" }); }
});

// GET: The Single "Current" Active Session (Sorted by LATEST activity)
app.get('/api/active-session', async (req, res) => {
    try {
        const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 }, true); // Seed the session!
        const session = sessions.length > 0 ? sessions[0] : null;
        res.json(session || { sessionName: "Not Set", startDate: "", endDate: "" });
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.get('/api/sessions/list', async (req, res) => {
    try {
        const leaves = await fetchSmart(Leave, AtlasLeave);
        const historical = [...new Set(leaves.map(l => l.sessionName))];

        const dates = [...new Set(leaves.map(l => l.From))];
        const yearsFromDates = dates.map(d => {
            const date = new Date(d);
            if (isNaN(date.getTime())) return null;
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            return month <= 5 ? `${year - 1}-${year}` : `${year}-${year + 1}`;
        }).filter(y => y);

        const activeSessions = await fetchSmart(Session, AtlasSession);
        const active = activeSessions[0];

        let all = [...historical, ...yearsFromDates];
        if (active) all.push(active.sessionName);

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

    // Pick active models
    const userModel = getSmartModel(User, AtlasUser);
    const leaveTypeModel = getSmartModel(LeaveType, AtlasLeaveType);
    const leaveModel = getSmartModel(Leave, AtlasLeave);
    const baModel = getSmartModel(BalanceAdjustment, AtlasBalanceAdjustment);

    // 1. Fetch User
    const users = await fetchSmart(User, AtlasUser, { "Employee Code": employeeCode });
    const emp = users.length > 0 ? users[0] : null;
    if (!emp) return { balance: 0, error: "User not found" };
    
    // Safely parse department fields
    const userDept = String(emp.dept_code ?? emp["Dept_Code"] ?? emp["Department Code"] ?? '');
    const userStaffType = String(emp.staffType || emp["Staff Type"] || 'Teaching').toLowerCase().trim();

    // 2. Fetch Rules
    const allRulesForType = await fetchSmart(LeaveType, AtlasLeaveType, { leave_name: leaveTypeUpper });
    
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
    const queryLeaves = {
        Emp_CODE: employeeCode,
        sessionName: currentSessionName,
        Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] },
        $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
    };
    const leavesThisSession = await fetchSmart(Leave, AtlasLeave, queryLeaves);

    const usedThisYear = leavesThisSession.reduce((sum, l) => sum + (Number(l["Total Days"] || l.Total_Days) || 0), 0);

    // 5. Manual Adjustment Fetch
    const adjustments = await fetchSmart(BalanceAdjustment, AtlasBalanceAdjustment, {
        empCode: employeeCode,
        leaveType: leaveTypeUpper,
        sessionName: currentSessionName
    });
    const manualAdjustment = adjustments.length > 0 ? adjustments[0] : null;

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
                const pastAdjustments = await fetchSmart(BalanceAdjustment, AtlasBalanceAdjustment, {
                    empCode: employeeCode,
                    leaveType: leaveTypeUpper,
                    sessionName: pastRule.sessionName
                });
                const pastAdjustment = pastAdjustments.length > 0 ? pastAdjustments[0] : null;

                let carryAmount = 0;
                if (pastAdjustment) {
                    carryAmount = Number(pastAdjustment.adjustmentValue);
                } else {
                    const queryPastLeaves = {
                        Emp_CODE: employeeCode,
                        sessionName: pastRule.sessionName,
                        Status: { $in: ['Approved', 'Final Approved', 'HOD Approved'] },
                        $or: [{ "Type of Leave": leaveTypeUpper }, { "Type_of_Leave": leaveTypeUpper }]
                    };
                    const pastLeaves = await fetchSmart(Leave, AtlasLeave, queryPastLeaves);
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
            const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 });
            const activeSession = sessions[0];
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
        const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 });
        const activeSession = sessions[0];
        const sessionName = querySession || activeSession?.sessionName || "Not Set";

        const users = await fetchSmart(User, AtlasUser);
        const allLeaveTypes = await fetchSmart(LeaveType, AtlasLeaveType, { sessionName });
        const leaveTypes = [...new Set(allLeaveTypes.map(t => t.leave_name))];
        
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
                sr_no: user.sr_no, // Strictly use the standardized field
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
        const existingLeaves = await fetchSmart(Leave, AtlasLeave, {
            Emp_CODE: Number(Emp_CODE),
            Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] }
        });

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

        // --- 2. SATURDAY LEAVE VALIDATION (Removed as per user request to allow SAT leave on any day) ---

        
        // --- 3. SL DOCUMENT VALIDATION ---
        if (Type_of_Leave?.toUpperCase() === 'SL' && Number(Total_Days) > 3 && !req.file) {
            return res.status(400).json({ 
                success: false, 
                error: "Medical document is required for Sick Leave exceeding 3 days." 
            });
        }

        const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 });
        const activeSession = sessions[0];
        
        // Prevent Mongoose CastError on NaN fields
        const empCodeNum = Number(Emp_CODE);
        const deptCodeNum = Number(Dept_Code);
        const totalDaysNum = Number(Total_Days);

        if (isNaN(empCodeNum) || isNaN(totalDaysNum)) {
            return res.status(400).json({ success: false, error: "Invalid Employee Code or Total Days." });
        }

        const savedLeave = await performDualWrite(Leave, AtlasLeave, {
            sr_no: Number(sr_no) || 0,
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

        res.json({ success: true, data: savedLeave });

        // --- Post-Save Email Notifications ---
        try {
            // Find employee email from User model
            const users = await fetchSmart(User, AtlasUser, { "Employee Code": empCodeNum });
            const userObj = users[0];
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
                const adminUsers = await fetchSmart(User, AtlasUser, { role: 'Admin' });
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

        const updatedType = await performDualWrite(LeaveType, AtlasLeaveType, { 
            total_yearly_limit: Number(total_yearly_limit), 
            can_carry_forward 
        }, query);

        res.json({ success: true, data: updatedType });
    } catch (err) { res.status(500).json({ success: false, error: "Database save failed" }); }
});

app.get('/api/leave-types', async (req, res) => { 
    const types = await fetchSmart(LeaveType, AtlasLeaveType);
    res.json(types); 
});

app.delete('/api/leave-types/:id', async (req, res) => {
    await LeaveType.findByIdAndDelete(req.params.id);
    if (AtlasLeaveType) {
        try { await AtlasLeaveType.findByIdAndDelete(req.params.id); } catch (e) {}
    }
    res.json({ success: true });
});

// 5. PROCESS DECISION
app.post('/api/leaves/process/:id', async (req, res) => {
    const { status, reason } = req.body;
    const updateData = { Status: status };
    if (status === 'Rejected' && reason) updateData.Reject_Reason = reason;
    const updated = await Leave.findByIdAndUpdate(req.params.id, updateData, { new: true });
    
    // Sync to Cloud
    if (updated) {
        await performDualUpdate(Leave, AtlasLeave, updated._id, updateData);
    }

    res.json({ success: true, data: updated });

    // --- Post-Process Email Notifications ---
    try {
        if (updated) {
            const users = await fetchSmart(User, AtlasUser, { "Employee Code": updated.Emp_CODE });
            const userObj = users[0];
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
                    const adminUsers = await fetchSmart(User, AtlasUser, { role: 'Admin' });
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

        const updated = await performDualUpdate(Leave, AtlasLeave, req.params.id, updateData);

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

        const updated = await performDualWrite(BalanceAdjustment, AtlasBalanceAdjustment, { 
            adjustmentValue: Number(adjustmentValue), 
            updatedAt: new Date() 
        }, query);
        
        res.json({ success: true, data: updated });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: "Adjustment failed" });
    }
});

// 6b. SYNC ALL BALANCES TO MONGODB (Force calculation and storage for all)
app.post('/api/admin/sync-all-balances', async (req, res) => {
    try {
        const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 });
        const activeSession = sessions[0];
        if (!activeSession) return res.status(400).json({ success: false, error: "No active session set." });

        const sessionName = activeSession.sessionName;
        const users = await fetchSmart(User, AtlasUser);
        const allLeaveTypes = await fetchSmart(LeaveType, AtlasLeaveType, { sessionName });
        const leaveTypes = [...new Set(allLeaveTypes.map(t => t.leave_name))];

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

                await performDualWrite(BalanceAdjustment, AtlasBalanceAdjustment, 
                    { adjustmentValue: Number(result.balance), updatedAt: new Date() }, 
                    query
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
        const srNo = Number(req.params.srNo);
        const existingLeaves = await fetchSmart(Leave, AtlasLeave, { sr_no: srNo });
        res.json({ exists: existingLeaves.length > 0 });
    } catch (err) {
        res.json({ exists: false });
    }
});

// Get next GLOBAL Sr. No (continuous across all staff — 1, 2, 3, ...)
app.get('/api/leaves/next-sr-no/:empCode', async (req, res) => {
    try {
        // High-performance search for latest numeric Sr No across ALL leaves
        const latestLeaves = await fetchSmart(Leave, AtlasLeave, { sr_no: { $exists: true, $ne: null } }, { sr_no: -1 });
        const latest = latestLeaves[0];
        
        const nextSrNo = latest && latest.sr_no ? Number(latest.sr_no) + 1 : 1;
        res.json({ nextSrNo });
    } catch (err) {
        res.json({ nextSrNo: 1 });
    }
});

// 6. LOGIN & STAFF MANAGEMENT
app.post('/api/login', async (req, res) => {
    try {
        const { email, password: rawPassword } = req.body;
        console.log(`🔐 [Login Attempt] Email: ${email}`);

        const password = Number(rawPassword);
        if (isNaN(password)) {
            console.warn('⚠️  [Login] Invalid password format (not a number)');
            return res.status(401).json({ success: false, error: "Invalid password format" });
        }
        
        // Case-insensitive email search + Flexible Password (Number or String)
        const passwordNum = Number(rawPassword);
        const query = { 
            "Email": { $regex: new RegExp(`^${email}$`, 'i') },
            $or: [
                { "Password": passwordNum },
                { "Password": String(rawPassword) }
            ]
        };

        const users = await fetchSmart(User, AtlasUser, query, {}, true);
        const user = users[0];

        if (user) {
            console.log(`✅ [Login] Success for: ${user.Name} (Role: ${user.role || user.Role})`);
            res.json({
                success: true, name: user["Name"], empCode: user["Employee Code"],
                role: user["role"] || user["Role"], 
                dept: user["department"] || user["Department"], 
                dept_code: user["dept_code"] ?? user["Dept_Code"] ?? user["Department Code"],
                managed_depts: user["managed_depts"],
                staffType: user["staffType"] || user["Staff Type"] || 'Teaching'
            });
        } else { 
            console.warn(`❌ [Login] Failed. No user found for ${email} with that password.`);
            // Diagnostic check: check if user exists at all without the password filter
            const emailQuery = { "Email": { $regex: new RegExp(`^${email}$`, 'i') } };
            const existingUsers = await fetchSmart(User, AtlasUser, emailQuery);
            
            res.status(401).json({ 
                success: false, 
                error: existingUsers.length > 0 ? "Incorrect password" : "User not found" 
            }); 
        }
    } catch (err) { 
        console.error('💥 [Login] Server Error:', err.message);
        res.status(500).json({ success: false, error: "Internal Server Error" }); 
    }
});

// Diagnostic Endpoint to check Cloud/Local connectivity
app.get('/api/db-status', (req, res) => {
    res.json({
        local: {
            connected: localDB.readyState === 1,
            state: localDB.readyState
        },
        cloud: {
            connected: atlasDB?.readyState === 1,
            state: atlasDB?.readyState,
            configured: !!ATLAS_URI
        }
    });
});

app.get('/api/leaves/staff/:empCode', async (req, res) => {
    const empCode = Number(req.params.empCode);
    if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
    const leaves = await fetchSmart(Leave, AtlasLeave, { Emp_CODE: empCode }, { From: -1 });
    res.json(leaves);
});

app.get('/api/leaves/admin', async (req, res) => { 
    const leaves = await fetchSmart(Leave, AtlasLeave, {}, { From: -1 });
    res.json(leaves); 
});

app.get('/api/staff', async (req, res) => { 
    const staff = await fetchSmart(User, AtlasUser);
    res.json(staff); 
});

app.post('/api/staff', async (req, res) => {
    try {
        let empCode;
        if (req.body["Employee Code"]) {
            empCode = Number(req.body["Employee Code"]);
        } else {
            const users = await fetchSmart(User, AtlasUser, {}, { "Employee Code": -1 });
            const latest = users[0];
            empCode = latest ? latest["Employee Code"] + 1 : 101;
        }
        
        // Ensure a default password if not provided (Schema requires Password as Number)
        const password = req.body.Password || 1234;

        const newUser = await performDualWrite(User, AtlasUser, { 
            ...req.body, 
            "Employee Code": empCode,
            "Password": Number(password)
        });
        
        res.json(newUser);
    } catch (err) {
        console.error("❌ Staff Creation Error:", err);
        res.status(500).json({ error: "Creation failed", details: err.message });
    }
});

app.put('/api/staff/:id', async (req, res) => {
    try {
        const updated = await performDualUpdate(User, AtlasUser, req.params.id, req.body);
        res.json(updated);
    } catch (err) {
        console.error("❌ Staff Update Error:", err);
        res.status(500).json({ error: "Update failed", details: err.message });
    }
});

app.delete('/api/staff/:id', async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    if (AtlasUser) {
        try { await AtlasUser.findByIdAndDelete(req.params.id); } catch (e) {}
    }
    res.json({ success: true });
});

// 7. PROFILE UPDATE
app.get('/api/profile/:empCode', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
        const users = await fetchSmart(User, AtlasUser, { "Employee Code": empCode });
        const user = users.length > 0 ? users[0] : null;
        if (user) res.json(user);
        else res.status(404).json({ error: "User not found" });
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});

app.put('/api/profile/:empCode', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        if (isNaN(empCode)) return res.status(400).json({ error: "Invalid employee code" });
        const { Email, Password } = req.body;
        
        const users = await fetchSmart(User, AtlasUser, { "Employee Code": empCode });
        const user = users[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        const updated = await performDualUpdate(User, AtlasUser, user._id, { Email: Email, Password: Number(Password) });
        res.json({ success: true, data: updated });
    } catch (err) { res.status(500).json({ success: false, error: "Update failed" }); }
});

// 8. ADMIN HELPER ENDPOINTS
app.get('/api/admin/employee-results/:empCode', async (req, res) => {
    try {
        const empCode = Number(req.params.empCode);
        const users = await fetchSmart(User, AtlasUser, { "Employee Code": empCode });
        const user = users[0];
        if (!user) return res.status(404).json({ error: "User not found" });

        const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 });
        const activeSession = sessions[0];
        const sessionName = activeSession?.sessionName || "2025-26";

        // Fetch all leave types applicable for this user/dept/session
        const allLeaveTypes = await fetchSmart(LeaveType, AtlasLeaveType, { sessionName });
        const allTypes = [...new Set(allLeaveTypes.map(t => t.leave_name))];
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
        const sessions = await fetchSmart(Session, AtlasSession, {}, { updatedAt: -1 });
        const activeSession = sessions[0];
        const sessionName = activeSession?.sessionName || "2025-26";

        // Querying with EXACT schema field names
        // Including Pending to match the "taken" balance calculation
        const history = await fetchSmart(Leave, AtlasLeave, { 
            Emp_CODE: empCode, 
            "Type of Leave": type.toUpperCase().trim(),
            sessionName: sessionName,
            Status: { $in: ['Approved', 'Final Approved', 'HOD Approved', 'Pending', 'approved', 'pending'] } 
        }, { From: -1 }); 

        res.json(history);
    } catch (err) { res.status(500).json({ error: "Fetch failed" }); }
});
app.get('/api/admin/clean-srnos', async (req, res) => {
    try {
        const leaves = await fetchSmart(Leave, AtlasLeave);
        let updatedCount = 0;
        
        for (let doc of leaves) {
            let newSrNo = null;
            // Robust extraction variants
            const variants = [
                doc.sr_no, doc.srNo, doc.SrNo, doc['Sr No'], doc['sr no'],
                doc.Sr_No, doc['Sr. No'], doc['Sr.No'], doc['Sr.NO.'], doc.SR_NO,
                doc.Sr, doc.sr, doc.SR
            ];

            for (let v of variants) {
                if (v !== undefined && v !== null && v !== '') {
                    if (typeof v === 'object') {
                        const val = v[''] ?? v.NO ?? v.no ?? v.No ?? v.Value ?? v.$numberInt ?? Object.values(v)[0];
                        if (!isNaN(Number(val))) { newSrNo = Number(val); break; }
                    } else {
                        const num = Number(String(v).trim());
                        if (!isNaN(num)) { newSrNo = num; break; }
                    }
                }
            }

            if (newSrNo !== null) {
                // Perform Update with Sync Reset
                await performDualUpdate(Leave, AtlasLeave, doc._id, { sr_no: newSrNo });
                
                // Cleanup other legacy fields locally
                await Leave.updateOne(
                    { _id: doc._id }, 
                    { 
                        $unset: { 
                            'Sr No': "", 'srNo': "", 'SrNo': "", 'SR_NO': "", 'Sr': "", 'sr': "", 
                            'Sr. No': "", 'Sr.No': "", 'Sr.NO.': "" 
                        } 
                    }
                );
                updatedCount++;
            }
        }
        res.json({ success: true, updatedCount, message: `Successfully synchronized ${updatedCount} records to numeric sr_no.` });
    } catch (err) {
        res.status(500).json({ error: "Migration failed", details: err.message });
    }
});

// 9. POLICY MANAGEMENT
app.get('/api/policies', async (req, res) => {
    try {
        const { role } = req.query;
        // Staff/HOD only see published policies
        const query = (role === 'Admin') ? {} : { status: 'Published' };
        const policies = await fetchSmart(Policy, AtlasPolicy, query, { updatedAt: -1 });
        res.json(policies);
    } catch (err) {
        res.status(500).json({ error: "Fetch policies failed" });
    }
});

app.post('/api/policies', async (req, res) => {
    try {
        const data = {
            ...req.body,
            publishedAt: req.body.status === 'Published' ? new Date() : null
        };
        const newPolicy = await performDualWrite(Policy, AtlasPolicy, data);
        res.json(newPolicy);
    } catch (err) {
        res.status(500).json({ error: "Policy creation failed" });
    }
});

app.put('/api/policies/:id', async (req, res) => {
    try {
        const data = { ...req.body };
        if (data.status === 'Published' && !data.publishedAt) {
            data.publishedAt = new Date();
        }
        const updated = await performDualUpdate(Policy, AtlasPolicy, req.params.id, data);
        res.json(updated);
    } catch (err) {
        res.status(500).json({ error: "Policy update failed" });
    }
});

app.delete('/api/policies/:id', async (req, res) => {
    try {
        await Policy.findByIdAndDelete(req.params.id);
        if (AtlasPolicy) await AtlasPolicy.findByIdAndDelete(req.params.id).catch(() => {});
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: "Delete failed" });
    }
});

app.post('/api/admin/reconcile', async (req, res) => {
    try {
        await reconcileCloudToLocal();
        res.json({ success: true, message: "Reconciliation triggered successfully." });
    } catch (err) {
        res.status(500).json({ error: "Reconciliation failed" });
    }
});

const PORT = process.env.PORT || 5000;
if (!process.env.VERCEL) {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
module.exports = app;
