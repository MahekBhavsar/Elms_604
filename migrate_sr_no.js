const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://127.0.0.1:27017/employeeDB';

async function migrate() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;
        const collection = db.collection('leave_applications');

        const cursor = collection.find({});
        let count = 0;

        while (await cursor.hasNext()) {
            const doc = await cursor.next();
            
            // Check for Sr.NO. or Sr
            const oldSrNo = doc['Sr.NO.'] || (doc.Sr && (doc.Sr.NO ?? doc.Sr.no));
            
            if (oldSrNo && !doc.sr_no) {
                // Move to sr_no
                await collection.updateOne(
                    { _id: doc._id },
                    { 
                        $set: { sr_no: String(oldSrNo) },
                        $unset: { 'Sr.NO.': "", "Sr": "" } 
                    }
                );
                count++;
            } else if (doc['Sr.NO.'] !== undefined || doc.Sr !== undefined) {
                // If sr_no already exists, just remove the old ones
                await collection.updateOne(
                    { _id: doc._id },
                    { $unset: { 'Sr.NO.': "", "Sr": "" } }
                );
                count++;
            }
        }

        console.log(`Migration complete. Updated ${count} records.`);
        process.exit(0);
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

migrate();
