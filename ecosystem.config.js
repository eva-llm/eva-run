module.exports = {
  apps: [
    {
      name: 'server',
      script: './dst/server.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      env: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'worker',
      script: './dst/control/ch.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      kill_timeout: 10000, 
      env: {
        NODE_ENV: 'production',
      }
    }
  ]
};
