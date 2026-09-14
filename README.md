# 微信一键查询 TS 在线人数（GitHub 纯免费版）

> 适配TeamSpeak 服务器

**完全免费，只需一个 GitHub 账号。** GitHub Actions 每 5 分钟自动查询人数，GitHub Pages 展示结果。微信里打开链接收藏后一点即查。

---

## ✨ 亮点：不需要查询密码！

默认使用 **ServerQuery 匿名查询**，不需要 serveradmin 密码。只要 TS 服务器的 Guest 组开启了 `b_virtualserver_info_view` 权限（很多服务器默认开启），就能直接查到人数。

如果匿名不行，再配置查询密码也来得及。

---

## 部署步骤（5 分钟搞定）

### 第 1 步：创建 GitHub 仓库

1. 登录 GitHub，点右上角 **+** → **New repository**
2. 仓库名随便填（比如 `ts-status`），选 **Public**
3. 点 **Create repository**

### 第 2 步：上传代码

1. 解压 `ts-query-github.zip`
2. 把里面所有文件（包括 `.github`、`docs`、`scripts` 文件夹）上传到仓库根目录
   - 可以直接拖拽文件到 GitHub 网页上传

### 第 3 步：配置 Secrets（密钥）

1. 仓库页面点 **Settings**
2. 左侧 **Secrets and variables** → **Actions**
3. 点 **New repository secret**，添加以下 Secret（先加必填的，其他默认就行）：

| Secret 名称 | 必填 | 说明 | 你的值 |
|-------------|------|------|--------|
| `TS_HOST` | ✅ | 服务器地址 | `vv.teamspeak3.cn` |
| `TS_VOICE_PORT` | ✅ | 语音端口 | `6517` |
| `TS_QUERY_PORT` | - | ServerQuery 端口，默认 10011 | `10011` |
| `TS_USE_PORT_SELECT` | - | 用端口选服务器，默认 true | `true` |
| `TS_QUERY_PASS` | - | 查询密码（匿名不需要，先不填） | （留空） |

> 💡 **先不填 TS_QUERY_PASS**，试试匿名查询能不能行。如果不行再填。

### 第 4 步：手动运行测试

1. 点顶部 **Actions** 标签
2. 左侧选 **TS Status Query**
3. 点右边 **Run workflow** → 再点 **Run workflow**
4. 等几十秒，看运行状态：
   - ✅ 绿色 = 成功，继续下一步
   - ❌ 红色 = 失败，点进去看日志，把错误发我帮你调

### 第 5 步：开启 GitHub Pages

1. 点 **Settings** → 左侧 **Pages**
2. **Source** 选 **Deploy from a branch**
3. **Branch** 选 `main` 分支，目录选 `/docs`
4. 点 **Save**
5. 等 1-2 分钟，页面上方会显示你的网址（类似 `https://你的用户名.github.io/ts-status/`）

### 第 6 步：微信里用

1. 复制上面的 GitHub Pages 网址
2. **微信发给自己**（文件传输助手）
3. 点开链接 → 右上角「...」→「收藏」
4. 以后从微信「收藏」里一键打开就能看人数！

---

## 文件结构

```
ts-query-github/
├── .github/workflows/query.yml   ← 定时任务（每5分钟自动查询）
├── docs/
│   ├── index.html                ← 展示页面（毛玻璃风格）
│   └── status.json               ← 查询结果（Actions 自动更新）
├── scripts/query.js              ← 查询脚本（支持匿名/登录/WebQuery）
└── README.md                     ← 说明文档
```

---

## 支持的查询方式

### 方式 1：ServerQuery 匿名查询（默认，推荐）

- 不需要查询密码
- 用 `use port=语音端口` 选择服务器（不用知道 sid）
- 需要服务器 Guest 组有 `b_virtualserver_info_view` 权限
- 大多数 TS 服务器默认支持

### 方式 2：ServerQuery 账号密码登录

- 填了 `TS_QUERY_PASS` 就自动用这种方式
- 需要 serveradmin 查询密码
- 权限更高，信息更全

### 方式 3：WebQuery (HTTP)

- 填了 `TS_USE_WEBQUERY=true` 和 `TS_API_KEY` 就用这种方式
- TS6 推荐，TS3.12+ 也支持
- 需要 API Key

---

## 常见问题

**Q: Actions 运行失败，提示"连接超时"怎么办？**
- 可能 ServerQuery 端口不是 10011，在 ts3.com.cn 面板里找一下正确的查询端口
- 也可能服务器防火墙拦了 GitHub Actions 的 IP（概率较低）

**Q: 提示"权限不足"怎么办？**
- 匿名查询权限不够，需要配置 `TS_QUERY_PASS` 查询密码
- 或者在 TS 服务器里给 Guest 组加上 `b_virtualserver_info_view` 权限

**Q: 多久更新一次？**
- 默认每 5 分钟。想改的话编辑 `.github/workflows/query.yml` 里的 cron 表达式

**Q: 朋友也能用吗？**
- 把 GitHub Pages 链接发给他，微信里打开就能看

**Q: 怎么确认匿名查询行不行？**
- 先不填 `TS_QUERY_PASS`，跑一次 Actions 看结果
- 如果成功了就不用管了，如果失败了再填密码
