module.exports = {
  apps: [
    {
      name: 'finanstakip-api',
      cwd: '/var/www/finanstakip/packages/backend',
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '400M',
      error_file: '/var/log/finanstakip/err.log',
      out_file: '/var/log/finanstakip/out.log',
      time: true,
    },
  ],
};
