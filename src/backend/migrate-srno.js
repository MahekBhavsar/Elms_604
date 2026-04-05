const mongoose = require('mongoose');

// Connect to the database
mongoose.connect('mongodb+srv://dpatel:2BHTl1e1B6XrtzH7@cluster0.n1y9k8o.mongodb.net/employeeDB')
  .then(() => console.log('Connected to MongoDB...'))
  .catch(err => console.error('Could not connect to MongoDB...', err));

const Leave = mongoose.model('Leave', new mongoose.Schema({}, { strict: false }));

async function run() {
  try {
    const leaves = await Leave.find({});
    let updatedCount = 0;
    
    for (let l of leaves) {
      let documentNeedsUpdate = false;
      let newSrNo = null;

      // Check standard sr_no
      if (l.sr_no && typeof l.sr_no === 'string') {
        const num = Number(l.sr_no.trim());
        if (!isNaN(num) && l.sr_no.trim() !== '') {
          newSrNo = num;
          documentNeedsUpdate = true;
        }
      }

      // Check alternate field "Sr No"
      if (!documentNeedsUpdate && l['Sr No']) {
        const num2 = Number(String(l['Sr No']).trim());
        if (!isNaN(num2) && String(l['Sr No']).trim() !== '') {
           newSrNo = num2;
           documentNeedsUpdate = true;
        }
      }

      if (documentNeedsUpdate && newSrNo !== null) {
        // Unset alternate keys and enforce sr_no as number
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
    console.log(`Successfully converted ${updatedCount} sr_no values to straight Numbers.`);
  } catch (error) {
    console.error('Error during migration:', error);
  } finally {
    mongoose.connection.close();
    process.exit(0);
  }
}

run();
