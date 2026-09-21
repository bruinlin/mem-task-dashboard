# MEM Dashboard V5 — 共享实时数据版

## 2026-09-21 作业二与共享留言

- 作业二现在有 5 个节点：9/22 框架与方向敲定、9/24 观点与案例补充、9/27 观点汇总与内容整理、9/30 展示材料初版、10/2 最后准备；Final DDL 仍为 10/3。
- `d1` 复用为已完成的框架确认，新增 `d1b` 保存全员补充阶段；页面共 12 个工作节点。
- 一次性迁移 `__migration_discussion_meeting_20260921_v1` 将 `d1` 的负责人设为钟润超、王玺、史圣田，状态设为已完成。条件更新防止覆盖同时发生的编辑，完成标记防止每次刷新重置。其他已有任务的手工分工和状态不变。
- 工作节点 DDL 为独立日期卡片：已完成绿色、逾期红色、未完成且剩余 0–3 天橙色，其余蓝色。Final DDL 使用 24px 粗体卡片；最近节点显示大日期和课程/作业。逾期未完成任务优先展示，避免被误报为全部完成。
- 手机布局将负责人、状态、DDL 分行展示，时间轴维持横向滚动。

### 必须额外执行的留言 SQL

已有项目只需在 Supabase SQL Editor 运行 **`migrations/20260921_dashboard_meta.sql`**，无需重跑旧的 task_state 建表/权限脚本。
该 migration 也追加在 `setup.sql` 末尾，供新项目完整安装使用。
它创建 `public.dashboard_meta(key,value,updated_at)`，添加匿名读取/插入/更新 RLS、Realtime publication 和空留言记录。
不修改现有 `task_state`，不覆盖已有留言，可重复执行。

2026-09-21 发布前检查：远端接口返回 PGRST205，说明当时新表尚不可用；没有声称 SQL 已在远端执行。
建表前重要留言会显示暂不可用，任务功能继续工作。执行 SQL 后点击“重试读取留言”或刷新。

### 留言行为与验证边界

`notice.js` 以 `important_notice` 为 key 存储共享正文；支持 10000 个字符，使用 `textContent` 和 `white-space: pre-wrap` 显示，保留换行且不执行 HTML。
编辑时保留本地草稿；保存使用原 `updated_at` 作条件，若其他人已更新则提示冲突而不覆盖。实时收到变更不会替换正在输入的草稿。支持保存空留言。
新表故障与任务同步分开处理，不使用 localStorage。

`node scripts/check-dashboard.cjs` 验证任务与留言的 DOM 交互、迁移、日期颜色和模拟同步。
`--live` 会执行真实任务迁移及同值条件写回，验证任务 Realtime 和第二页读取，并尝试初始化留言；真实留言读写需新表已部署才能验证。
当次任务快照保存在 `.verification/before-assignment-two.json`，不会提交。
DOM 测试不构成桌面浏览器或真机布局验收。

## 2026-09-20 排期更新

- 作业一使用 `m1 / m4 / m5 / m6 / m8`，共 5 个节点，Final DDL 为 10/1。
- 作业二使用 `d1–d4`，题目为“产学研如何深度融合”，Final DDL 为 10/3。
- 工程导论保留 2 个节点；页面合计 3 个主任务、11 个工作节点。
- 时间轴为 9/22–10/11，日期格数量及节点位置根据起止日期计算。

### 旧数据迁移

初始化时先运行负责人迁移，再补齐缺失任务，最后重新读取数据库。
只有负责人仍与旧默认值完全相同的记录才更新为新默认值。
更新请求同时匹配 `task_id`、原负责人数组和读取时的 `updated_at`，防止覆盖读取之后发生的网页修改。
不修改已有状态；新建任务的初始状态为“未开始”。

迁移成功后，在现有 `task_state` 中插入内部标记
`__migration_modernization_20260920_v1`（`owners=[]`、`status=已完成`）。
它不参与页面展示、统计或最近节点。所有设备读取同一标记，避免以后将用户改回旧默认值的选择再次迁移。
迁移失败不写标记，可在下次加载时重试。`m2 / m3 / m7` 保留在数据库，但不再展示。
缺失任务使用 `ignoreDuplicates` 初始化，不覆盖已有记录。

当前表没有编辑历史，因此无法区分“从未修改过的旧默认值”和“用户手工改回的同一值”；按当前值比较处理。
迁移不修改配置、表结构、权限或 Realtime 设置。

### 验证

本地测试依赖仅安装在已被 Git 忽略的 `.verification/`，不参与网站运行：

```powershell
npm install --prefix .verification --cache .verification/npm-cache --no-save --package-lock=false jsdom
node scripts/check-dashboard.cjs
```

测试覆盖迁移的手工值保留、并发更新、重复执行、失败处理，多选菜单、状态保存提示、统计和日期。
DOM 测试不等于真实浏览器布局或手机验证。

`node scripts/check-dashboard.cjs --live` 会连接配置中的真实数据库，执行初始化/迁移并做一次同值条件写回以验证 Realtime。
它在 `.verification/before-migration.json` 保存当次测试前的快照；该文件不上传。

## 本版变化

- 删除“组长”这个负责人选项。
- 原来所有“组长”任务直接改为 **周圣昌**。
- 负责人和状态不再保存在单台电脑的 localStorage。
- 使用 **Supabase** 作为共享数据源。
- 任意设备刷新页面都会读取最新任务状态。
- 页面保持打开时，也会通过 Supabase Realtime 自动接收变更。
- 前端仍是纯 HTML/CSS/JS，可继续放在 GitHub Pages。

## 文件

- `index.html`：Dashboard
- `config.js`：填写 Supabase URL 和 publishable key
- `setup.sql`：在 Supabase SQL Editor 执行一次

## 一次性配置

### 1. 创建 Supabase 项目

进入 Supabase，新建一个 project。

### 2. 建表

打开 Supabase -> SQL Editor，把 `setup.sql` 全部复制进去执行。

### 3. 获取浏览器端配置

在 Supabase 项目的 API 设置里找到：

- Project URL
- Publishable key（或 legacy anon key）

打开 `config.js`，替换：

```js
window.MEM_CONFIG = {
  SUPABASE_URL: "...",
  SUPABASE_KEY: "..."
};
```

不要使用 `service_role` key。

### 4. 本地测试

由于浏览器对 `file://` 页面加载外部脚本可能有限制，推荐在目录里启动本地服务器：

```bash
python -m http.server 8000
```

然后打开：

`http://localhost:8000`

看到右上角“已同步”即成功。

### 5. Push 到 GitHub Pages

把 `index.html`、`config.js` 一起 push 到现有 GitHub repo。

之后所有人打开同一个 GitHub Pages URL，看到的是同一份共享数据。

## 数据同步逻辑

- 页面打开：从 Supabase 读取最新负责人 + 状态
- 修改负责人：立即 upsert 到 `task_state`
- 修改状态：立即 upsert 到 `task_state`
- 其他已打开页面：Realtime 接收更新并刷新界面
- 新打开/刷新页面：重新从数据库读取最新状态
