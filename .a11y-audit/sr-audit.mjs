// Screen-reader oriented accessibility audit for WPS web tools.
// Implements the "screen-reader-testing" skill checklist programmatically:
// axe-core rules that map to screen reader experience + accessibility-tree probes.
import { chromium } from 'playwright'
import { AxeBuilder } from '@axe-core/playwright'
import fs from 'node:fs'

const BASE = process.env.BASE_URL || 'http://localhost:8759'
const ROUTES = [
  ['/', 'Landing page'],
  ['/percentile-calculator', 'Percentile Calculator'],
  ['/hfi-calculator', 'HFI Calculator'],
  ['/fire-behaviour-calculator', 'FBP Go / Fire Behaviour Calculator'],
  ['/auto-spatial-advisory', 'Auto Spatial Advisory (FBA)'],
  ['/morecast', 'MoreCast 2'],
  ['/insights', 'SFMS Insights'],
  ['/fire-watch', 'Fire Watch'],
  ['/weather-toolkit', 'Weather Toolkit']
]

// Probes run in page context. These mirror the manual NVDA/VoiceOver checklist.
const probe = () => {
  const vis = el => {
    const s = getComputedStyle(el)
    if (s.display === 'none' || s.visibility === 'hidden') return false
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  }
  const name = el =>
    (
      el.getAttribute('aria-label') ||
      (el.getAttribute('aria-labelledby') || '')
        .split(/\s+/)
        .map(id => document.getElementById(id)?.textContent || '')
        .join(' ') ||
      el.getAttribute('title') ||
      el.textContent ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
  const sel = el => {
    const parts = []
    let n = el
    while (n && n.nodeType === 1 && parts.length < 4) {
      let p = n.tagName.toLowerCase()
      if (n.id) {
        parts.unshift(`${p}#${n.id}`)
        break
      }
      if (n.className && typeof n.className === 'string') p += '.' + n.className.trim().split(/\s+/).slice(0, 2).join('.')
      parts.unshift(p)
      n = n.parentElement
    }
    return parts.join(' > ')
  }

  const out = { title: document.title, lang: document.documentElement.lang }

  // Headings
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')]
    .filter(vis)
    .map(h => ({ level: Number(h.getAttribute('aria-level') || h.tagName[1]), text: name(h).slice(0, 80), sel: sel(h) }))
  out.headings = headings
  out.headingIssues = []
  if (headings.filter(h => h.level === 1).length === 0) out.headingIssues.push('No level-1 heading: screen reader users have no page-level anchor (rotor/Insert+F7 heading list starts empty).')
  if (headings.filter(h => h.level === 1).length > 1) out.headingIssues.push('Multiple level-1 headings.')
  headings.reduce((prev, h) => {
    if (prev && h.level > prev.level + 1) out.headingIssues.push(`Heading level skipped: h${prev.level} "${prev.text}" -> h${h.level} "${h.text}"`)
    return h
  }, null)
  if (headings.length === 0) out.headingIssues.push('Zero headings on page: no heading navigation (H key / VO+Cmd+H) is possible.')

  // Landmarks
  const lm = [...document.querySelectorAll('main,nav,header,footer,aside,form,section,[role]')].filter(vis).filter(el => {
    const r = el.getAttribute('role')
    const t = el.tagName.toLowerCase()
    return ['banner', 'navigation', 'main', 'contentinfo', 'complementary', 'search', 'form', 'region'].includes(r) ||
      ['main', 'nav', 'header', 'footer', 'aside'].includes(t)
  })
  out.landmarks = lm.map(el => ({ role: el.getAttribute('role') || el.tagName.toLowerCase(), name: name(el).slice(0, 40), sel: sel(el) }))
  out.landmarkIssues = []
  if (!document.querySelector('main, [role="main"]')) out.landmarkIssues.push('No <main> / role="main": "skip to content" and landmark navigation (D key) cannot reach primary content.')
  const navs = lm.filter(el => el.tagName.toLowerCase() === 'nav' || el.getAttribute('role') === 'navigation')
  if (navs.length > 1 && navs.some(n => !name(n))) out.landmarkIssues.push('Multiple navigation landmarks and at least one has no accessible name.')

  // Skip link
  const first = document.querySelector('body a[href], body button')
  out.skipLink = first ? { text: name(first).slice(0, 60), href: first.getAttribute?.('href') || null } : null
  out.skipLinkPresent = !!(first && /skip/i.test(name(first)))

  // Unnamed interactive controls (the #1 screen reader defect)
  const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="switch"],[role="menuitem"],[role="combobox"],summary')].filter(vis)
  out.unnamed = interactive
    .filter(el => {
      if (el.getAttribute('aria-hidden') === 'true') return false
      if (el.tagName === 'INPUT' && ['hidden'].includes(el.type)) return false
      let n = name(el)
      if (!n && el.labels && el.labels.length) n = [...el.labels].map(l => l.textContent).join(' ').trim()
      if (!n && el.tagName === 'INPUT') n = el.getAttribute('placeholder') ? '' : ''
      if (!n) {
        const img = el.querySelector('img[alt]')
        if (img && img.alt.trim()) n = img.alt
      }
      return !n
    })
    .map(el => ({ tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', sel: sel(el), html: el.outerHTML.slice(0, 160) }))

  // Placeholder-only inputs: NVDA browse mode may not announce a usable label
  out.placeholderOnly = [...document.querySelectorAll('input,textarea,select')]
    .filter(vis)
    .filter(el => !name(el) && !(el.labels && el.labels.length) && el.getAttribute('placeholder'))
    .map(el => ({ sel: sel(el), placeholder: el.getAttribute('placeholder') }))

  // Live regions for dynamic content announcements
  out.liveRegions = [...document.querySelectorAll('[aria-live],[role="status"],[role="alert"],[role="log"],[role="progressbar"]')].map(el => ({
    sel: sel(el),
    live: el.getAttribute('aria-live') || '',
    role: el.getAttribute('role') || ''
  }))

  // Tables: header association
  out.tableIssues = [...document.querySelectorAll('table')].filter(vis).map(t => {
    const issues = []
    if (!t.querySelector('th') && !t.querySelector('[role="columnheader"]')) issues.push('no <th>/columnheader: cells announce without a header')
    if (!t.caption && !name(t)) issues.push('no caption or accessible name')
    return issues.length ? { sel: sel(t), issues } : null
  }).filter(Boolean)

  // Dialogs
  out.dialogIssues = [...document.querySelectorAll('[role="dialog"],[role="alertdialog"],dialog')].filter(vis).map(d => {
    const issues = []
    if (!name(d)) issues.push('dialog has no accessible name (aria-labelledby/aria-label)')
    if (d.getAttribute('aria-modal') !== 'true' && d.tagName !== 'DIALOG') issues.push('missing aria-modal="true"')
    return issues.length ? { sel: sel(d), issues } : null
  }).filter(Boolean)

  // Positive tabindex breaks the reading/focus order
  out.positiveTabindex = [...document.querySelectorAll('[tabindex]')]
    .filter(el => Number(el.getAttribute('tabindex')) > 0)
    .map(el => ({ sel: sel(el), tabindex: el.getAttribute('tabindex') }))

  // Images without alt decision
  out.imgIssues = [...document.querySelectorAll('img')].filter(vis).filter(i => !i.hasAttribute('alt')).map(i => ({ sel: sel(i), src: (i.getAttribute('src') || '').slice(0, 80) }))

  // aria-hidden on a focusable element = focus lands on nothing announced
  out.ariaHiddenFocusable = [...document.querySelectorAll('[aria-hidden="true"]')]
    .flatMap(el => [...el.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].concat(el.matches('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])') ? [el] : []))
    .map(el => ({ sel: sel(el), html: el.outerHTML.slice(0, 120) }))

  return out
}

const tabOrder = async page => {
  return await page.evaluate(async () => {
    const res = []
    const seen = new Set()
    document.body.focus()
    for (let i = 0; i < 60; i++) {
      // Playwright drives real Tab; here we just report current DOM order fallback
      break
    }
    return res
  })
}

const run = async () => {
  const browser = await chromium.launch()
  const results = []
  for (const [route, label] of ROUTES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    // AuthWrapper honours window.Playwright as a test-auth bypass, so we can audit
    // the real authenticated tool UIs instead of the Keycloak login page.
    await ctx.addInitScript(() => {
      window.Playwright = true
    })
    const page = await ctx.newPage()
    const consoleErrors = []
    page.on('console', m => m.type() === 'error' && consoleErrors.push(m.text().slice(0, 200)))
    const entry = { route, label, url: BASE + route }
    try {
      await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 })
      await page.waitForTimeout(6000)
      entry.finalUrl = page.url()
      entry.redirectedToAuth = !page.url().startsWith(BASE)
      entry.probe = await page.evaluate(probe)

      // Real keyboard tab order: what a screen reader user traverses in focus mode
      const order = []
      for (let i = 0; i < 25; i++) {
        await page.keyboard.press('Tab')
        const info = await page.evaluate(() => {
          const el = document.activeElement
          if (!el || el === document.body) return null
          const n = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('title') || '').replace(/\s+/g, ' ').trim().slice(0, 50)
          const r = el.getBoundingClientRect()
          return {
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute('role') || '',
            name: n,
            offscreen: r.width === 0 && r.height === 0,
            outline: getComputedStyle(el).outlineStyle
          }
        })
        if (!info) break
        order.push(info)
      }
      entry.tabOrder = order
      entry.unnamedFocusStops = order.filter(o => !o.name)
      entry.noFocusIndicator = order.filter(o => o.outline === 'none')

      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']).analyze()
      entry.axe = axe.violations.map(v => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        count: v.nodes.length,
        nodes: v.nodes.slice(0, 5).map(n => ({ target: n.target.join(' '), summary: (n.failureSummary || '').replace(/\s+/g, ' ').slice(0, 220), html: n.html.slice(0, 200) }))
      }))
      entry.consoleErrors = consoleErrors.slice(0, 5)
      await page.screenshot({ path: `shots/${route.replace(/\W+/g, '_') || 'root'}.png`, fullPage: false })
    } catch (e) {
      entry.error = String(e).slice(0, 300)
    }
    results.push(entry)
    console.log(`done ${route} :: axe=${entry.axe ? entry.axe.length : 'n/a'} ${entry.error || ''}`)
    await ctx.close()
  }
  await browser.close()
  fs.writeFileSync('results.json', JSON.stringify(results, null, 2))
}
fs.mkdirSync('shots', { recursive: true })
run()
