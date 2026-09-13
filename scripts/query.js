// TeamSpeak 在线人数查询脚本（GitHub Actions 用）
// 支持多种查询方式：
//   1. ServerQuery 匿名查询（推荐，不需要密码）
//   2. ServerQuery 账号密码登录
//   3. WebQuery (HTTP API Key)
// 输出结果到 docs/status.json

const dgram = require('dgram');
const net = require('net');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  host: process.env.TS_HOST || 'vv.teamspeak3.cn',
  voicePort: parseInt(process.env.TS_VOICE_PORT || '6517', 10),
  queryPort: parseInt(process.env.TS_QUERY_PORT || '10011', 10),
  webQueryPort: parseInt(process.env.TS_WEBQUERY_PORT || '10080', 10),
  serverId: parseInt(process.env.TS_SERVER_ID || '1', 10),
  // 用语音端口选择虚拟服务器（比 serverId 更可靠，不知道 sid 时用这个）
  usePortSelect: (process.env.TS_USE_PORT_SELECT || 'true') === 'true',
  queryUser: process.env.TS_QUERY_USER || 'serveradmin',
  queryPass: process.env.TS_QUERY_PASS || '',
  apiKey: process.env.TS_API_KEY || '',
  useWebQuery: (process.env.TS_USE_WEBQUERY || 'false') === 'true',
};

const OUTPUT_FILE = path.join(__dirname, '..', 'docs', 'status.json');

async function main() {
  console.log(`正在查询 ${CONFIG.host}:${CONFIG.voicePort} ...`);
  console.log(`查询方式: ${CONFIG.useWebQuery ? 'WebQuery' : 'ServerQuery'}${CONFIG.queryPass ? '（已登录）' : '（匿名）'}`);

  let result;
  try {
    if (CONFIG.useWebQuery && CONFIG.apiKey) {
      result = await queryWebQuery();
    } else {
      result = await queryServerQuery();
    }

    result.queryTime = new Date().toISOString();
    result.host = CONFIG.host;
    result.voicePort = CONFIG.voicePort;
    result.success = true;

    console.log(`✓ 查询成功: ${result.online}/${result.max} 人在线`);
    console.log(`  服务器名: ${result.serverName}`);
    console.log(`  频道数: ${result.channels}`);
    console.log(`  查询方式: ${result.queryType}`);

  } catch (error) {
    console.error('✗ 查询失败:', error.message);
    result = {
      success: false,
      error: error.message,
      queryTime: new Date().toISOString(),
      host: CONFIG.host,
      voicePort: CONFIG.voicePort,
      online: null,
      max: null,
      serverName: null,
      channels: null,
      uptime: null,
    };
  }

  // 确保目录存在
  const dir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2));
  console.log(`结果已写入 ${OUTPUT_FILE}`);
}

// ========== WebQuery (HTTP) ==========
async function queryWebQuery() {
  const url = `http://${CONFIG.host}:${CONFIG.webQueryPort}/${CONFIG.serverId}/serverinfo`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      headers: { 'x-api-key': CONFIG.apiKey },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const body = data.body && data.body[0] ? data.body[0] : {};

    return {
      online: parseInt(body.virtualserver_clientsonline || '0', 10),
      max: parseInt(body.virtualserver_maxclients || '0', 10),
      serverName: body.virtualserver_name || 'Unknown',
      channels: parseInt(body.virtualserver_channelsonline || '0', 10),
      uptime: parseInt(body.virtualserver_uptime || '0', 10),
      queryType: 'webquery',
    };
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      throw new Error('WebQuery 连接超时');
    }
    throw e;
  }
}

