const mongoose = require('mongoose');
<<<<<<< HEAD
mongoose.connect('mongodb://127.0.0.1:27017/employeeDB').then(async() => {
    const LeaveType = mongoose.model('L', new mongoose.Schema({}, {strict:false}), 'leave_types');
    const Leave = mongoose.model('LV', new mongoose.Schema({}, {strict:false}), 'leave_applications');
    const empCode = 103;
    const rules = await LeaveType.find({staffType:'Teaching'}).lean();
    const userRules = rules.filter(r => String(r.dept_code) === '1' && r.leave_name && r.leave_name.toUpperCase().trim() === 'SL');
    const currentSessionName = '2025-2026';
    const currentRule = userRules.find(r => r.sessionName === currentSessionName);
    
    let limit = Number(currentRule.total_yearly_limit);
    const currentYearStart = parseInt(currentSessionName.split('-')[0]);
    const pastRules = userRules.filter(r => parseInt(r.sessionName.split('-')[0]) < currentYearStart);
    
    let pastBalance = 0;
    for (let pastRule of pastRules) {
        const leaves = await Leave.find({
            Emp_CODE: empCode, 
            Status: {$in:['Approved', 'approved', 'Final Approved', 'HOD Approved']}, 
            $or:[{ 'Type of Leave':'SL' }, { 'Type_of_Leave':'SL' }], 
            sessionName: pastRule.sessionName
        }).lean();
        
        const pastUsed = leaves.reduce((sum, l) => sum + (Number(l['Total Days'] || l.Total_Days) || 0), 0);
        pastBalance += Math.max(0, Number(pastRule.total_yearly_limit) - pastUsed);
        
        console.log(`Session: ${pastRule.sessionName}, Limit: ${pastRule.total_yearly_limit}, Used: ${pastUsed}, Added to Balance: ${Math.max(0, Number(pastRule.total_yearly_limit) - pastUsed)}`);
    }
    
    limit += pastBalance;
    console.log({finalLimit: limit, pastBalance});
    mongoose.disconnect();
=======

mongoose.connect('mongodb://127.0.0.1:27017/employeeDB').then(async () => {
    const db = mongoose.connection.db;

    const emp = await db.collection('users').findOne({"Employee Code": 104});
    
    const rules = await db.collection('leave_types').find({
        leave_name: 'SL',
        dept_code: emp.dept_code,
        staffType: emp.staffType || 'Teaching'
    }).toArray();

    console.log("Found rules for SL:", rules);
    process.exit(0);
>>>>>>> 29e78c4579f61a613090ea4eb32a17d9353da7c7
});
