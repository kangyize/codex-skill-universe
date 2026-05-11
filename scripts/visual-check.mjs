import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const root = process.cwd();
const screenshotDir = path.join(root, '.skill-universe', 'screenshots');
const url = process.env.SKILL_UNIVERSE_URL ?? 'http://127.0.0.1:5173';

await fs.mkdir(screenshotDir, { recursive: true });

function intersects(a, b) {
  return !(
    a.right <= b.left ||
    b.right <= a.left ||
    a.bottom <= b.top ||
    b.bottom <= a.top
  );
}

async function assertCanvasHasPixels(page) {
  const result = await page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="skill-universe-canvas"]');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { ok: false, reason: 'canvas not found' };
    }

    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return { ok: false, reason: 'webgl context not available' };

    const width = Math.min(gl.drawingBufferWidth, 512);
    const height = Math.min(gl.drawingBufferHeight, 512);
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    let lit = 0;
    let colorVariance = 0;
    for (let index = 0; index < pixels.length; index += 64) {
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      if (r + g + b > 28) lit += 1;
      colorVariance += Math.abs(r - g) + Math.abs(g - b);
    }

    return {
      ok: lit > 20 && colorVariance > 1200,
      lit,
      colorVariance,
      width,
      height
    };
  });

  assert.equal(result.ok, true, `canvas appears blank: ${JSON.stringify(result)}`);
}

async function assertNoPanelOverlap(page, viewportName) {
  const boxes = await page.evaluate(() => {
    const selectors = ['.topbar', '.cluster-dock', '.recommendation-panel', '.detail-panel', '.workflow-panel', '.mission-deck', '.timeline-panel'];
    return selectors
      .map((selector) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          selector,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      })
      .filter(Boolean);
  });

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      assert.equal(
        intersects(a, b),
        false,
        `${viewportName} overlap: ${a.selector} intersects ${b.selector}`
      );
    }
  }
}

async function openToolbarMenu(page, menu) {
  const details = page.locator(`.toolbar-menu[data-menu="${menu}"]`);
  const isOpen = await details.evaluate((element) => element.hasAttribute('open')).catch(() => false);
  if (!isOpen) await details.locator('summary').click();
}

async function clickPanelToggle(page, panel) {
  await openToolbarMenu(page, 'panels');
  await page.locator(`.toolbar-menu[data-menu="panels"] [data-panel="${panel}"]`).click();
  await page.locator('.toolbar-menu[data-menu="panels"]').evaluate((element) => element.removeAttribute('open'));
}

async function selectLayoutPreset(page, preset) {
  await openToolbarMenu(page, 'view');
  await page.getByLabel('布局预设').selectOption(preset);
  await page.locator('.toolbar-menu[data-menu="view"]').evaluate((element) => element.removeAttribute('open'));
}

