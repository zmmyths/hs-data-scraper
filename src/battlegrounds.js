/**
 * battlegrounds.js — 酒馆战棋数据抓取
 * 数据源: https://hsreplay.net/battlegrounds/
 * 输出: output/battlegrounds_data.json
 *
 * 抓取内容（4个集合）:
 *   bg_heroes   — 英雄 { id, name, text, armor, top50{avgPlace,pickRate}, top20{avgPlace,pickRate} }
 *   bg_trinkets — 饰品 { id, name, text, cost, tier, top50{avgPlace,pickRate}, top20{avgPlace,pickRate} }
 *   bg_races    — 种族 { raceId, name, nameEn, top50{avgPlace,pickRate,firstPlaceRate}, top20{...} }
 *   bg_comps    — 阵容（留空，后续实现）
 */

const fs = require('fs')
const path = require('path')
const { launchBrowser, gotoWithRetry, sleep } = require('./browser')

const OUTPUT_FILE = path.join(__dirname, '..', 'output', 'battlegrounds_data.json')

// ── 英雄 ──────────────────────────────────────────────────────────────────────
async function scrapeHeroes(page) {
  const heroes = []

  // 尝试多种英雄行选择器
  const rowSelectors = [
    'tbody tr[data-hero-id]',
    '.hero-list tbody tr',
    '[class*="hero-row"]',
    'table tbody tr',
  ]

  let rows = []
  for (const sel of rowSelectors) {
    rows = await page.$$(sel)
    if (rows.length > 0) {
      console.log(`[bg:heroes] 选择器: ${sel}, ${rows.length} 行`)
      break
    }
  }

  for (const row of rows) {
    try {
      const name = await extractCell(row, ['.hero-name', '.name', '[class*="name"]', 'td:first-child'])
      const heroId = await row.$eval('td:first-child', el => el.getAttribute('data-hero-id') || el.getAttribute('data-id') || '').catch(() => '')
      const text = await extractCell(row, ['.hero-text', '.text', '[class*="text"]']).catch(() => '')
      const armor = await extractCell(row, ['.hero-armor', '.armor']).catch(() => '0')

      // top50 / top20 数据（可能在子列中）
      const top50Place = await extractCell(row, ['[data-segment="top50"] .avg-place', '[data-segment="top50"] [class*="place"]']).catch(() => '0')
      const top50Pick  = await extractCell(row, ['[data-segment="top50"] .pick-rate', '[data-segment="top50"] [class*="pick"]']).catch(() => '0')
      const top20Place = await extractCell(row, ['[data-segment="top20"] .avg-place', '[data-segment="top20"] [class*="place"]']).catch(() => '0')
      const top20Pick  = await extractCell(row, ['[data-segment="top20"] .pick-rate', '[data-segment="top20"] [class*="pick"]']).catch(() => '0')

      if (!name) continue

      heroes.push({
        id: heroId || name,
        name: name.trim(),
        text: text.trim(),
        armor: parseInt(armor, 10) || 0,
        top50: {
          avgPlace: parseFloat(top50Place) || 0,
          pickRate: parsePercent(top50Pick),
        },
        top20: {
          avgPlace: parseFloat(top20Place) || 0,
          pickRate: parsePercent(top20Pick),
        },
      })
    } catch (err) {
      console.warn('[bg:heroes] 解析行失败:', err.message)
    }
  }

  return heroes
}

// ── 饰品 ──────────────────────────────────────────────────────────────────────
async function scrapeTrinkets(page) {
  const trinkets = []

  // 饰品分为大饰品(tier=2)和小饰品(tier=1)
  const tierSelectors = [
    'tbody tr[data-trinket-id]',
    '.trinket-list tbody tr',
    '[class*="trinket-row"]',
    'table tbody tr',
  ]

  let rows = []
  for (const sel of tierSelectors) {
    rows = await page.$$(sel)
    if (rows.length > 0) {
      console.log(`[bg:trinkets] 选择器: ${sel}, ${rows.length} 行`)
      break
    }
  }

  for (const row of rows) {
    try {
      const name = await extractCell(row, ['.trinket-name', '.name', 'td:first-child'])
      const trinketId = await row.$eval('td:first-child', el => el.getAttribute('data-trinket-id') || el.getAttribute('data-id') || '').catch(() => '')
      const text = await extractCell(row, ['.trinket-text', '.text']).catch(() => '')
      const cost = await extractCell(row, ['.cost', '[class*="cost"]']).catch(() => '0')
      const tier = await row.$eval('tr', el => el.getAttribute('data-tier') || '2').catch(() => '2')

      const top50Place = await extractCell(row, ['[data-segment="top50"] .avg-place']).catch(() => '0')
      const top50Pick  = await extractCell(row, ['[data-segment="top50"] .pick-rate']).catch(() => '0')
      const top20Place = await extractCell(row, ['[data-segment="top20"] .avg-place']).catch(() => '0')
      const top20Pick  = await extractCell(row, ['[data-segment="top20"] .pick-rate']).catch(() => '0')

      if (!name) continue

      trinkets.push({
        id: trinketId || name,
        name: name.trim(),
        text: text.trim(),
        cost: parseInt(cost, 10) || 0,
        tier: parseInt(tier, 10) || 2,
        top50: {
          avgPlace: parseFloat(top50Place) || 0,
          pickRate: parsePercent(top50Pick),
        },
        top20: {
          avgPlace: parseFloat(top20Place) || 0,
          pickRate: parsePercent(top20Pick),
        },
      })
    } catch (err) {
      console.warn('[bg:trinkets] 解析行失败:', err.message)
    }
  }

  return trinkets
}

