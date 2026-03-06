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

const userSchema = new mongoose.Schema({
  "Employee Code": Number,
  "Name": String,
  "Email": { type: String, required: true },
  "Password": { type: Number, required: true },
  "role": String,
  "staffType": String,
  "department": String,
  "dept_code": Number,
  "leaveBalance": { type: Number, default: 30 }
}, { collection: 'users', versionKey: false });

const User = mongoose.model('User', userSchema);

const leaveTypeSchema = new mongoose.Schema({
  leave_name: String,        // e.g., "cl", "sl"
  total_yearly_limit: Number // e.g., 12
}, { collection: 'leave_types', versionKey: false });

const LeaveType = mongoose.model('LeaveType', leaveTypeSchema);

const leaveSchema = new mongoose.Schema({
  Emp_CODE: Number,
  Name: String,
  Dept_Code: Number,
  Type_of_Leave: String,
  From: String,
  To: String,
  Total_Days: Number,
  Status: { type: String, default: 'Pending' },
  HOD_Approved: { type: Boolean, default: false }
}, { collection: 'leave_applications', versionKey: false });

const Leave = mongoose.model('Leave', leaveSchema);

// --- Routes ---

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

app.get('/api/leave-types', async (req, res) => {
  try {
    const types = await LeaveType.find({});
    res.json(types);
  } catch (err) { res.status(500).json({ error: "Failed to fetch types" }); }
});

app.get('/api/leaves/staff/:empCode', async (req, res) => {
  try {
    const empCode = Number(req.params.empCode);
    const leaves = await Leave.find({ Emp_CODE: empCode }).sort({ _id: -1 });
    res.json(leaves);
  } catch (err) { res.status(500).json({ error: "Failed to fetch history" }); }
});

app.post('/api/leaves/process/:id', async (req, res) => {
  try {
    const { status } = req.body;
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).send("Not found");

    if (status === 'Approved') {
      await User.updateOne(
        { "Employee Code": leave.Emp_CODE },
        { $inc: { leaveBalance: -leave.Total_Days } }
      );
    }
    leave.Status = status;
    if (status === 'HOD Approved') leave.HOD_Approved = true;
    await leave.save();
    res.json({ success: true });
  } catch (err) { res.status(500).send("Error"); }
});

app.post('/api/leaves/apply', async (req, res) => {
  try {
    const payload = req.body;
    const isHod = payload.role === 'Hod' || payload.role === 'HOD';
    const newLeave = new Leave({
      ...payload,
      Status: isHod ? 'HOD Approved' : 'Pending',
      HOD_Approved: isHod
    });
    await newLeave.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Admin endpoint to get all leaves and append remaining balance
app.get('/api/leaves/admin', async (req, res) => {
  try {
    const leaves = await Leave.find({}).sort({ _id: -1 }).lean();
    const leaveTypes = await LeaveType.find({}).lean();

    const usedMap = {};
    for (const leave of leaves) {
      if (leave.Status === 'Approved') {
        const typeStr = (leave.Type_of_Leave || "").toLowerCase();
        const key = `${leave.Emp_CODE}_${typeStr}`;
        usedMap[key] = (usedMap[key] || 0) + (Number(leave.Total_Days) || 0);
      }
    }

    const enrichedLeaves = leaves.map(leave => {
      const typeStr = (leave.Type_of_Leave || "").toLowerCase();
      const lType = leaveTypes.find(t => (t.leave_name || "").toLowerCase() === typeStr);
      const limit = lType ? lType.total_yearly_limit : 0;
      const used = usedMap[`${leave.Emp_CODE}_${typeStr}`] || 0;

      return {
        ...leave,
        Remaining_Leaves: limit - used
      };
    });

    res.json(enrichedLeaves);
  } catch (err) { res.status(500).json({ error: "Failed to fetch admin leaves" }); }
});

// Staff CRUD endpoints
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
    const body = req.body;
    body["Employee Code"] = nextCode;
    const newUser = new User(body);
    await newUser.save();
    res.json(newUser);
  } catch (err) { res.status(500).json({ error: "Failed to create staff" }); }
});

app.put('/api/staff/:id', async (req, res) => {
  try {
    const updated = await User.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) { res.status(500).json({ error: "Failed to update staff" }); }
});

app.delete('/api/staff/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: "Failed to delete staff" }); }
});

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));