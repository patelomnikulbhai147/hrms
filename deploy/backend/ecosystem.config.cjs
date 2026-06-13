// PM2 process manager config for the HRMS backend.
//   Start:   pm2 start ecosystem.config.cjs
//   Reload:  pm2 reload hrms-backend   (zero-downtime)
//   Logs:    pm2 logs hrms-backend
//
// NOTE on mode: cluster mode load-balances across CPU cores for throughput, but
// each worker is a full Node process (~150-250MB) and this API accepts large
// base64 payloads (100MB JSON limit). On a small/micro instance keep ONE fork
// worker. On a 2+ vCPU instance with >=4GB RAM, switch to cluster:
//   exec_mode: 'cluster', instances: 'max'
module.exports = {
  apps: [
    {
      name: 'hrms-backend',
      script: 'server.js',
      cwd: '/home/ubuntu/enterprise-hrms/backend',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      max_memory_restart: '600M', // restart a worker if it leaks past this
      env: {
        NODE_ENV: 'production',
      },
      error_file: '/home/ubuntu/logs/hrms-backend-error.log',
      out_file: '/home/ubuntu/logs/hrms-backend-out.log',
      time: true, // prefix log lines with timestamps
    },
  ],
};
