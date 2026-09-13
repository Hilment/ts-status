// TeamSpeak 在线人数查询脚本（通过 ts3.com.cn 面板 API 抓取）
// 自动登录版：每次运行自动用账号密码登录，无需手动维护 Cookie
// 适用于 ts3.com.cn / teamspeak3.cn 中文站的虚拟服务器

const fs = require('fs');
const path = require('path');

const CONFIG = {
  serverId: process.env.TS3CN_SERVER_ID || 'bdeb380b',
  email: process.env.TS3CN_EMAIL || '',
  password: process.env.TS3CN_PASSWORD || '',
  apiBase: 'https://ts3.com.cn',
  loginUrl: 'https://ts3.com.cn/login',
  apiUrl: 'https://ts3.com.cn/api/servers',
};

const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'status.json');

async function main() {
  console.log('=== TS 在线人数查询（自动登录版）===');
  console.log('服务器 ID: ' + CONFIG.serverId);

  if (!CONFIG.email || !CONFIG.password) {
    console.error('错误: 未配置 TS3CN_EMAIL 或 TS3CN_PASSWORD');
    process.exit(1);
  }

  let result;
  try {
    // 第一步：自动登录获取 Cookie
    console.log('正在自动登录 ts3.com.cn ...');
    const cookies = await autoLogin();
    console.log('✓ 登录成功，已获取有效 Cookie');

    // 第二步：用登录后的 Cookie 查询服务器信息
    console.log('正在查询服务器信息...');
    const data = await fetchServerInfo(cookies);

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
      queryType: 'ts3cn-autologin',
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

// 自动登录：GET /login 获取 XSRF-TOKEN，然后 POST /login 登录
async function autoLogin() {
  // 第一步：GET /login 获取初始 Cookie（XSRF-TOKEN + teamspeak_session）
  const loginPageRes = await fetch(CONFIG.loginUrl, {
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  const setCookies1 = loginPageRes.headers.getSetCookie?.() || parseSetCookie(loginPageRes.headers.get('set-cookie') || '');
  let xsrfToken = '';
  let sessionCookie = '';

  for (const c of setCookies1) {
    if (c.startsWith('XSRF-TOKEN=')) {
      xsrfToken = decodeURIComponent(c.split(';')[0].substring('XSRF-TOKEN='.length));
    }
    if (c.startsWith('teamspeak_session=')) {
      sessionCookie = c.split(';')[0];
    }
  }

  if (!xsrfToken) {
    throw new Error('登录失败: 无法获取 XSRF-TOKEN');
  }

  console.log('  已获取 XSRF-TOKEN，正在提交登录...');

  // 第二步：POST /login 用账号密码登录
  const loginRes = await fetch(CONFIG.loginUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'X-XSRF-TOKEN': xsrfToken,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://ts3.com.cn/login',
      'Origin': 'https://ts3.com.cn',
      'Cookie': 'XSRF-TOKEN=' + encodeURIComponent(xsrfToken) + '; ' + sessionCookie,
    },
    body: JSON.stringify({
      user: CONFIG.email,
      password: CONFIG.password,
      remember: true,
    }),
  });

  // 获取登录后的新 Cookie
  const setCookies2 = loginRes.headers.getSetCookie?.() || parseSetCookie(loginRes.headers.get('set-cookie') || '');
  let newXsrf = '';
  let newSession = '';

  for (const c of setCookies2) {
    if (c.startsWith('XSRF-TOKEN=')) {
      newXsrf = c.split(';')[0];
    }
    if (c.startsWith('teamspeak_session=')) {
      newSession = c.split(';')[0];
    }
  }

  // 优先使用新 Cookie，没有就用旧的
  const finalXsrf = newXsrf || ('XSRF-TOKEN=' + encodeURIComponent(xsrfToken));
  const finalSession = newSession || sessionCookie;
  const cookieStr = finalXsrf + '; ' + finalSession;

  // 检查登录是否成功
  // Laravel 登录成功通常返回 200 + redirect 信息，或者 201
  // 登录失败返回 422（验证错误）或 401
  if (loginRes.status === 422) {
    const errorData = await loginRes.json().catch(() => ({}));
    const msg = errorData.message || errorData.errors?.user?.[0] || '账号或密码错误';
    throw new Error('登录失败: ' + msg);
  }

  if (loginRes.status === 401) {
    throw new Error('登录失败: 账号或密码错误');
  }

  if (!loginRes.ok && loginRes.status !== 200 && loginRes.status !== 201 && loginRes.status !== 302) {
    throw new Error('登录失败: HTTP ' + loginRes.status);
  }

  // 检查返回内容，确认登录成功
  const loginText = await loginRes.text();
  // 如果返回了登录页 HTML，说明没登录成功
  if (loginText.includes('"message"') && loginText.includes('errors')) {
    try {
      const err = JSON.parse(loginText);
      if (err.errors) {
        throw new Error('登录失败: ' + (err.message || JSON.stringify(err.errors)));
      }
    } catch (e) {
      if (e.message.startsWith('登录失败')) throw e;
    }
  }

  // 检查是否获得了有效的 session cookie
  if (!finalSession || finalSession.includes('teamspeak_session=')) {
    console.log('  登录响应状态: ' + loginRes.status);
  }

  return cookieStr;
}

// 用登录后的 Cookie 查询服务器信息
async function fetchServerInfo(cookieStr) {
  const url = CONFIG.apiUrl + '/' + CONFIG.serverId + '/daemon/info';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cookie': cookieStr,
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://console.ts3.com.cn/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 401 || response.status === 403) {
      throw new Error('登录后仍无权限（HTTP ' + response.status + '），请检查账号是否有服务器权限');
    }

    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ' ' + response.statusText);
    }

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      if (text.includes('login') || text.includes('登录')) {
        throw new Error('登录失败: 账号或密码错误');
      }
      throw new Error('返回数据不是有效的 JSON');
    }

    if (data.error || (data.code && data.code !== 0 && data.code !== 200)) {
      throw new Error(data.message || data.error || '接口返回错误');
    }

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

// 解析 Set-Cookie 头（兼容不支持 getSetCookie 的环境）
function parseSetCookie(header) {
  if (!header) return [];
  // Node.js 的 fetch 可能返回单个字符串或数组
  if (Array.isArray(header)) return header;
  // 单个 Set-Cookie 头，多个 cookie 用换行或逗号分隔
  // 但 cookie 内部可能有逗号，这里简化处理
  return [header];
}

main().catch(err => {
  console.error('脚本执行出错:', err);
  process.exit(1);
});