// ── 种族 ──────────────────────────────────────────────────────────────────────
async function scrapeRaces(page) {
  const races = []

  const rowSelectors = [
    'tbody tr[data-race-id]',
    '.race-list tbody tr',
    '[class*="race-row"]',
    'table tbody tr',
  ]

  let rows = []
  for (const sel of rowSelectors) {
    rows = await page.$$(sel)
    if (rows.length > 0) {
      console.log(`[bg:races] 选择器: ${sel}, ${rows.length} 行`)
      break
    }
  }

  for (let i = 0; i < rows.length; i++) {
    try {
      const row = rows[i]
      const name = await extractCell(row, ['.race-name', '.name', 'td:first-child'])
      const nameEn = await extractCell(row, ['.race-name-en', '[class*="name-en"]']).catch(() => '')

      const top50Place    = await extractCell(row, ['[data-segment="top50"] .avg-place']).catch(() => '0')
      const top50Pick     = await extractCell(row, ['[data-segment="top50"] .pick-rate']).catch(() => '0')
      const top50First    = await extractCell(row, ['[data-segment="top50"] .first-place-rate']).catch(() => '0')
      const top20Place    = await extractCell(row, ['[data-segment="top20"] .avg-place']).catch(() => '0')
      const top20Pick     = await extractCell(row, ['[data-segment="top20"] .pick-rate']).catch(() => '0')
      const top20First    = await extractCell(row, ['[data-segment="top20"] .first-place-rate']).catch(() => '0')

      if (!name) continue

      races.push({
        raceId: `race_${i + 1}`,
        name: name.trim(),
        nameEn: nameEn.trim(),
        top50: {
          avgPlace: parseFloat(top50Place) || 0,
          pickRate: parsePercent(top50Pick),
          firstPlaceRate: parsePercent(top50First),
        },
        top20: {
          avgPlace: parseFloat(top20Place) || 0,
          pickRate: parsePercent(top20Pick),
          firstPlaceRate: parsePercent(top20First),
        },
      })
    } catch (err) {
      console.warn('[bg:races] 解析行失败:', err.message)
    }
  }

  return races
}

// ── 工具函数 ──────────────────────────────────────────────────────────────────
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

function parsePercent(str) {
  if (!str) return 0
  // "12.5%" → 0.125, "45%" → 0.45
  const cleaned = str.replace('%', '').trim()
  const num = parseFloat(cleaned)
  if (isNaN(num)) return 0
  return num > 1 ? num / 100 : num
}

// ── 主函数 ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== 酒馆战棋数据抓取 ===')

  const browser = await launchBrowser({ headless: true })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  })

  const result = {
    bg_heroes: [],
    bg_trinkets: [],
    bg_races: [],
    bg_comps: [], // 留空，后续实现
    scrapedAt: new Date().toISOString(),
  }

  try {
    // 英雄
    console.log('[1/3] 抓取酒馆英雄...')
    let page = await gotoWithRetry(context, 'https://hsreplay.net/battlegrounds/#tab=heroes', { timeout: 60000 })
    await sleep(5000)
    result.bg_heroes = await scrapeHeroes(page)
    console.log(`  → 抓到 ${result.bg_heroes.length} 个英雄`)

    // 饰品
    console.log('[2/3] 抓取酒馆饰品...')
    // 大饰品
    let pageT = await gotoWithRetry(context, 'https://hsreplay.net/battlegrounds/#tab=trinkets&tier=2', { timeout: 60000 })
    await sleep(3000)
    const largeTrinkets = await scrapeTrinkets(pageT)
    // 小饰品
    const pageS = await gotoWithRetry(context, 'https://hsreplay.net/battlegrounds/#tab=trinkets&tier=1', { timeout: 60000 })
    await sleep(3000)
    const smallTrinkets = await scrapeTrinkets(pageS)
    result.bg_trinkets = [...largeTrinkets, ...smallTrinkets]
    console.log(`  → 抓到 ${result.bg_trinkets.length} 个饰品（大:${largeTrinkets.length} / 小:${smallTrinkets.length}）`)

    // 种族
    console.log('[3/3] 抓取酒馆种族...')
    const pageR = await gotoWithRetry(context, 'https://hsreplay.net/battlegrounds/#tab=tribes', { timeout: 60000 })
    await sleep(5000)
    result.bg_races = await scrapeRaces(pageR)
    console.log(`  → 抓到 ${result.bg_races.length} 个种族`)

    // 保存
    if (result.bg_heroes.length > 0 || result.bg_trinkets.length > 0 || result.bg_races.length > 0) {
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf8')
      console.log(`\n✅ 保存到 ${OUTPUT_FILE}`)
    } else {
      console.error('❌ 未抓到任何数据，截图调试...')
      try { await page?.screenshot({ path: path.join(__dirname, '..', 'debug_bg.png') }) } catch (_) {}
    }
  } catch (err) {
    console.error('抓取出错:', err)
    try { await page?.screenshot({ path: path.join(__dirname, '..', 'debug_bg_error.png') }) } catch (_) {}
  } finally {
    await browser.close()
  }
}

if (require.main === module) {
  main().catch(console.error)
}

module.exports = { main, scrapeHeroes, scrapeTrinkets, scrapeRaces }
