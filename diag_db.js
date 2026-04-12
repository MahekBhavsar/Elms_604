const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const LOCAL_URI = process.env.MONGO_LOCAL_URI || 'mongodb://127.0.0.1:27017/employeeDB';
const ATLAS_URI = process.env.MONGO_ATLAS_URI;

async function runDiagnosis() {
    try {
        console.log('🚀 Starting Database Diagnosis...');

        // 1. Check Local
        const localConn = await mongoose.createConnection(LOCAL_URI).asPromise();
        console.log('✅ Connected to Local MongoDB');
        const localCount = await localConn.db.collection('leave_applications').countDocuments();
        console.log(`📊 Local Record Count: ${localCount}`);

        // 2. Check Atlas
        let atlasCount = 0;
        if (ATLAS_URI) {
            try {
                const atlasConn = await mongoose.createConnection(ATLAS_URI).asPromise();
                console.log('✅ Connected to MongoDB Atlas');
                atlasCount = await atlasConn.db.collection('leave_applications').countDocuments();
                console.log(`📊 Atlas Record Count: ${atlasCount}`);
                
                if (atlasCount > localCount && localCount > 0) {
                    console.log(`⚠️  Warning: Atlas has ${atlasCount - localCount} more records than Local.`);
                }
                
                await atlasConn.close();
            } catch (err) {
                console.error('❌ Atlas Connection Failed:', err.message);
            }
        }

        await localConn.close();
        console.log('\n--- Diagnosis Complete ---');
        process.exit(0);
    } catch (err) {
        console.error('❌ Diagnosis failed:', err);
        process.exit(1);
    }
}

runDiagnosis();
