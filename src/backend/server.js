const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer'); // Added
const path = require('path'); // Added
const fs = require('fs'); // Added
const app = express();
app.use(express.json());
app.use(cors());
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) { fs.mkdirSync(uploadDir); }
// Serve the uploads folder so files can be viewed via URL
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });
// Database Connection
mongoose.connect('mongodb://127.0.0.1:27017/employeeDB')
  .then(() => console.log("Connected to MongoDB - employeeDB"))
  .catch(err => console.error("Database Connection Error:", err));

// --- Schemas ---

// User Schema matches 'users' collection
const userSchema = new mongoose.Schema({
  "Employee Code": Number,
  "Name": String,
  "Email": { type: String, required: true },
  "Password": { type: Number, required: true },
  "role": String,
  "department": String,
  "leaveBalance": { type: Number, default: 30 },
  "dept_code":String
}, { collection: 'users', versionKey: false });

const User = mongoose.model('User', userSchema);

// Leave Type Schema matches 'leave_types' collection
// Updated Leave Type Schema
const leaveTypeSchema = new mongoose.Schema({
  leave_name: String,         // "CL", "SL", "VL"
  total_yearly_limit: Number, // e.g., 12
  dept_code: String,          // Matches "1", "2", "7", etc.
  staffType: String           // "Teaching", "Peon", "Other"
}, { collection: 'leave_types', versionKey: false });
const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

// Leave Application Schema matches 'leave_applications' collection
const leaveSchema = new mongoose.Schema({
  Emp_CODE: Number,
  Name: String,
  Dept_Code: Number,
  "Type of Leave": String,
  From: String,
  To: String,
  "Total Days": Number,
  Status: { type: String, default: 'Pending' },
  HOD_Approved: { type: Boolean, default: false },
  Reject_Reason: String,
  document: String // This will store the filename/path
}, { collection: 'leave_applications', versionKey: false });

const Leave = mongoose.model('Leave', leaveSchema);
// Add this route to your Express server
// POST: Create or Update a leave type (Upsert logic)
// POST: Create or Update a leave type (Perfected Upsert logic)
// POST: Create or Update a leave type (Perfected Upsert logic)
app.post('/api/leave-types/set', async (req, res) => {
  try {
    // Destructure everything from the body
    const { leave_name, total_yearly_limit, dept_code, staffType } = req.body;

    // FIND by the unique combination of these 3 fields
    // UPDATE the limit
    const updatedType = await LeaveType.findOneAndUpdate(
      { 
        leave_name: leave_name, 
        dept_code: dept_code, 
        staffType: staffType 
      },
      { total_yearly_limit: Number(total_yearly_limit) }, // Use total_yearly_limit from frontend
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true, data: updatedType });
  } catch (err) {
    console.error("Save Error:", err);
    res.status(500).json({ success: false, error: "Database save failed" });
  }
});
// DELETE: Remove a specific leave type
app.delete('/api/leave-types/:id', async (req, res) => {
  try {
    await LeaveType.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: "Delete failed" });
  }
});
// Add this route to your server.js
app.post('/api/leaves/apply', upload.single('document'), async (req, res) => {
  try {
    const newLeave = new Leave({
      Emp_CODE: Number(req.body.Emp_CODE),
      Name: req.body.Name,
      Dept_Code: Number(req.body.Dept_Code),
      "Type of Leave": req.body.Type_of_Leave,
      From: req.body.From,
      To: req.body.To,
      "Total Days": Number(req.body.Total_Days),
      document: req.file ? req.file.filename : null // Save filename if uploaded
    });

    await newLeave.save();
    res.json({ success: true, data: newLeave });
  } catch (err) {
    console.error("Apply Error:", err);
    res.status(500).json({ success: false, error: "Submission failed" });
  }
});

// Login, Process Decision, Admin List, and Staff CRUD routes remain the same...
// (Ensure the Admin endpoint includes the 'document' field in the response)

