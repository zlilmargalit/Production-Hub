module.exports = {
  apps: [
    {
      name: 'production-server',
      script: './server/index.js',
      cwd: '/Users/zlilmargalit/Desktop/Production-Hub',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
