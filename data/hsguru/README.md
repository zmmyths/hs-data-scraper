# HSGuru 天梯抓取结果（本地暂存）

- 来源：https://www.hsguru.com/meta
- 抓取时间：见各 JSON 内 `scraped_at`
- 最低场次：`min_games=50`
- **暂未上传 Google Drive，暂不同步小程序**

## 主文件

`hsguru_ladder_36.6.3_standard_and_wild_past_week.json`

包含：

### 标准（period = patch_36.6.3）
- 钻4-钻1 (`diamond_4to1`)
- 传说 (`legend`)
- 传说前5000 (`top_5k`)
- 传说前1000 (`top_1000`，对应站点 `top_legend`)

### 狂野（period = past_week，最近七天）
- 同上四个分段

每个分段含字段：
- `winrate` 胜率
- `popularity_pct` / `games` 热度
- `climbing_speed` 上分速度（⭐/h）
- 以及 `sorted_by_winrate` / `sorted_by_popularity` / `sorted_by_climbing_speed` 三个排序视图

分文件：`standard_*.json` / `wild_*.json`
截图：`screenshots/`
