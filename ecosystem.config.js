module.exports = {
  apps: [
    {
      name: "elms-backend",
      script: "src/backend/server.js",
      watch: true
    },
    {
      name: "elms-frontend",
      script: "./node_modules/@angular/cli/bin/ng.js",
      args: "serve"
    }
  ]
};
