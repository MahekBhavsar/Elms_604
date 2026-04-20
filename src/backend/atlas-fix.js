const mongoose = require('mongoose');

// Connect directly to the proper Atlas DB
mongoose.connect('mongodb+srv://snehaljoshihappysoul_db_user:jmJk0zbC9dqTt5U8@cluster0.bnen0s3.mongodb.net/?appName=Cluster0')
  .then(() => console.log('Connected to correct MongoDB Atlas...'))
  .catch(err => console.error('Could not connect to MongoDB...', err));

const Leave = mongoose.model('Leave', new mongoose.Schema({}, { strict: false }));

async function run() {
  try {
    const leaves = await Leave.find({});
    let updatedCount = 0;
    
    for (let l of leaves) {
      let documentNeedsUpdate = false;
      let newSrNo = null;

      // Ensure proper extraction from various string inputs
      if (l.sr_no && typeof l.sr_no === 'string') {
        const num = Number(l.sr_no.trim());
        if (!isNaN(num) && l.sr_no.trim() !== '') {
          newSrNo = num;
          documentNeedsUpdate = true;
        }
      }

      if (!documentNeedsUpdate && l['Sr No']) {
        const num2 = Number(String(l['Sr No']).trim());
        if (!isNaN(num2) && String(l['Sr No']).trim() !== '') {
           newSrNo = num2;
           documentNeedsUpdate = true;
        }
      }

      // If document needs fixing, update directly via Mongoose using the schemaless model to avoid casting
      if (documentNeedsUpdate && newSrNo !== null) {
        await Leave.updateOne(
          { _id: l._id }, 
          { 
             $set: { sr_no: newSrNo },
             $unset: { 'Sr No': "", 'srNo': "", 'SrNo': "", 'SR_NO': "" } 
          }
        );
        updatedCount++;
      }
    }
    console.log(`CLOUD FIX: Successfully converted ${updatedCount} sr_no values in ATLAS.`);
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

run();