// ========== ServerQuery (Raw TCP) ==========
// 支持匿名查询和登录查询两种模式
function queryServerQuery() {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let buffer = '';
    let step = 'connect';
    let timer = null;

    const cleanup = () => {
      clearTimeout(timer);
      try { client.destroy(); } catch (e) {}
    };

    const fail = (msg) => {
      cleanup();
      reject(new Error(msg));
    };

    const nextStep = (newStep, cmd) => {
      step = newStep;
      buffer = '';
      clearTimeout(timer);
      timer = setTimeout(() => fail(`${newStep} 步骤超时`), 5000);
      if (cmd) {
        client.write(cmd + '\n');
        console.log(`  → ${cmd.replace(/login\s+\S+\s+\S+/, 'login *** ***')}`);
      }
    };

    timer = setTimeout(() => fail('连接超时（请确认查询端口是否正确）'), 8000);

    client.connect(CONFIG.queryPort, CONFIG.host, () => {
      step = 'banner';
      clearTimeout(timer);
      timer = setTimeout(() => fail('等待服务器响应超时'), 5000);
    });

    client.on('data', (data) => {
      buffer += data.toString();

      // 步骤1: 等待 TS3 欢迎横幅
      if (step === 'banner') {
        if (buffer.includes('TS3')) {
          console.log('  已连接到 TS3 ServerQuery');
          if (CONFIG.queryPass) {
            // 有密码，先登录
            nextStep('login', `login ${CONFIG.queryUser} ${CONFIG.queryPass}`);
          } else {
            // 匿名查询，直接选择服务器
            console.log('  匿名模式，跳过登录');
            const useCmd = CONFIG.usePortSelect
              ? `use port=${CONFIG.voicePort}`
              : `use ${CONFIG.serverId}`;
            nextStep('use', useCmd);
          }
        }
        return;
      }

      // 步骤2: 登录（仅当有密码时）
      if (step === 'login') {
        if (buffer.includes('error id=0 msg=ok')) {
          console.log('  登录成功');
          const useCmd = CONFIG.usePortSelect
            ? `use port=${CONFIG.voicePort}`
            : `use ${CONFIG.serverId}`;
          nextStep('use', useCmd);
        } else if (buffer.includes('error id=')) {
          const m = buffer.match(/error id=(\d+) msg=([^\n\r]+)/);
          fail(`登录失败: ${m ? decodeTS3String(m[2]) : '未知错误'}`);
        }
        return;
      }

      // 步骤3: 选择虚拟服务器
      if (step === 'use') {
        if (buffer.includes('error id=0 msg=ok')) {
          console.log('  已选择虚拟服务器');
          nextStep('serverinfo', 'serverinfo');
        } else if (buffer.includes('error id=')) {
          const m = buffer.match(/error id=(\d+) msg=([^\n\r]+)/);
          const errMsg = m ? decodeTS3String(m[2]) : '未知错误';
          if (m && m[1] === '5') {
            fail(`选择服务器失败: 权限不足（${errMsg}）。试试设置 TS_QUERY_PASS 查询密码，或者在 TS 服务器上开启 Guest 组的 b_virtualserver_info_view 权限`);
          } else {
            fail(`选择服务器失败: ${errMsg}`);
          }
        }
        return;
      }

      // 步骤4: 获取 serverinfo
      if (step === 'serverinfo') {
        if (buffer.includes('error id=')) {
          clearTimeout(timer);

          const lines = buffer.split(/\r?\n/);
          let infoLine = '';
          for (const line of lines) {
            if (line.includes('virtualserver_clientsonline')) {
              infoLine = line;
              break;
            }
          }
          if (!infoLine) {
            for (const line of lines) {
              if (line.trim() && !line.startsWith('error ') && !line.includes('Welcome')) {
                infoLine = line;
                break;
              }
            }
          }

          // 检查是否有权限错误
          const errLine = lines.find(l => l.startsWith('error id='));
          if (errLine) {
            const m = errLine.match(/error id=(\d+) msg=([^\n\r]+)/);
            if (m && m[1] !== '0') {
              const errMsg = decodeTS3String(m[2]);
              console.log(`  serverinfo 返回错误: ${errMsg}`);
              if (m[1] === '2568') {
                fail(`权限不足，无法查看服务器信息。请在 TS 服务器中为 Guest 组开启 b_virtualserver_info_view 权限，或配置 TS_QUERY_PASS 查询密码`);
                return;
              }
            }
          }

          const parsed = parseTS3Line(infoLine);

          try {
            client.write('quit\n');
            client.end();
          } catch (e) {}
          cleanup();

          resolve({
            online: parseInt(parsed.virtualserver_clientsonline || '0', 10),
            max: parseInt(parsed.virtualserver_maxclients || '0', 10),
            serverName: decodeTS3String(parsed.virtualserver_name || 'Unknown'),
            channels: parseInt(parsed.virtualserver_channelsonline || '0', 10),
            uptime: parseInt(parsed.virtualserver_uptime || '0', 10),
            queryType: CONFIG.queryPass ? 'serverquery-loggedin' : 'serverquery-anonymous',
          });
        }
        return;
      }
    });

    client.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        fail(`连接被拒绝：${CONFIG.host}:${CONFIG.queryPort} 端口未开放，请确认 ServerQuery 端口是否正确`);
      } else if (err.code === 'ETIMEDOUT' || err.code === 'EHOSTUNREACH') {
        fail(`连接超时：无法到达 ${CONFIG.host}:${CONFIG.queryPort}，请检查地址和端口`);
      } else {
        fail(`连接错误: ${err.message}`);
      }
    });

    client.on('close', () => {
      clearTimeout(timer);
    });
  });
}

// 解析 TS3 key=value 格式行
function parseTS3Line(line) {
  const result = {};
  if (!line) return result;
  const pairs = line.split(' ');
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq > 0) {
      result[pair.substring(0, eq)] = pair.substring(eq + 1);
    }
  }
  return result;
}

// TS3 字符串转义解码
function decodeTS3String(str) {
  if (!str) return '';
  return str
    .replace(/\\s/g, ' ')
    .replace(/\\p/g, '|')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\v/g, '\v')
    .replace(/\\f/g, '\f')
    .replace(/\\\\/g, '\\');
}

main().catch(err => {
  console.error('脚本执行出错:', err);
  process.exit(1);
});
