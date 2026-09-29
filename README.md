# ts-status

查询 TeamSpeak 服务器在线人数，并发布成网页。

## 这个项目怎么工作

```
GitHub Actions（每 20 分钟）
      ↓ 运行 scripts/query.js
自动登录 ts3.com.cn → 抓取 /daemon/info
      ↓ 写入
docs/status.json
      ↓ git commit + push
GitHub Pages 重新构建
      ↓ 前端轮询读取
docs/index.html  显示在线人数
```

## 为什么不用 5 分钟一次

原来的配置是 `cron: '*/5 * * * *'`，这是 GitHub Actions 允许的**最短**间隔。
实际跑下来，15.8 天里 99 个相邻间隔：

| 指标 | 数值 |
| --- | --- |
| 中位间隔 | 3.79 小时 |
| 平均间隔 | 3.83 小时 |
| 最长空档 | 8.69 小时 |
| 达成率 | 2.2%（100 次 / 应有的 4552 次） |
| 小于 1 小时的间隔 | 0 次 |

也就是说「每 5 分钟」这句话在 GitHub 的免费托管 runner 上基本是不成立的。
官方文档里写得很直接：

> The `schedule` event can be delayed during periods of high loads of GitHub Actions
> workflow runs. High load times include the start of every hour. **If the load is
> sufficiently high enough, some queued jobs may be dropped.**
> To decrease the chance of delay, schedule your workflow to run at a different time of the hour.

`*/5` 恰好每一拍都踩在整点上（分钟位是 0/5/10/.../55），踩中了负载最高的时刻，
所以丢拍最严重。注意**是丢弃，不是延后**。

现在的配置改成 `7,27,47 * * * *`：频率降到 20 分钟，分钟位错开整点。
标称数字看起来变慢了，但因为旧配置有 95% 的间隔大于 2 小时，
实际效果是「从平均 3.8 小时更新一次」变成「稳定 20 分钟更新一次」。

## 需要配置的 Secrets

在仓库 Settings → Secrets and variables → Actions 里配置：

| Secret | 说明 |
| --- | --- |
| `TS3CN_SERVER_ID` | ts3.com.cn 上的服务器 ID，如 `bdeb380b` |
| `TS3CN_EMAIL` | ts3.com.cn 登录账号 |
| `TS3CN_PASSWORD` | ts3.com.cn 登录密码 |

## 可选环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `TS3CN_RETRY` | `3` | 单次任务内的重试次数（指数退避） |

## 开启 Pages

Settings → Pages → Source 选 `Deploy from a branch`，
分支选 `main`，目录选 `/docs`。

## 注意

- **不要把 GitHub PAT 写进 `docs/index.html`。** 这个仓库是公开的，写在网页源码里的
  token 任何人查看源代码都能拿到。前端只需要读 `status.json`，不需要任何 token，
  触发更新是 Actions 定时任务自己的事。
- 工作流只在**默认分支**上生效，请确保改动合并到 `main`。
- 公共仓库超过 60 天无活动时，GitHub 会自动停掉定时任务。
  工作流里用 `.last_update` 时间戳文件保持仓库活跃来规避这一点。
