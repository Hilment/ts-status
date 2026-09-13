// TeamSpeak 在线人数查询脚本（通过 ts3.com.cn 面板 API 抓取）
// 适用于 ts3.com.cn / teamspeak3.cn 中文站的虚拟服务器
// 无需 ServerQuery 权限，直接通过控制台 API 获取数据

const fs = require('fs');
const path = require('path');

const CONFIG = {
  // 服务器 ID（从接口 URL 中获取，比如 bdeb380b）
  serverId: process.env.TS3CN_SERVER_ID || 'bdeb380b',
  // 登录 Cookie（从浏览器开发者工具中复制）
  cookie: process.env.TS3CN_COOKIE || '',
  // API 基础地址
  apiBase: process.env.TS3CN_API_BASE || 'https://ts3.com.cn/api',
};

const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'status.json');

async function main() {
  console.log('正在通过 ts3.cn 面板查询服务器信息...');
  console.log('服务器 ID: ' + CONFIG.serverId);

  if (!CONFIG.cookie) {
    console.error('错误: 未配置 TS3CN_COOKIE，请在 GitHub Secrets 中添加');
    process.exit(1);
  }

  let result;
  try {
    const data = await fetchServerInfo();
    result = {
      success: true,
      online: data.virtualserver_clientsonline || 0,
      max: data.virtualserver_maxclients || 0,
      serverName: data.virtualserver_name || 'Unknown',
      channels: data.virtualserver_channelsonline || 0,
      uptime: data.virtualserver_uptime || 0,
      status: data.virtualserver_status || 'unknown',
      port: data.virtualserver_port || 0,
      platform: data.virtualserver_platform || '',
      version: data.virtualserver_version || '',
      queryType: 'ts3cn-panel',
      host: 'vv.teamspeak3.cn',
      voicePort: data.virtualserver_port || 6517,
      queryTime: new Date().toISOString(),
    };

    console.log('✓ 查询成功: ' + result.online + '/' + result.max + ' 人在线');
    console.log('  服务器名: ' + result.serverName);
    console.log('  状态: ' + result.status);
    console.log('  频道数: ' + result.channels);

  } catch (error) {
    console.error('✗ 查询失败:', error.message);
    result = {
      success: false,
      error: error.message,
      queryTime: new Date().toISOString(),
      online: null,
      max: null,
      serverName: null,
      channels: null,
      uptime: null,
      status: null,
      port: null,
    };
  }

  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log('结果已写入 ' + OUTPUT_FILE);
}

async function fetchServerInfo() {
  const url = CONFIG.apiBase + '/servers/' + CONFIG.serverId + '/daemon/info';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': CONFIG.cookie,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://console.ts3.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      throw new Error('登录已过期（HTTP ' + response.status + '），请更新 TS3CN_COOKIE');
    }

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // 可能返回的是 HTML（比如登录页），说明 cookie 失效了
      if (text.includes('login') || text.includes('登录')) {
        throw new Error('Cookie 已失效，请重新获取登录 Cookie');
      }
      throw new Error('返回数据不是有效的 JSON');
    }

    // 检查是否有错误信息
    if (data.error || (data.code && data.code !== 0 && data.code !== 200)) {
      throw new Error(data.message || data.error || '接口返回错误');
    }

    // 如果数据在 data 字段里
    if (data.data && !data.virtualserver_id) {
      return data.data;
    }

    return data;

  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('请求超时');
    }
    throw e;
  }
}

main().catch(err => {
  console.error('脚本执行出错:', err);
  process.exit(1);
});
