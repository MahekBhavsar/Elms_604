const mongoose = require('mongoose');

async function debugState() {
    try {
        await mongoose.connect('mongodb://127.0.0.1:27017/employeeDB');
        console.log("Connected to MongoDB");

        // 1. List all sessions
        const sessions = await mongoose.connection.collection('active_sessions').find({}).toArray();
        console.log("\n--- Active Sessions in DB ---");
        sessions.forEach(s => console.log(`- Session: "${s.sessionName}", Start: ${s.startDate}, End: ${s.endDate}`));

        // 2. List users
        const users = await mongoose.connection.collection('users').find({}).toArray();
        console.log("\n--- Users in DB ---");
        users.forEach(u => console.log(`- ${u.Name} (${u['Employee Code']}), Dept=${u.dept_code}`));

        // 3. List Leave Rules for SL
        const rules = await mongoose.connection.collection('leave_types').find({ leave_name: 'SL' }).toArray();
        console.log("\n--- SL Leave Rules ---");
        rules.forEach(r => console.log(`- Session: ${r.sessionName}, Limit: ${r.total_yearly_limit}, Dept: ${r.dept_code}`));

        // 4. Check for manual adjustments for a specific user (let's check Rachna if she exists)
        const rachna = users.find(u => u.Name.toLowerCase().includes('rachna'));
        if (rachna) {
            console.log(`\n--- Manual Adjustments for ${rachna.Name} (Code: ${rachna['Employee Code']}) ---`);
            const adjs = await mongoose.connection.collection('balance_adjustments').find({ empCode: rachna['Employee Code'], leaveType: 'SL' }).toArray();
            adjs.forEach(a => console.log(`- Session: ${a.sessionName}, Value: ${a.adjustmentValue}`));
        }

        process.exit();
    } catch (err) {
        console.error("Error:", err);
        process.exit(1);
    }
}

debugState();
