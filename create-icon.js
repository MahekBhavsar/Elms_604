const { default: pngToIco } = require('png-to-ico');
const fs = require('fs');
const path = require('path');

pngToIco(path.join(__dirname, 'electron', 'icon.png'))
  .then(buf => {
    fs.writeFileSync(path.join(__dirname, 'electron', 'icon.ico'), buf);
    console.log('✅ icon.ico created successfully!');
  })
  .catch(err => {
    console.error('❌ Failed to create icon.ico:', err.message);
  });
