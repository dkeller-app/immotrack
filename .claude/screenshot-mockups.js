// Génère des PNG des mockups dashboard v2 (3 vues actives + 6 archives).
// Usage : node .claude/screenshot-mockups.js
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT      = 'C:/Users/Did_K/Desktop/Immo/docs/strategie/dashboard-mockups';
const OUT_DIR   = path.join(ROOT, '_screenshots');
const ATTIC_DIR = path.join(ROOT, '_attic');

const ACTIVE_PAGES = [
  { file: 'index.html',                  name: '0-accueil-hub'       },
  { file: 'lentille-1-proprietaire.html',name: '1-proprietaire'      },
  { file: 'lentille-3-gestionnaire.html',name: '3-gestionnaire'      },
];

const ATTIC_PAGES = [
  { file: '_attic/lentille-2-financier.html',   name: 'attic-2-financier'    },
  { file: '_attic/lentille-4-fiscale.html',     name: 'attic-4-fiscale'      },
  { file: '_attic/lentille-5-investisseur.html',name: 'attic-5-investisseur' },
  { file: '_attic/lentille-6-echeances.html',   name: 'attic-6-echeances'    },
  { file: '_attic/lentille-7-previsionnel.html',name: 'attic-7-previsionnel' },
  { file: '_attic/lentille-8-patrimoine.html',  name: 'attic-8-patrimoine'   },
];

const PAGES = [...ACTIVE_PAGES, ...ATTIC_PAGES];

(async () => {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  // Cleanup screenshots obsolètes (anciennes lens-X qui ne matchent plus)
  for (const old of fs.readdirSync(OUT_DIR)) {
    fs.unlinkSync(path.join(OUT_DIR, old));
  }

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  for (const themeMode of ['light', 'dark']) {
    for (const p of PAGES) {
      const url = 'file:///' + path.join(ROOT, p.file).replace(/\\/g, '/');
      const page = await browser.newPage();
      await page.setViewport({ width: 1320, height: 900, deviceScaleFactor: 1 });
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: themeMode }]);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, themeMode);
      await new Promise(r => setTimeout(r, 350));

      // Full-page screenshot
      const outFull = path.join(OUT_DIR, `${p.name}-${themeMode}-full.png`);
      await page.screenshot({ path: outFull, fullPage: true, type: 'png' });

      // 1-screen screenshot (cible 900 px) pour les vues actives uniquement
      if (!p.file.startsWith('_attic')) {
        const out1s = path.join(OUT_DIR, `${p.name}-${themeMode}-1screen.png`);
        await page.screenshot({ path: out1s, fullPage: false, type: 'png' });
      }

      console.log(`✓ ${themeMode.padEnd(5)} ${p.name.padEnd(28)} → ${path.basename(outFull)}`);
      await page.close();
    }
  }

  await browser.close();
  const files = fs.readdirSync(OUT_DIR);
  console.log(`\n${files.length} screenshots générés dans ${OUT_DIR}`);
})().catch(e => { console.error(e); process.exit(1); });
