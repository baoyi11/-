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

  // 获取所有面板的精确位置
  const panels = await page.evaluate(() => {
    const results = [];
    const keywords = [
      { key: '03_feedback', text: '弯道数' },
      { key: '04_telemetry', text: '遥测时序面板' },
      { key: '05_track', text: '赛道轨迹与弯道热力图' },
      { key: '06_corners', text: '弯道评分总览' },
      { key: '08_radar', text: '维度雷达图' },
      { key: '09_friction', text: 'G 值摩擦圆' },
    ];

    for (const kw of keywords) {
      const el = Array.from(document.querySelectorAll('h2, h3, span, div')).find(
        e => e.textContent.trim() === kw.text || e.textContent.includes(kw.text)
      );
      if (el) {
        const rect = el.getBoundingClientRect();
        const parent = el.closest('section, div[class*="rounded"]') || el.parentElement;
        const pRect = parent.getBoundingClientRect();
        results.push({
          key: kw.key,
          text: kw.text,
          y: window.scrollY + pRect.top,
          h: pRect.height,
          elY: window.scrollY + rect.top
        });
      } else {
        results.push({ key: kw.key, text: kw.text, notFound: true });
      }
    }
    return results;
  });

  console.log('Panels found:', JSON.stringify(panels, null, 2));

  // 截图各面板
  for (const p of panels) {
    if (p.notFound) continue;
    const y = Math.max(0, Math.floor(p.y) - 10);
    const h = Math.min(1200, Math.max(600, Math.ceil(p.h) + 40));
    await page.screenshot({ path: `${OUT_DIR}/${p.key}.png`, clip: { x: 0, y, width: 1920, height: h } });
    console.log(`Saved ${p.key}.png at y=${y} h=${h}`);
  }

  // 点击第一个弯道卡片，截图详情
  try {
    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, div'));
      for (const el of all) {
        if (el.textContent.trim().startsWith('C1')) {
          el.click();
          return true;
        }
      }
      return false;
    });
    console.log('Clicked C1:', clicked);
    await sleep(1500);

    const detailPos = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('h3')).find(e => e.textContent.includes('弯道 #'));
      if (el) {
        const parent = el.closest('section, div[class*="rounded"]') || el.parentElement?.parentElement;
        const rect = parent.getBoundingClientRect();
        return { y: window.scrollY + rect.top, h: rect.height };
      }
      return null;
    });

    if (detailPos) {
      const y = Math.max(0, Math.floor(detailPos.y) - 10);
      const h = Math.min(1200, Math.max(600, Math.ceil(detailPos.h) + 40));
      await page.screenshot({ path: `${OUT_DIR}/07_corner_detail.png`, clip: { x: 0, y, width: 1920, height: h } });
      console.log(`Saved 07_corner_detail.png at y=${y} h=${h}`);
    }
  } catch (e) {
    console.log('Detail error:', e.message);
  }

  console.log('Done');
  await browser.close();
}

screenshot().catch(console.error);
