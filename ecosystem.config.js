// pm2 生态系统配置文件
// 使用:
//   pm2 start ecosystem.config.js                # IPv4 模式
//   pm2 start ecosystem.config.js --env ipv6     # IPv6 模式
//   pm2 startup && pm2 save                      # 开机自启
module.exports = {
  apps: [{
    name: 'pinpin',
    script: 'backend/dist/index.js',
    cwd: '/Users/congqiuqiudaren/codes/perler-bead-manager',
    instances: 1,
    // IPv4 模式（默认）
    env: {
      PORT: 3001,
      HOST: '0.0.0.0',
      NODE_ENV: 'production'
    },
    // IPv6 模式： pm2 start ecosystem.config.js --env ipv6
    env_ipv6: {
      PORT: 3001,
      HOST: '::',
      NODE_ENV: 'production'
    },
    // 日志配置
    error_file: 'logs/pinpin-error.log',
    out_file: 'logs/pinpin-out.log',
    merge_logs: true,
    // 自动重启
    max_restarts: 10,
    restart_delay: 3000,
    // 内存限制（超过则重启）
    max_memory_restart: '500M',
  }]
};