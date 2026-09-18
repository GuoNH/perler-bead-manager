// PM2 示例配置：复制为 ecosystem.config.js 后按本机环境填写。
// 真实配置包含本机路径和认证信息，不要提交。
module.exports = {
  apps: [
    {
      name: 'pinpin',
      script: 'backend/dist/server.js',
      cwd: process.env.PINPIN_HOME || process.cwd(),
      instances: 1,
      exec_mode: 'fork',
      env: {
        PORT: Number(process.env.PINPIN_PORT) || 3001,
        HOST: process.env.PINPIN_HOST || '0.0.0.0',
        NODE_ENV: 'production',
        AUTH_USER: process.env.AUTH_USER || 'admin',
        AUTH_PASS: process.env.AUTH_PASS || '',
      },
      env_ipv6: {
        PORT: Number(process.env.PINPIN_PORT) || 3001,
        HOST: '::',
        NODE_ENV: 'production',
        AUTH_USER: process.env.AUTH_USER || 'admin',
        AUTH_PASS: process.env.AUTH_PASS || '',
      },
      error_file: 'logs/pinpin-error.log',
      out_file: 'logs/pinpin-out.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '500M',
    },
    {
      name: 'pinpin-tunnel',
      script: process.env.CPOLAR_BIN || 'cpolar',
      args: 'http -region cn -log stdout -log-level info 3001',
      interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      error_file: 'logs/tunnel-error.log',
      out_file: 'logs/tunnel-out.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
};
