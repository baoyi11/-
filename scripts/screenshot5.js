const puppeteer = require('puppeteer');
const fs = require('fs');

const OUT_DIR = '/workspace/projects/public/report_images';
const BASE_URL = 'http://localhost:5000';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,6000'],
    defaultViewport: { width: 1920, height: 6000 }
  });

  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // 1. 上传区域
  await page.screenshot({ path: `${OUT_DIR}/01_upload_zone.png`, clip: { x: 0, y: 0, width: 1920, height: 900 } });

  // 2. 上传文件
  const input = await page.$('input[type="file"]');
  if (!input) { console.log('No file input'); await browser.close(); return; }
  await input.uploadFile('/workspace/projects/public/test_telemetry.csv');
  await sleep(12000);

  // 3. 完整长页面
  await page.screenshot({ path: `${OUT_DIR}/02_full_page.png`, fullPage: true });

  // 获取面板的辅助函数 - 只搜索标题元素，避免匹配外层容器
  async function capturePanel(keyword, filename, minH = 500, maxH = 1400) {
    const pos = await page.evaluate((text) => {
      // 只搜索标题和独立文本节点，避免匹配包含所有内容的外层 div
      const candidates = Array.from(document.querySelectorAll('h2, h3, h4, span, p, button'));
      // 优先匹配 textContent 完全等于或精确包含关键字的元素
      let el = candidates.find(e => {
        const t = e.textContent.trim();
        return t === text || t.startsWith(text) || t.includes(text);
      });
      if (!el) return null;

      // 向上找 rounded-xl 容器
      let container = el;
      for (let i = 0; i < 6; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        if (container.className && container.className.includes('rounded-xl')) break;
      }
      const rect = container.getBoundingClientRect();
      return { y: window.scrollY + rect.top, h: rect.height, foundText: el.textContent.trim() };
    }, keyword);

    if (!pos) { console.log(`Not found: ${keyword}`); return; }
    const y = Math.max(0, Math.floor(pos.y) - 8);
    const h = Math.min(maxH, Math.max(minH, Math.ceil(pos.h) + 30));
    await page.screenshot({ path: `${OUT_DIR}/${filename}.png`, clip: { x: 0, y, width: 1920, height: h } });
    console.log(`Saved ${filename}.png y=${y} h=${h} text="${pos.foundText}"`);
  }

  await capturePanel('刹车技术', '03_feedback_panel', 500, 800);
  await capturePanel('遥测时序面板', '04_telemetry_charts', 600, 900);
  await capturePanel('赛道轨迹与弯道热力图', '05_track_map', 500, 800);
  await capturePanel('弯道评分总览', '06_corner_cards', 600, 900);

  // 点击第一个弯道卡片
  try {
    const clickResult = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      for (const btn of buttons) {
        const spans = btn.querySelectorAll('span');
        for (const span of spans) {
          if (span.textContent.trim().startsWith('弯道 #1')) {
            btn.click();
            return { clicked: true, text: span.textContent.trim() };
          }
        }
      }
      return { clicked: false };
    });
    console.log('Click result:', clickResult);
    await sleep(1500);

    await capturePanel('弯道 #', '07_corner_detail', 600, 1000);
  } catch (e) {
    console.log('Detail error:', e.message);
  }

  await capturePanel('维度雷达图', '08_radar_chart', 400, 700);
  await capturePanel('G 值摩擦圆', '09_friction_circle', 400, 700);

  console.log('Done');
  await browser.close();
}

screenshot().catch(console.error);