async function runViewport(browser, viewport, name) {
  const page = await browser.newPage({ viewport });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    localStorage.removeItem('skill-universe.layout.v1');
    localStorage.removeItem('skill-universe.timeline.v1');
    localStorage.removeItem('skill-universe.layoutSnapshots.v1');
    localStorage.removeItem('skill-universe.tags.v1');
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="skill-universe-canvas"]');
  await page.waitForSelector('.mission-card');
  await page.waitForTimeout(1800);
  await assertCanvasHasPixels(page);
  const missionScroll = await page.evaluate(async () => {
    const row = document.querySelector('.mission-row');
    const button = document.querySelector('button[aria-label="向右滑动推荐航线"]');
    if (!(row instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) {
      return { max: 0, before: 0, after: 0 };
    }
    const before = row.scrollLeft;
    const max = row.scrollWidth - row.clientWidth;
    button.click();
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    return { max, before, after: row.scrollLeft };
  });
  if (missionScroll.max > 8) {
    assert.ok(missionScroll.after > missionScroll.before, `${name} mission deck should scroll with right button`);
  }
  await assertNoPanelOverlap(page, name);

  if (name === 'desktop') {
    const beforeDrag = await page.locator('.cluster-dock').boundingBox();
    const heading = await page.locator('.cluster-dock .window-heading').boundingBox();
    assert.ok(beforeDrag && heading, 'cluster panel should be measurable before drag');
    await page.mouse.move(heading.x + 40, heading.y + 14);
    await page.mouse.down();
    await page.mouse.move(heading.x + 118, heading.y + 34, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(250);
    const afterDrag = await page.locator('.cluster-dock').boundingBox();
    assert.ok(afterDrag && afterDrag.x > beforeDrag.x + 30, `${name} pinned cluster panel should be draggable`);
    await openToolbarMenu(page, 'view');
    await page.locator('.toolbar-menu[data-menu="view"] .wide-menu-action').click();
    await page.locator('.toolbar-menu[data-menu="view"]').evaluate((element) => element.removeAttribute('open'));
    await page.waitForTimeout(250);
    const afterReset = await page.locator('.cluster-dock').boundingBox();
    assert.ok(afterReset && Math.abs(afterReset.x - beforeDrag.x) < 8, `${name} default layout should restore panel position`);
  }

  await page.locator('.detail-panel .window-controls button').last().click();
  await page.waitForSelector('.detail-panel', { state: 'detached' });
  assert.equal(await page.locator('.detail-panel').count(), 0, `${name} detail panel should hide`);
  await clickPanelToggle(page, 'details');
  await page.waitForSelector('.detail-panel');

  await clickPanelToggle(page, 'timeline');
  await page.waitForSelector('.timeline-panel');
  await clickPanelToggle(page, 'timeline');
  await page.waitForSelector('.timeline-panel', { state: 'detached' });

  await clickPanelToggle(page, 'recommendations');
  await page.waitForSelector('.recommendation-panel');
  await page.waitForSelector('.recommendation-filters');
  await page.waitForSelector('.candidate-card, .recommendation-empty');
  const candidateCount = await page.locator('.candidate-card').count();
  if (candidateCount > 0) {
    await page.locator('.candidate-card .candidate-links button').first().click();
    await page.waitForSelector('.install-console .command-row code');
    await page.waitForSelector('.install-audit-card');
    const commandText = await page.locator('.install-console .command-row code').first().textContent();
    assert.ok(commandText?.includes('npx clawhub@latest install'), `${name} install plan should show clawhub command`);
    await page.locator('.install-console .command-row button').first().click();
    await page.locator('.install-console .window-controls button').last().click();
  }
  await assertNoPanelOverlap(page, `${name}-recommendations`);
  await clickPanelToggle(page, 'recommendations');
  await page.waitForSelector('.recommendation-panel', { state: 'detached' });

  await selectLayoutPreset(page, 'minimal');
  await page.waitForTimeout(250);
  assert.equal(
    await page.locator('.cluster-dock, .detail-panel, .mission-deck, .recommendation-panel').count(),
    0,
    `${name} minimal layout should hide panels`
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="skill-universe-canvas"]');
  await openToolbarMenu(page, 'view');
  assert.equal(await page.getByLabel('布局预设').inputValue(), 'minimal', `${name} layout preset should persist after reload`);
  await page.locator('.toolbar-menu[data-menu="view"]').evaluate((element) => element.removeAttribute('open'));
  assert.equal(
    await page.locator('.cluster-dock, .detail-panel, .mission-deck, .recommendation-panel').count(),
    0,
    `${name} persisted minimal layout should keep panels hidden`
  );
  await selectLayoutPreset(page, 'research');
  await page.waitForSelector('.cluster-dock');
  await page.waitForSelector('.detail-panel');
  await page.waitForSelector('.mission-deck');

  await page.evaluate(() => {
    const row = document.querySelector('.mission-row');
    if (row instanceof HTMLElement) row.scrollLeft = 0;
  });
  await page.waitForTimeout(100);
  await page.locator('.mission-card').first().click();
  await page.waitForSelector('.workflow-panel');
  await page.waitForSelector('.workflow-step');
  await page.waitForTimeout(900);
  const stepCount = await page.locator('.workflow-step').count();
  assert.ok(stepCount >= 2, `${name} workflow should show multiple steps`);
  await assertCanvasHasPixels(page);
  await assertNoPanelOverlap(page, `${name}-workflow`);
  await page.screenshot({
    path: path.join(screenshotDir, `${name}.png`),
    fullPage: true
  });
  await page.close();
}

const browser = await chromium.launch({ headless: true });
try {
  await runViewport(browser, { width: 1440, height: 900 }, 'desktop');
  await runViewport(browser, { width: 390, height: 844 }, 'mobile');
} finally {
  await browser.close();
}

console.log(`visual ok: screenshots saved to ${screenshotDir}`);
