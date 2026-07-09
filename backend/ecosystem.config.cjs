module.exports = {
  apps: [
    {
      name: "test-mgmt-backend",
      script: "server.js",
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 2000,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
