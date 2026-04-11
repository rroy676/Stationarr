module.exports = {
  apps: [
    {
      name: 'stationarr',
      script: './backend/src/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
      env_file: '.env',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
