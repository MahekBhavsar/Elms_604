const mongoose = require('mongoose');

async function syncLocalToAtlas() {
  const localConn = mongoose.createConnection('mongodb://127.0.0.1:27017/employeeDB');
  const atlasConn = mongoose.createConnection('mongodb+srv://mahekbhavsar29_db_user:Hopeu33dSs0e6zUH@cluster0.0xfniym.mongodb.net/employeeDB');

  const LocalLeave = localConn.model('Leave', new mongoose.Schema({}, { strict: false }), 'leave_applications');
  const AtlasLeave = atlasConn.model('Leave', new mongoose.Schema({}, { strict: false }), 'leave_applications');

  const docs = await LocalLeave.find({ Emp_CODE: 109, 'Type of Leave': 'CL' }).lean();
  let pushedCount = 0;
  
  for (let doc of docs) {
    const existing = await AtlasLeave.findOne({ _id: doc._id }).lean();
    if (!existing) {
      await AtlasLeave.collection.insertOne(doc);
      pushedCount++;
    } else {
      if (typeof doc.sr_no === 'number') {
         await AtlasLeave.updateOne({ _id: doc._id }, { $set: { sr_no: doc.sr_no }});
      }
    }
  }
  
  console.log('SYNC: Pushed ' + pushedCount + ' missing document(s) from local to Atlas!');
  process.exit();
}
syncLocalToAtlas();
