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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1920,4000'],
    defaultViewport: { width: 1920, height: 4000 }
  });

  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
  await sleep(3000);

  // 1. 截图上传区域初始状态
  await page.screenshot({ path: `${OUT_DIR}/01_upload_zone.png`, clip: { x: 0, y: 0, width: 1920, height: 900 } });

  // 2. 找到文件输入并上传
  const input = await page.$('input[type="file"]');
  if (!input) {
    console.log('No file input found');
    await browser.close();
    return;
  }

  await input.uploadFile('/workspace/projects/public/test_telemetry.csv');
  await sleep(12000); // 等待分析完成

  // 3. 主界面全景
  await page.screenshot({ path: `${OUT_DIR}/02_full_page.png`, fullPage: true });

  // 辅助函数：滚动到包含指定文本的元素并截图
  async function screenshotPanel(filename, searchText, height = 900) {
    try {
      const result = await page.evaluate((text) => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        let el;
        while (el = walker.nextNode()) {
          if (el.textContent && el.textContent.includes(text)) {
            el.scrollIntoView({ behavior: 'instant', block: 'start' });
            const rect = el.getBoundingClientRect();
            return { y: window.scrollY + rect.top, found: true };
          }
        }
        return { found: false };
      }, searchText);

      if (result.found) {
        await sleep(800);
        const y = Math.max(0, result.y - 20);
        await page.screenshot({ path: `${OUT_DIR}/${filename}.png`, clip: { x: 0, y, width: 1920, height } });
        console.log(`Screenshot saved: ${filename}.png at y=${y}`);
      } else {
        console.log(`Panel not found: ${searchText}`);
      }
    } catch (e) {
      console.log(`Error screenshot ${filename}:`, e.message);
    }
  }

  // 截图各个面板
  await screenshotPanel('03_feedback_panel', '弯道数', 600);
  await screenshotPanel('04_telemetry_charts', '遥测时序面板', 900);
  await screenshotPanel('05_track_map', '赛道轨迹与弯道热力图', 900);
  await screenshotPanel('06_corner_cards', '弯道评分总览', 900);
  await screenshotPanel('08_radar_chart', '维度雷达图', 700);
  await screenshotPanel('09_friction_circle', 'G 值摩擦圆', 700);

  // 点击第一个弯道卡片
  try {
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, div'));
      for (const btn of buttons) {
        if (btn.textContent.includes('C1') || btn.textContent.includes('Corner 1')) {
          btn.click();
          return true;
        }
      }
      return false;
    });
    await sleep(1500);
    await screenshotPanel('07_corner_detail', '弯道 #', 900);
  } catch (e) {
    console.log('Corner detail error:', e.message);
  }

  console.log('Screenshots saved to', OUT_DIR);
  await browser.close();
}

screenshot().catch(console.error);
