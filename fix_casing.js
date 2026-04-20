const mongoose = require('mongoose');
require('dotenv').config();

const ATLAS_URI = "mongodb+srv://snehaljoshihappysoul_db_user:jmJk0zbC9dqTt5U8@cluster0.bnen0s3.mongodb.net/?appName=Cluster0&retryWrites=true&w=majority";
const LOCAL_URI = "mongodb://127.0.0.1:27017/employeeDB";

async function normalizeDatabase(uri, label) {
    console.log(`\n--- Processing ${label} ---`);
    const conn = await mongoose.createConnection(uri).asPromise();
    const collection = conn.db.collection('leave_applications');
    
    const leaves = await collection.find({}).toArray();
    let updatedCount = 0;

    for (const leave of leaves) {
        const currentType = leave['Type of Leave'] || leave.Type_of_Leave;
        if (!currentType) continue;

        const upperType = currentType.toUpperCase().trim();
        
        if (currentType !== upperType) {
            await collection.updateOne(
                { _id: leave._id },
                { $set: { "Type of Leave": upperType, "Type_of_Leave": upperType } }
            );
            updatedCount++;
            console.log(`[Fixed] sr_no: ${leave.sr_no}: "${currentType}" -> "${upperType}"`);
        }
    }

    console.log(`✅ Finished ${label}. Updated ${updatedCount} records.`);
    await conn.close();
}

async function run() {
    try {
        await normalizeDatabase(LOCAL_URI, "Local MongoDB");
        await normalizeDatabase(ATLAS_URI, "MongoDB Atlas");
        console.log("\n🚀 All databases normalized successfully!");
        process.exit(0);
    } catch (err) {
        console.error("💥 Critical Error:", err);
        process.exit(1);
    }
}

run();
