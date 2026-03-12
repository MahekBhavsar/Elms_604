const mongoose = require('mongoose');

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
});
