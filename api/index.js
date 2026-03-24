const path = require('path');
const fs = require('fs');

// We simply require the existing server.js but we need to EXPORT the app
// Since server.js currently calls app.listen(), we might need a small adjustment there
// But Vercel's Node runtime can often handle Express apps that call listen() if we export them.

// However, a cleaner way is to separate the app from the listen call.
// Let's modify src/backend/server.js slightly to export the app.

const app = require('../src/backend/server.js');

module.exports = app;
