# MEM Dashboard V5 — 共享实时数据版

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
