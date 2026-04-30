/**
 * index.js — 主入口，调度天梯 + 酒馆战棋数据抓取
 * GitHub Actions 中每天自动运行
 */

const path = require('path')
const fs = require('fs')
const { ladder } = require('./ladder')
const { battlegrounds } = require('./battlegrounds')

// 输出目录
const OUTPUT_DIR = path.join(__dirname, '..', 'output')

async function main() {
  console.log('========================================')
  console.log(`Hearthstone 数据抓取 - ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`)
  console.log('========================================\n')

  const results = { ladder: null, battlegrounds: null, errors: [] }

  // 1. 天梯数据
  try {
    console.log('>>> [1/2] 标准天梯卡组类型\n')
    await ladder.main()
    results.ladder = readJson(path.join(OUTPUT_DIR, 'ladder_deck_types.json'))
    console.log(`✓ 天梯: ${results.ladder?.length ?? 0} 个卡组类型\n`)
  } catch (err) {
    console.error(`✗ 天梯出错: ${err.message}\n`)
    results.errors.push({ type: 'ladder', error: err.message })
  }

  // 2. 酒馆战棋
  try {
    console.log('>>> [2/2] 酒馆战棋\n')
    await battlegrounds.main()
    results.battlegrounds = readJson(path.join(OUTPUT_DIR, 'battlegrounds_data.json'))
    const bg = results.battlegrounds
    console.log(`✓ 酒馆: ${bg?.bg_heroes?.length ?? 0} 英雄 / ${bg?.bg_trinkets?.length ?? 0} 饰品 / ${bg?.bg_races?.length ?? 0} 种族\n`)
  } catch (err) {
    console.error(`✗ 酒馆出错: ${err.message}\n`)
    results.errors.push({ type: 'battlegrounds', error: err.message })
  }

  // 3. 生成汇总报告
  const summary = {
    scrapedAt: new Date().toISOString(),
    ladder: {
      deckTypeCount: results.ladder?.length ?? 0,
      file: 'output/ladder_deck_types.json',
    },
    battlegrounds: {
      heroCount: results.battlegrounds?.bg_heroes?.length ?? 0,
      trinketCount: results.battlegrounds?.bg_trinkets?.length ?? 0,
      raceCount: results.battlegrounds?.bg_races?.length ?? 0,
      compsCount: 0, // 后续实现
      file: 'output/battlegrounds_data.json',
    },
    errors: results.errors,
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  )

  console.log('========================================')
  if (results.errors.length === 0) {
    console.log('✅ 抓取完成，无错误')
  } else {
    console.log(`⚠ 抓取完成，${results.errors.length} 个错误`)
    results.errors.forEach(e => console.log(`  - ${e.type}: ${e.error}`))
  }
  console.log('========================================')
  console.log('💡 输出的 JSON 文件可直接导入小程序云函数')
  console.log('   导入方式：')
  console.log('   1. ladder_deck_types.json → 导入到 deck_types 集合')
  console.log('   2. battlegrounds_data.json → 导入到 bg_heroes / bg_trinkets / bg_races 集合\n')
}

function readJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'))
    }
  } catch (_) {}
  return null
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
