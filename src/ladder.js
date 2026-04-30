/**
 * ladder.js — 标准天梯卡组类型数据抓取
 * 数据源: https://hsreplay.net/meta/
 * 输出: output/ladder_deck_types.json（直接匹配云函数 importTodayData 的 deck_types 集合格式）
 *
 * 抓取字段（每个卡组类型）:
 *   - name           卡组名称（中文）
 *   - class          职业代码（WARRIOR / MAGE / ...）
 *   - className      职业中文名
 *   - classIcon      职业图标路径
 *   - winRate        { diamond, legend_top1000 } 胜率对象
 *   - games          { diamond, legend_top1000 } 场次对象
 */

const fs = require('fs')
const path = require('path')
const { launchBrowser, gotoWithRetry, sleep } = require('./browser')

const OUTPUT_FILE = path.join(__dirname, '..', 'output', 'ladder_deck_types.json')

// ── 职业映射表（必须与小程序的 CLASS_MAP 完全一致）─────────────────────────────
const CLASS_MAP = {
  DRUID:     { name: '德鲁伊',     icon: 'druid_22.png' },
  HUNTER:    { name: '猎人',       icon: 'hunter_4.png' },
  MAGE:      { name: '法师',       icon: 'mage_13.png' },
  PALADIN:   { name: '圣骑士',     icon: 'paladin_10.png' },
  PRIEST:    { name: '牧师',       icon: 'priest_12.png' },
  ROGUE:     { name: '潜行者',     icon: 'rogue_8.png' },
  SHAMAN:    { name: '萨满',       icon: 'shaman_5.png' },
  WARLOCK:   { name: '术士',       icon: 'warlock_21.png' },
  WARRIOR:   { name: '战士',       icon: 'warrior_11.png' },
  DEMONHUNTER: { name: '恶魔猎手', icon: 'demonhunter_21.png' },
  DEATHKNIGHT: { name: '死亡骑士', icon: 'deathknight.png' },
}

// 从卡组名推断职业（兜底逻辑）
const CLASS_KEYWORDS = {
  DRUID:     ['德', '树', '嫩草', '滋选', 'barkskin', 'wrath', 'moonkin', 'druid'],
  HUNTER:    ['猎', '奥秘猎', 'T7', 't7', 'beast', 'hunter'],
  MAGE:      ['法', '奥秘法', '冰法', '任务法', '巨龙', 'mage'],
  PALADIN:   ['骑', '圣骑', '光铸', '圣盾', 'paladin'],
  PRIEST:    ['牧', '暗牧', '任务牧', 'priest'],
  ROGUE:     ['贼', '潜行', '奥秘贼', '任务贼', 'rogue'],
  SHAMAN:    ['萨', '战吼', '萨满', 'shaman'],
  WARLOCK:   ['术', '动物园', '任务术', 'warlock'],
  WARRIOR:   ['战', '战士', '龙战', '海盗战', '激怒战', 'warrior'],
  DEMONHUNTER: ['瞎', '恶魔', '蛋', 'dh', 'demon'],
  DEATHKNIGHT: ['dk', '死骑', '死', 'deathknight', 'knight'],
}

function inferClass(deckName) {
  for (const [cls, keywords] of Object.entries(CLASS_KEYWORDS)) {
    if (keywords.some(k => deckName.includes(k))) return cls
  }
  return null
}

// ── 解析页面的卡组类型表格 ────────────────────────────────────────────────────
/**
 * 从 hsreplay.net/meta/ 页面抓取所有卡组数据
 * 支持多种 CSS 选择器（页面结构可能随版本变化）
 */
