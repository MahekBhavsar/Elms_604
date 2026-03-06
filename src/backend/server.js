const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Database Connection
mongoose.connect('mongodb://127.0.0.1:27017/employeeDB')
  .then(() => console.log("Connected to MongoDB: employeeDB"))
  .catch(err => console.error("Database Connection Error:", err));

// 2. Staff/User Schema 
// Includes 'leaveBalance' to track remaining days
const userSchema = new mongoose.Schema({
  "Employee Code": Number,
  "Name": String,
  "Email": { type: String, required: true },
  "Password": { type: Number, required: true }, // Int32 type
  "role": String,
  "staffType": String,
  "department": String,
  "leaveBalance": { type: Number, default: 30 } 
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

// 3. Leave Type Schema (Yearly Limits for CL, SL, etc.)
const leaveTypeSchema = new mongoose.Schema({
  leave_name: String, 
  total_yearly_limit: Number
}, { collection: 'leave_types' });

const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

// 4. Leave Application Schema (Matches your Excel/CSV columns)
const leaveSchema = new mongoose.Schema({
  Emp_CODE: Number,
  Name: String,
  Dept_Code: Number,
  Type_of_Leave: String,
  From: Date,
  To: Date,
  Total_Days: Number,
  Status: { type: String, default: 'Pending' } 
}, { collection: 'leave_applications' });

const Leave = mongoose.model('Leave', leaveSchema);

// --- AUTH & STAFF ROUTES ---

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
        staffType: user["staffType"],
        dept: user["department"]
      });
    } else {
      res.status(401).json({ success: false, message: "Invalid Credentials" });
    }
  } catch (err) { res.status(500).json({ success: false }); }
});

// Staff: Apply for leave
app.post('/api/leaves/apply', async (req, res) => {
  try {
    const { Emp_CODE, Name, Dept_Code, Type_of_Leave, From, To, Total_Days, Role } = req.body;

    // Direct to Admin if applicant is HOD
    const isHod = Role === 'Hod' || Role === 'HOD';
    const initialStatus = isHod ? 'HOD Approved' : 'Pending';

    const newLeave = new Leave({
      Emp_CODE,
      Name,
      Dept_Code,
      Type_of_Leave,
      From,
      To,
      Total_Days,
      Status: initialStatus,
      HOD_Approved: isHod
    });

    await newLeave.save();
    res.json({ success: true, message: "Leave applied successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to apply for leave" });
  }
});

// HOD: Get pending leaves
app.get('/api/leaves/hod', async (req, res) => {
  try {
    const leaves = await Leave.find({ Status: 'Pending', Emp_CODE: { $ne: null, $exists: true } });
    res.json(leaves);
  } catch (err) { res.status(500).send("Error fetching leaves"); }
});

// Admin: Get all staff for management table
app.get('/api/staff', async (req, res) => {
  try {
    const staff = await User.find({});
    res.json(staff);
  } catch (err) { res.status(500).send("Error fetching staff"); }
});

// --- LEAVE MANAGEMENT ROUTES ---

// Set Yearly Leave Limits
app.post('/api/leave-types/set', async (req, res) => {
  const { leave_name, limit } = req.body;
  try {
    await LeaveType.findOneAndUpdate(
      { leave_name }, 
      { total_yearly_limit: limit }, 
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).send("Error setting limits"); }
});

// Admin: Get all leave applications
app.get('/api/leaves/admin', async (req, res) => {
  try {
    const leaves = await Leave.find({});
    res.json(leaves);
  } catch (err) { res.status(500).send("Error fetching leaves"); }
});

// Admin Decision: Approve & Deduct or Reject
// Admin & HOD: Process Approve/Reject Action
app.post('/api/leaves/process/:id', async (req, res) => {
  try {
    const { status } = req.body; // 'Approved', 'HOD Approved', or 'Rejected'
    const leave = await Leave.findById(req.params.id);
    
    if (!leave) return res.status(404).send("Leave record not found");

    if (status === 'Approved') {
      // Deducting Total_Days from User balance based on Emp_CODE
      await User.updateOne(
        { "Employee Code": leave.Emp_CODE },
        { $inc: { leaveBalance: -leave.Total_Days } }
      );
    }

    leave.Status = status;
    if (status === 'HOD Approved') {
      leave.HOD_Approved = true;
    }
    await leave.save();
    res.json({ success: true, message: `Leave ${status} and balance updated.` });
  } catch (err) { res.status(500).send("Server Error processing leave"); }
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));