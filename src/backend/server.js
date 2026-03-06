const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

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
  "leaveBalance": { type: Number, default: 30 }
}, { collection: 'users', versionKey: false });

const User = mongoose.model('User', userSchema);

// Leave Type Schema matches 'leave_types' collection
const leaveTypeSchema = new mongoose.Schema({
  leave_name: String,        // Matches "cl" or "sl"
  total_yearly_limit: Number // Matches 12
}, { collection: 'leave_types', versionKey: false });

const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

// Leave Application Schema matches 'leave_applications' collection
const leaveSchema = new mongoose.Schema({
  Emp_CODE: Number,          // Matches blue Number in Compass
  Name: String,
  Dept_Code: Number,
  "Type of Leave": String,   // Matches key with spaces
  From: String,              // Matches "6/18/2025" string
  To: String,
  "Total Days": Number,      // Matches key with spaces
  Status: { type: String, default: 'Pending' },
  HOD_Approved: { type: Boolean, default: false }
}, { collection: 'leave_applications', versionKey: false });

const Leave = mongoose.model('Leave', leaveSchema);

// --- Routes ---

// Login Route
app.post('/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ "Email": email, "Password": Number(password) });
    if (user) {
      res.json({
        success: true,
        name: user["Name"],
        empCode: user["Employee Code"],
        role: user["role"],
        dept: user["department"],
        leaveBalance: user.leaveBalance
      });
    } else {
      res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
  } catch (err) { res.status(500).json({ success: false }); }
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
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
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