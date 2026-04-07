const mongoose = require('mongoose');

const LOCAL_URI = 'mongodb://127.0.0.1:27017/employeeDB';
const ATLAS_URI = 'mongodb+srv://mahekbhavsar29_db_user:Hopeu33dSs0e6zUH@cluster0.0xfniym.mongodb.net/employeeDB';

async function migrate(uri, label) {
    console.log(`\n🚀 Starting Migration for ${label}...`);
    let conn;
    try {
        conn = await mongoose.createConnection(uri).asPromise();
        console.log(`✅ Connected to ${label}`);

        const collections = ['leave_applications', 'users'];
        
        for (const collName of collections) {
            const collection = conn.db.collection(collName);
            const cursor = collection.find({});
            let count = 0;
            let skipped = 0;

            console.log(`📦 Processing collection: ${collName}...`);

            while (await cursor.hasNext()) {
                const doc = await cursor.next();
                let newSrNo = null;

                // 1. Try to find any serial number variant
                const variants = [
                    doc.sr_no, doc.srNo, doc.SrNo, doc['Sr No'], doc['sr no'],
                    doc.Sr_No, doc['Sr. No'], doc['Sr.No'], doc['Sr.NO.'], doc.SR_NO,
                    doc.Sr, doc.sr, doc.SR, doc.srno, doc.No, doc.no
                ];

                for (let v of variants) {
                    if (v !== undefined && v !== null && v !== '') {
                        if (typeof v === 'object') {
                            // Handle MongoDB object wrappers or nested Sr: { NO: "3" }
                            const val = v[''] ?? v.NO ?? v.no ?? v.No ?? v.Value ?? v.$numberInt ?? v.$numberLong ?? Object.values(v)[0];
                            const num = Number(val);
                            if (!isNaN(num)) {
                                newSrNo = num;
                                break;
                            }
                        } else {
                            const num = Number(String(v).trim());
                            if (!isNaN(num)) {
                                newSrNo = num;
                                break;
                            }
                        }
                    }
                }

                if (newSrNo !== null) {
                    // Update document: set sr_no as Number and unset all variants
                    const unsetObj = {};
                    const keysToUnset = [
                        'Sr', 'sr', 'SR', 'srno', 'No', 'no',
                        'Sr No', 'srNo', 'SrNo', 'Sr_No', 'Sr. No',
                        'Sr.No', 'Sr.NO.', 'SR_NO', 'sr_No', 'sr no'
                    ];
                    
                    for (let k of keysToUnset) {
                        if (doc[k] !== undefined) {
                            unsetObj[k] = "";
                        }
                        // Also handle direct dot-notation paths if they were somehow stored as literal keys with dots
                        // MongoDB allows dots in keys in 5.0+, but they can still cause conflict with sub-objects.
                    }

                    const updateObj = { $set: { sr_no: newSrNo } };
                    if (Object.keys(unsetObj).length > 0) {
                        updateObj.$unset = unsetObj;
                    }

                    try {
                        await collection.updateOne({ _id: doc._id }, updateObj);
                        count++;
                    } catch (e) {
                        // If dot-notation still fails, try a simpler unset for 'Sr' first
                        if (e.message.includes('conflict')) {
                            await collection.updateOne({ _id: doc._id }, { $unset: { 'Sr': "" } });
                            await collection.updateOne({ _id: doc._id }, updateObj);
                            count++;
                        } else {
                            throw e;
                        }
                    }
                } else {
                    skipped++;
                }
            }
            console.log(`✨ ${collName}: Updated ${count} records, Skipped ${skipped} (no valid Sr No found).`);
        }

    } catch (err) {
        console.error(`❌ Migration failed for ${label}:`, err.message);
    } finally {
        if (conn) await conn.close();
    }
}

async function runAll() {
    await migrate(LOCAL_URI, 'LOCAL');
    await migrate(ATLAS_URI, 'ATLAS');
    console.log('\n🏁 All migrations complete!');
    process.exit(0);
}

runAll();
