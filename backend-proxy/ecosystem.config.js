module.exports = {
  apps: [
    {
      name: "backend-proxy",
      script: "./dist/server.js",
      env: {
        NODE_ENV: "production"
      }
    },
    {
      name: "backend-proxy-ingester",
      script: "./dist/ingester.js",
      env: {
        NODE_ENV: "production"
      }
    }
  ]
}
