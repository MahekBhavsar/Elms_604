const mongoose = require('mongoose');

async function debugState() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/employeeDB');
        
        const users = await mongoose.connection.collection('users').find({}).toArray();
        const snehal = users.find(u => u.Name.toLowerCase().includes('snehal'));
        
        if (snehal) {
            console.log(`\n--- Data for ${snehal.Name} (Code: ${snehal['Employee Code']}), Dept: ${snehal.dept_code} ---`);
            
            // 1. Check SL Rules
            const rules = await mongoose.connection.collection('leave_types').find({ 
                leave_name: 'SL',
                $or: [
                    { dept_code: snehal.dept_code },
                    { dept_code: 0 },
                    { dept_code: '0' }
                ]
            }).toArray();
            console.log("\n--- SL Leave Rules for this user ---");
            rules.forEach(r => console.log(`- Session: ${r.sessionName}, Limit: ${r.total_yearly_limit}, Dept: ${r.dept_code}`));

            // 2. Check Manual Adjustments
            console.log("\n--- Manual Adjustments for SL ---");
            const adjs = await mongoose.connection.collection('balance_adjustments').find({ 
                empCode: snehal['Employee Code'], 
                leaveType: 'SL' 
            }).toArray();
            adjs.forEach(a => console.log(`- Session: ${a.sessionName}, Value: ${a.adjustmentValue}`));

            // 3. Check Leave History for SL in past sessions
            console.log("\n--- Past Leave History for SL ---");
            const pastLeaves = await mongoose.connection.collection('leave_applications').find({
                Emp_CODE: snehal['Employee Code'],
                $or: [{ "Type of Leave": 'SL' }, { "Type_of_Leave": 'SL' }],
                Status: { $in: ['Approved', 'Final Approved', 'HOD Approved'] }
            }).toArray();
            pastLeaves.forEach(l => console.log(`- Session: ${l.sessionName}, Days: ${l["Total Days"] || l.Total_Days}, Status: ${l.Status}`));
        } else {
            console.log("Snehal not found");
        }

        process.exit();
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

debugState();
