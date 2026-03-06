const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Database Connection
mongoose.connect('mongodb://127.0.0.1:27017/employeeDB')
  .then(() => console.log("Connected to MongoDB"))
  .catch(err => console.error("Connection Error:", err));

// 2. Staff/User Schema (Based on your MongoDB screenshots)
const userSchema = new mongoose.Schema({
  "Employee Code": Number,
  "Name": String,
  "Email": { type: String, required: true },
  "Password": { type: Number, required: true }, // Int32
  "role": String,
  "staffType": String,
  "department": String
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

// 3. Leave Schema (Based on your Excel/CSV columns)
const leaveSchema = new mongoose.Schema({
  Emp_CODE: Number,
  Name: String,
  Dept_Code: Number,
  Type_of_Leave: String,
  From: Date,
  To: Date,
  Total_Days: Number,
  Status: { type: String, default: 'Pending' }, // Pending, HOD Approved, Approved, Rejected
  HOD_Approved: { type: Boolean, default: false }
}, { collection: 'leave_applications' });

const Leave = mongoose.model('Leave', leaveSchema);

// --- ROUTES ---

// Login API
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
  const staff = await User.find({});
  res.json(staff);
});

// Admin: Get all leave applications
app.get('/api/leaves/admin', async (req, res) => {
  try {
    const leaves = await Leave.find({});
    res.json(leaves);
  } catch (err) { res.status(500).send("Error fetching leaves"); }
});

// Admin & HOD: Process Approve/Reject Action
app.post('/api/leaves/process/:id', async (req, res) => {
  try {
    const { status } = req.body; // 'Approved', 'HOD Approved', or 'Rejected'
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).send("Leave record not found");

    leave.Status = status;
    if (status === 'HOD Approved') {
      leave.HOD_Approved = true;
    }
    await leave.save();
    res.json({ success: true, message: `Leave ${status} successfully` });
  } catch (err) { res.status(500).send("Server Error"); }
});

app.listen(5000, () => console.log("Server running on http://localhost:5000"));