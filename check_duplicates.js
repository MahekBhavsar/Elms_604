const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/employeeDB';

async function findDuplicates() {
    try {
        await mongoose.connect(LOCAL_URI);
        console.log('✅ Connected to Local MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('leave_applications');

        const allLeaves = await collection.find({}).toArray();
        console.log(`📊 Total records in local DB: ${allLeaves.length}`);

        const seen = new Map();
        const duplicates = [];

        for (const leaf of allLeaves) {
            // Identify record by content
            // We use Emp_CODE, sr_no, From, To, and Leave Type as identity
            const key = `${leaf.Emp_CODE}_${leaf.sr_no}_${leaf.From}_${leaf.To}_${String(leaf['Type of Leave'] || leaf.Type_of_Leave).toUpperCase()}`;
            
            if (seen.has(key)) {
                duplicates.push({
                    originalId: seen.get(key),
                    duplicateId: leaf._id,
                    content: key
                });
            } else {
                seen.set(key, leaf._id);
            }
        }

        console.log(`🔍 Found ${duplicates.length} duplicate pairs based on content.`);
        
        if (duplicates.length > 0) {
            console.log('\nSample duplicates:');
            duplicates.slice(0, 5).forEach(d => {
                console.log(`- Content: ${d.content}\n  IDs: ${d.originalId} vs ${d.duplicateId}`);
            });
            
            console.log('\nSuggestion: Run a cleanup script to keep only one from each pair.');
        }

        process.exit(0);
    } catch (err) {
        console.error('❌ Diagnostic failed:', err);
        process.exit(1);
    }
}

findDuplicates();