// POST: Process Leave Decision with Reason
app.post('/api/leaves/process/:id', async (req, res) => {
  try {
    const { status, reason } = req.body; // Receive status and reason
    const updateData = { Status: status };
    
    if (status === 'Rejected' && reason) {
      updateData.Reject_Reason = reason; // Add reason to database
    }

    const updatedLeave = await Leave.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { returnDocument: 'after' }
    );
    
    res.json({ success: true, data: updatedLeave });
  } catch (err) {
    res.status(500).json({ error: "Failed to process decision" });
  }
});

// GET: Fetch all leave types
app.get('/api/leave-types', async (req, res) => {
  try {
    const types = await LeaveType.find({});
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

// GET all leave types (Ensure this exists and is working)
app.get('/api/leave-types', async (req, res) => {
  try {
    const types = await LeaveType.find({});
    res.json(types);
  } catch (err) {
    res.status(500).json({ error: "Fetch failed" });
  }
});

// --- Routes ---

// Login Route
// Updated Login Route in server.js
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    // Find user matching Email and Password
    const user = await User.findOne({ "Email": email, "Password": Number(password) });
    
    if (user) {
      res.json({
        success: true,
        name: user["Name"],
        empCode: user["Employee Code"],
        role: user["role"],
        dept: user["department"],
        // CRITICAL FIX: Include dept_code so HOD can filter their department
        dept_code: user["dept_code"], 
        leaveBalance: user.leaveBalance
      });
    } else {
      res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
  } catch (err) { 
    res.status(500).json({ success: false }); 
  }
});

// Fetch Yearly Limits (Fixes 404 for /api/leave-types)
app.get('/api/leave-types', async (req, res) => {
  try {
    const types = await LeaveType.find({});
    res.json(types);
  } catch (err) { res.status(500).json({ error: "Failed to fetch types" }); }
});

// Fetch staff history (Fixes 404 for /api/leaves/staff/:empCode)
app.get('/api/leaves/staff/:empCode', async (req, res) => {
  try {
    const empCode = Number(req.params.empCode); // Convert string param to Number
    const leaves = await Leave.find({ Emp_CODE: empCode }).sort({ _id: -1 });
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: "Fetch history failed" }); }
});

// Admin endpoint with enriched remaining balances
app.get('/api/leaves/admin', async (req, res) => {
  try {
    const leaves = await Leave.find({}).sort({ _id: -1 }).lean();
    const leaveTypes = await LeaveType.find({}).lean();

    const usedMap = {};
    leaves.forEach(l => {
      if (l.Status === 'Approved') {
        const typeStr = (l["Type of Leave"] || "").toLowerCase();
        const key = `${l.Emp_CODE}_${typeStr}`;
        usedMap[key] = (usedMap[key] || 0) + (Number(l["Total Days"]) || 0);
      }
    });

    const enriched = leaves.map(l => {
      const typeStr = (l["Type of Leave"] || "").toLowerCase();
      const lType = leaveTypes.find(t => (t.leave_name || "").toLowerCase() === typeStr);
      const limit = lType ? lType.total_yearly_limit : 0;
      const used = usedMap[`${l.Emp_CODE}_${typeStr}`] || 0;

      return {
        ...l,
        Remaining_Leaves: limit - used
      };
    });
    res.json(enriched);
  } catch (err) { res.status(500).json({ error: "Admin fetch failed" }); }
});

// Staff Management (CRUD)
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await User.find({});
    res.json(staff);
  } catch (err) { res.status(500).json({ error: "Failed to fetch staff" }); }
});

app.post('/api/staff', async (req, res) => {
  try {
    const latestUser = await User.findOne().sort({ "Employee Code": -1 });
    const nextCode = latestUser && latestUser["Employee Code"] ? latestUser["Employee Code"] + 1 : 101;
    const newUser = new User({ ...req.body, "Employee Code": nextCode });
    await newUser.save();
    res.json(newUser);
  } catch (err) { res.status(500).json({ error: "Create staff failed" }); }
});

app.put('/api/staff/:id', async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { returnDocument: 'after' });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: "Update staff failed" }); }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Delete staff failed" }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
