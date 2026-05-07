const puppeteer = require('puppeteer');
const fs = require('fs');

const OUT_DIR = '/workspace/projects/public/report_images';
const BASE_URL = 'http://localhost:5000';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function screenshot() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,6000'],
    defaultViewport: { width: 1920, height: 6000 }
  });

  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sleep(3000);

  const input = await page.$('input[type="file"]');
  if (!input) { console.log('No file input'); await browser.close(); return; }
  await input.uploadFile('/workspace/projects/public/test_telemetry.csv');
  await sleep(12000);

  // 点击第一个弯道卡片
  const clickResult = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    // 找包含 "弯道 #" 且数字最小的
    let target = null;
    let minId = Infinity;
    for (const btn of buttons) {
      const match = btn.textContent.match(/弯道\s*#(\d+)/);
      if (match) {
        const id = parseInt(match[1]);
        if (id < minId) {
          minId = id;
          target = btn;
        }
      }
    }
    if (target) {
      target.scrollIntoView({ behavior: 'instant', block: 'center' });
      target.click();
      return { clicked: true, id: minId, text: target.textContent.trim().slice(0, 50) };
    }
    return { clicked: false };
  });
  console.log('Click result:', clickResult);

  await sleep(2000);

  // 截取详情面板 - 找到包含 "AI 检测到的特征" 的容器
  const pos = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('p, span, h3, h4'));
    const el = all.find(e => e.textContent.trim() === 'AI 检测到的特征');
    if (!el) return null;
    let container = el;
    for (let i = 0; i < 5; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.className && container.className.includes('rounded-xl')) break;
    }
    const rect = container.getBoundingClientRect();
    return { y: window.scrollY + rect.top, h: rect.height };
  });

  if (pos) {
    const y = Math.max(0, Math.floor(pos.y) - 10);
    const h = Math.min(1200, Math.max(600, Math.ceil(pos.h) + 40));
    await page.screenshot({ path: `${OUT_DIR}/07_corner_detail.png`, clip: { x: 0, y, width: 1920, height: h } });
    console.log(`Saved 07_corner_detail.png y=${y} h=${h}`);
  } else {
    console.log('Corner detail not found');
  }

  await browser.close();
}

screenshot().catch(console.error);
