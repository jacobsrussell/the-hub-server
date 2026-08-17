module.exports = {
  apps: [{
    name: 'the-hub',
    script: 'server.js',
    cwd: __dirname,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '256M',
    env: {
      NODE_ENV: 'production',
      HUB_PORT: 3000
    },
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    merge_logs: true,
    exp_backoff_restart_delay: 100
  }]
};
