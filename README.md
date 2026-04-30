# 🐉 hs-data-scraper

> 炉石传说元数据自动抓取工具 — 每天自动从 hsreplay.net 抓取天梯和酒馆战棋数据，生成可直接导入微信小程序云数据库的 JSON 文件。

## 功能

| 数据类型 | 覆盖内容 | 输出文件 |
|---------|---------|---------|
| **标准天梯** | 卡组类型名称、胜率（钻石4-1 / 传说前1000）、场次 | `output/ladder_deck_types.json` |
| **酒馆战棋·英雄** | 英雄名称、护甲、平均排名、选取率（Top50% / Top20%） | `output/battlegrounds_data.json` |
| **酒馆战棋·饰品** | 饰品名称、费用、大小饰品、平均排名、选取率 | 同上 |
| **酒馆战棋·种族** | 种族名称、中英文、平均排名、选取率、首杀率 | 同上 |
| **酒馆战棋·阵容** | 🔜 后续实现 | — |

## 运行方式

### 本地调试

```bash
npm install
npx playwright install --with-deps chromium

# 抓取全部数据
npm run scrape

# 单独抓取天梯
npm run scrape:ladder

# 单独抓取酒馆战棋
npm run scrape:bg
```

### 自动运行（推荐）

项目部署到 GitHub 后，每天 **北京时间 08:05** 自动运行，无需 VPS 或本地电脑。

1. Push 到 GitHub
2. GitHub Actions 会自动按 schedule 执行
3. 产出的 JSON 文件在 Actions Artifacts 中下载

## 数据导入小程序

抓取的 JSON 文件格式与小程序云函数完全匹配：

```
ladder_deck_types.json   → 导入到云数据库 deck_types 集合
battlegrounds_data.json   → 导入到 bg_heroes / bg_trinkets / bg_races 集合
```

导入方式：
- 微信开发者工具 → 云开发控制台 → 数据库 → 选择集合 → 导入 JSON

## 数据结构

### deck_types（标准天梯卡组类型）

```json
{
  "_id": "deck_type_龙战",
  "name": "龙战",
  "class": "WARRIOR",
  "className": "战士",
  "classIcon": "/assets/icons/warrior_11.png",
  "variantCount": 2,
  "winRate": {
    "diamond": 54.5,
    "legend_top1000": 53.1
  },
  "games": {
    "diamond": 56000,
    "legend_top1000": 22000
  }
}
```

### bg_heroes（酒馆战棋英雄）

```json
{
  "id": "HERO_07",
  "name": "格雷布·帕克",
  "text": "战吼：在本回合中，你每有一张手牌，便获得+1攻击力。",
  "armor": 5,
  "top50": {
    "avgPlace": 4.2,
    "pickRate": 0.085
  },
  "top20": {
    "avgPlace": 3.8,
    "pickRate": 0.072
  }
}
```

## 技术方案

- **Playwright + Stealth 插件**：绕过 Cloudflare Bot 检测
- **双段数据合并**：钻石4-1 和 传说前1000 分别抓取后合并
- **多选择器兜底**：同一字段尝试多种 CSS 选择器，兼容页面结构变化
- **GitHub Actions**：免费 CI，每天定时运行，无需自建服务器

## 常见问题

**Q: Cloudflare 拦截怎么办？**
A: `playwright-extra` 的 Stealth 插件会自动模拟浏览器指纹。如持续拦截，检查 Actions 日志中的截图。

**Q: 页面结构变了抓不到数据？**
A: 在 `src/ladder.js` 或 `src/battlegrounds.js` 中调整 CSS 选择器，参考文件中的 `rowSelectors` 数组。

**Q: GitHub Actions 免费版有分钟数限制吗？**
A: 有，2000 分钟/月。抓取脚本每次运行约 3-5 分钟，远低于限额。

## License

MIT
