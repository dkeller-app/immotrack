/**
 * Convertit un fichier Markdown en HTML autonome avec rendu Mermaid intégré.
 *
 * Usage : node scripts/render-md-to-html.mjs <input.md> [output.html]
 *
 * Le HTML généré :
 * - Style CSS propre lisible
 * - Charge mermaid via CDN (nécessite connexion internet pour les diagrammes)
 * - Ouvre en double-clic dans n'importe quel navigateur
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { marked } from 'marked'

const args = process.argv.slice(2)
if (args.length === 0) {
  console.error('Usage: node scripts/render-md-to-html.mjs <input.md> [output.html]')
  process.exit(1)
}

const inputPath = resolve(args[0])
const outputPath = args[1]
  ? resolve(args[1])
  : inputPath.replace(/\.md$/i, '.html')

const md = readFileSync(inputPath, 'utf-8')
const title = (md.match(/^#\s+(.+)$/m) || [, basename(inputPath)])[1]

// Configurer marked pour conserver les blocs ```mermaid``` en class spécifique
marked.use({
  renderer: {
    code(token) {
      if (token.lang === 'mermaid') {
        return `<div class="mermaid">${token.text}</div>\n`
      }
      // Bloc code standard
      const escaped = token.text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
      const langClass = token.lang ? ` class="language-${token.lang}"` : ''
      return `<pre><code${langClass}>${escaped}</code></pre>\n`
    },
  },
})

const htmlBody = marked.parse(md)

const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]))}</title>
<style>
  :root {
    --bg: #fafafa;
    --fg: #1f2937;
    --muted: #6b7280;
    --accent: #2196f3;
    --accent-dark: #1976d2;
    --code-bg: #f5f5f5;
    --border: #e5e7eb;
    --table-zebra: #fafafa;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px 64px;
    line-height: 1.65;
    color: var(--fg);
    background: var(--bg);
  }
  h1 { border-bottom: 3px solid var(--accent); padding-bottom: 10px; margin-top: 0; }
  h2 { border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-top: 2.5em; }
  h3 { color: var(--accent-dark); margin-top: 1.8em; }
  h4 { color: #555; margin-top: 1.5em; }
  code {
    background: var(--code-bg);
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 0.88em;
    font-family: 'SF Mono', Monaco, Consolas, 'Courier New', monospace;
  }
  pre {
    background: #fff;
    border: 1px solid var(--border);
    padding: 14px 16px;
    border-radius: 6px;
    overflow-x: auto;
    line-height: 1.45;
  }
  pre code { background: transparent; padding: 0; font-size: 0.85em; }
  table {
    border-collapse: collapse;
    margin: 1em 0;
    width: 100%;
    background: #fff;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 1px 2px rgba(0,0,0,0.04);
  }
  th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; }
  tr:nth-child(even) { background: var(--table-zebra); }
  blockquote {
    border-left: 4px solid var(--accent);
    margin: 1em 0;
    padding: 8px 16px;
    color: #4b5563;
    background: #f0f9ff;
    border-radius: 0 4px 4px 0;
  }
  blockquote p { margin: 0.3em 0; }
  .mermaid {
    background: #fff;
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 6px;
    text-align: center;
    margin: 1.5em 0;
    overflow-x: auto;
  }
  a { color: var(--accent-dark); text-decoration: none; }
  a:hover { text-decoration: underline; }
  hr { border: none; border-top: 2px solid var(--border); margin: 2.5em 0; }
  ul, ol { padding-left: 28px; }
  li { margin: 0.3em 0; }
  /* Sticky TOC button — bonus */
  .toc-toggle {
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 50%;
    width: 48px;
    height: 48px;
    font-size: 1.5em;
    cursor: pointer;
    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
  }
  @media print {
    .toc-toggle { display: none; }
    body { background: #fff; padding: 0; }
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #1a1a1a;
      --fg: #e5e7eb;
      --muted: #9ca3af;
      --code-bg: #2d2d2d;
      --border: #3a3a3a;
      --table-zebra: #222;
    }
    table, pre, .mermaid { background: #2a2a2a; }
    th { background: #333; }
    blockquote { background: #1e2a3a; color: #cbd5e1; }
  }
</style>
</head>
<body>
${htmlBody}

<button class="toc-toggle" onclick="window.scrollTo({top:0,behavior:'smooth'})" title="Retour haut">↑</button>

<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
  mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' });
  mermaid.run({ querySelector: '.mermaid' });
</script>
</body>
</html>
`

writeFileSync(outputPath, html, 'utf-8')
console.log(`✓ HTML généré : ${outputPath}`)
console.log(`  Taille : ${(html.length / 1024).toFixed(1)} KB`)
console.log(`  Mermaid blocks : ${(htmlBody.match(/class="mermaid"/g) || []).length}`)
