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

  // 获取所有面板的精确位置 - 通过 h2/h3 的父容器
  const panels = await page.evaluate(() => {
    const results = [];
    const headings = Array.from(document.querySelectorAll('h2, h3'));

    const findPanel = (text) => {
      const h = headings.find(e => e.textContent.includes(text));
      if (!h) return null;
      // 向上找 3 层，找到 rounded-xl 的容器
      let el = h;
      for (let i = 0; i < 5; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        if (el.className && el.className.includes('rounded-xl')) {
          break;
        }
      }
      const rect = el.getBoundingClientRect();
      return {
        y: window.scrollY + rect.top,
        h: rect.height
      };
    };

    results.push({ key: '03_feedback_panel', pos: findPanel('弯道数') });
    results.push({ key: '04_telemetry_charts', pos: findPanel('遥测时序面板') });
    results.push({ key: '05_track_map', pos: findPanel('赛道轨迹与弯道热力图') });
    results.push({ key: '06_corner_cards', pos: findPanel('弯道评分总览') });
    results.push({ key: '08_radar_chart', pos: findPanel('维度雷达图') });
    results.push({ key: '09_friction_circle', pos: findPanel('G 值摩擦圆') });

    return results;
  });

  console.log('Panels:', JSON.stringify(panels, null, 2));

  for (const p of panels) {
    if (!p.pos) continue;
    const y = Math.max(0, Math.floor(p.pos.y) - 8);
    const h = Math.min(1400, Math.max(500, Math.ceil(p.pos.h) + 30));
    await page.screenshot({ path: `${OUT_DIR}/${p.key}.png`, clip: { x: 0, y, width: 1920, height: h } });
    console.log(`Saved ${p.key}.png y=${y} h=${h}`);
  }

  // 点击第一个弯道卡片
  try {
    const clicked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, div, span'));
      for (const el of all) {
        const text = el.textContent.trim();
        if (text.startsWith('C1') || text.includes('Corner 1')) {
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.click();
          return { clicked: true, text };
        }
      }
      return { clicked: false };
    });
    console.log('Click result:', clicked);
    await sleep(1500);

    const detailPos = await page.evaluate(() => {
      const h3 = Array.from(document.querySelectorAll('h3')).find(e => e.textContent.includes('弯道 #'));
      if (!h3) return null;
      let el = h3;
      for (let i = 0; i < 5; i++) {
        if (!el.parentElement) break;
        el = el.parentElement;
        if (el.className && el.className.includes('rounded-xl')) break;
      }
      const rect = el.getBoundingClientRect();
      return { y: window.scrollY + rect.top, h: rect.height };
    });

    if (detailPos) {
      const y = Math.max(0, Math.floor(detailPos.y) - 8);
      const h = Math.min(1400, Math.max(500, Math.ceil(detailPos.h) + 30));
      await page.screenshot({ path: `${OUT_DIR}/07_corner_detail.png`, clip: { x: 0, y, width: 1920, height: h } });
      console.log(`Saved 07_corner_detail.png y=${y} h=${h}`);
    }
  } catch (e) {
    console.log('Detail error:', e.message);
  }

  console.log('Done');
  await browser.close();
}

screenshot().catch(console.error);