async function scrapeDeckTypes(page) {
  const results = []

  // 等待表格加载
  await page.waitForSelector('table', { timeout: 20000 }).catch(() => {
    console.warn('[ladder] 未找到表格，尝试其他选择器')
  })

  // 尝试多种行选择器
  const rowSelectors = [
    'tbody tr[data-deck-id]',
    'table tbody tr',
    '.deck-list tbody tr',
    '[class*="deck-row"]',
    'tr[class*="deck"]',
  ]

  let rows = []
  for (const sel of rowSelectors) {
    rows = await page.$$(sel)
    if (rows.length > 0) {
      console.log(`[ladder] 使用选择器: ${sel}，找到 ${rows.length} 行`)
      break
    }
  }

  for (const row of rows) {
    try {
      // 尝试提取：名称、胜率（钻石/传说）、场次
      const name = await extractCell(row, ['.deck-name', '.name', '[class*="name"]', 'td:first-child'])
      const winRateDiamond = await extractCell(row, ['.wr-diamond', '.winrate-diamond', '[data-segment="diamond"]'])
      const winRateLegend = await extractCell(row, ['.wr-legend', '.winrate-legend', '[data-segment="legend"]'])
      const gamesDiamond = await extractCell(row, ['.games-diamond', '.games-diamond'])
      const gamesLegend = await extractCell(row, ['.games-legend', '.games-legend'])

      if (!name || name.trim() === '') continue

      const cls = inferClass(name) || 'WARRIOR'
      const classInfo = CLASS_MAP[cls]

      // 解析数值（去掉 % 和逗号）
      const wrD = parseFloat((winRateDiamond || '0').replace('%', '').replace(',', '')) || 0
      const wrL = parseFloat((winRateLegend || winRateDiamond || '0').replace('%', '').replace(',', '')) || 0
      const gmD = parseInt((gamesDiamond || '0').replace(/,/g, ''), 10) || 0
      const gmL = parseInt((gamesLegend || '0').replace(/,/g, ''), 10) || 0

      results.push({
        _id: `deck_type_${name.replace(/\s+/g, '_').replace(/[^\w\u4e00-\u9fa5]/g, '')}`,
        name: name.trim(),
        class: cls,
        className: classInfo.name,
        classIcon: `/assets/icons/${classInfo.icon}`,
        variantCount: 2,
        winRate: {
          diamond: wrD,
          legend_top1000: wrL,
        },
        games: {
          diamond: gmD,
          legend_top1000: gmL,
        },
      })
    } catch (err) {
      console.warn('[ladder] 解析行失败:', err.message)
    }
  }

  return results
}

// 通用单元格提取器（尝试多个选择器）
async function extractCell(row, selectors) {
  for (const sel of selectors) {
    try {
      const el = await row.$(sel)
      if (el) {
        const text = await el.innerText()
        if (text && text.trim()) return text.trim()
      }
    } catch (_) {}
  }
  return ''
}

// ── 主函数 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 标准天梯数据抓取 ===')

  const browser = await launchBrowser({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  })

  let page
  try {
    // 抓取标准天梯
    console.log('[1/2] 抓取标准天梯（钻石4-1）...')
    page = await gotoWithRetry(context, 'https://hsreplay.net/meta/#tab=overview&rankRange=Diamond', { timeout: 60000 })
    await sleep(5000) // 等待图表渲染

    let deckTypes = await scrapeDeckTypes(page)
    console.log(`[1/2] 抓到 ${deckTypes.length} 个卡组类型（钻石段）`)

    // 抓取传说前1000
    console.log('[2/2] 抓取传说前1000...')
    const page2 = await gotoWithRetry(context, 'https://hsreplay.net/meta/#tab=overview&rankRange=Legend', { timeout: 60000 })
    await sleep(5000)

    const legendDecks = await scrapeDeckTypes(page2)
    console.log(`[2/2] 抓到 ${legendDecks.length} 个卡组类型（传说）`)

    // 合并传说数据（按名称匹配，填充 legend_top1000 字段）
    deckTypes = mergeLegendData(deckTypes, legendDecks)

    // 保存结果
    if (deckTypes.length > 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(deckTypes, null, 2), 'utf8')
      console.log(`\n✅ 保存到 ${OUTPUT_FILE}，共 ${deckTypes.length} 条`)
    } else {
      console.error('❌ 未抓到任何数据，页面结构可能已变，请检查截图')
      await page.screenshot({ path: path.join(__dirname, '..', 'debug_ladder.png') })
    }
  } catch (err) {
    console.error('抓取出错:', err)
    try { await page?.screenshot({ path: path.join(__dirname, '..', 'debug_error.png') }) } catch (_) {}
  } finally {
    await browser.close()
  }
}

/**
 * 将传说前1000数据合并到钻石数据中
 */
function mergeLegendData(diamondDecks, legendDecks) {
  const legendMap = {}
  legendDecks.forEach(d => { legendMap[d.name] = d })

  return diamondDecks.map(deck => {
    const lg = legendMap[deck.name]
    if (lg) {
      return {
        ...deck,
        winRate: {
          diamond: deck.winRate.diamond,
          legend_top1000: lg.winRate.diamond || lg.winRate.legend_top1000 || deck.winRate.diamond,
        },
        games: {
          diamond: deck.games.diamond,
          legend_top1000: lg.games.diamond || lg.games.legend_top1000 || 0,
        },
      }
    }
    // 传说无此卡组，只保留钻石数据
    return {
      ...deck,
      winRate: { diamond: deck.winRate.diamond, legend_top1000: 0 },
      games: { diamond: deck.games.diamond, legend_top1000: 0 },
    }
  })
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { main, scrapeDeckTypes, inferClass }
