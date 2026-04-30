/**
 * browser.js — Playwright + Stealth 浏览器实例
 * 自动绕过 Cloudflare 和 hsreplay.net 的 Bot 检测
 */

const { chromium } = require('playwright-extra')
const stealth = require('@extra-stealth/evasions').default

// 应用所有 Stealth 插件
chromium.use(stealth)

/**
 * 启动 stealth Chrome
 * @param {object} options
 * @param {boolean} options.headless — 是否无头（CI=true, 本地调试=false）
 * @returns {Promise<Browser>}
 */
async function launchBrowser({ headless = true } = {}) {
  const browser = await chromium.launch({
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      // 反指纹
      '--disable-web-security',
      '--lang=zh-CN',
    ],
  })
  return browser
}

/**
 * 等待 Cloudflare 验证完成（检测 "Just a moment..." 消失）
 * @param {Page} page
 * @param {number} timeoutMs
 */
async function waitForCloudflare(page, timeoutMs = 30000) {
  try {
    // 方法1：等 JS 注入完成（cloudflare-set-nonce 事件）
    await page.waitForFunction(
      () => !document.querySelector('#cf-challenge-running'),
      { timeout: timeoutMs }
    )
    console.log('[Cloudflare] 验证通过（方法1）')
    return
  } catch (_) {}

  try {
    // 方法2：检测页面 title 变化或 cf-content 消失
    await page.waitForFunction(
      () => {
        const body = document.body.innerText
        return !body.includes('Just a moment') && !body.includes('Checking your browser')
      },
      { timeout: timeoutMs }
    )
    console.log('[Cloudflare] 验证通过（方法2）')
    return
  } catch (_) {}

  // 方法3：等 5s 直接截图调试
  await page.screenshot({ path: 'cf_debug.png' })
  console.warn('[Cloudflare] 等待超时，请查看 cf_debug.png')
}

/**
 * 访问页面并等待 Cloudflare 通过
 * @param {BrowserContext} context
 * @param {string} url
 * @param {object} options
 */
async function gotoWithRetry(context, url, options = {}) {
  const { retries = 3, timeout = 60000 } = options
  let lastError

  for (let i = 0; i < retries; i++) {
    const page = await context.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout })
      await waitForCloudflare(page, 30000)
      await page.waitForTimeout(2000) // 等待动态内容
      return page
    } catch (err) {
      lastError = err
      console.warn(`[goto] 第 ${i + 1} 次尝试失败: ${err.message}`)
      await page.close()
      if (i < retries - 1) await sleep(5000)
    }
  }

  throw new Error(`goto 全部失败: ${lastError.message}`)
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

module.exports = { launchBrowser, gotoWithRetry, waitForCloudflare, sleep }
