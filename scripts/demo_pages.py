"""Generate isolated demo entry pages from the real customer-facing screens."""
from pathlib import Path
import re
import json

ROOT = Path(__file__).resolve().parents[1]
POLICY = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; form-action 'none'; object-src 'none'; base-uri 'self'"


def render(source, settings=False):
    html = source.read_text(encoding="utf-8")
    html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)
    html = re.sub(r'<link\b[^>]*(?:fonts\.google|preconnect)[^>]*>', '', html)
    html = re.sub(r'<meta\b[^>]*property="og:[^>]*>', '', html)
    html = re.sub(r'<link\b[^>]*rel="canonical"[^>]*>', '', html)
    html = re.sub(r'<meta\b[^>]*name="description"[^>]*>', '', html)
    html = re.sub(r'<title>.*?</title>', '<title>KeeperBMA — full interactive demo</title>', html)
    html = html.replace('<html lang="en">', '<html lang="en" data-demo="settings">' if settings else '<html lang="en" data-demo="workspace">')
    additions = f'''<meta http-equiv="Content-Security-Policy" content="{POLICY}">
<meta name="description" content="Explore KeeperBMA with fictional data. Try accounts, reports, business tools and settings. All changes reset on refresh.">
<script src="./frontends/web/demo.js?v=4"></script>
<link rel="stylesheet" href="./frontends/web/demo.css?v=4"><link rel="stylesheet" href="./frontends/web/demo-design.css?v=3">'''
    additions += '<meta name="robots" content="noindex">' if settings else '<link rel="canonical" href="https://keeperbma.com/demo.html">'
    html = html.replace('<meta charset="utf-8" />', '<meta charset="utf-8" />\n' + additions)
    banner = '''<aside class="demo-banner" aria-label="Demo information">
<div class="demo-banner-line"><strong>DEMO · Fictional data only</strong><button type="button" data-demo-reset>Restart demo</button></div>
<p>Try every working section. Nothing is saved: refreshing resets everything. No real bank, payment, email, or account changes. Product-help questions may be sent to AI when connected; use sample details only.</p>
<p class="demo-notice" role="status" aria-live="polite"></p>
</aside>'''
    if not settings:
        banner += '''<section id="demoMenu" class="demo-directory card"><h1>Explore KeeperBMA</h1><p>All paid tools are unlocked here. Use sample details only. Planned modules remain marked as planned.</p>
<nav aria-label="Demo sections">'''
        for label, target in [('Monthly report', 'creatorReport'), ('POS & inventory', 'demoPos'), ('Business operations', 'demoBusinessHub'), ('Accounts', 'accountsTitle'), ('Transactions & transfers', 'transactionsTitle'), ('Categories', 'categoriesTitle'), ('Banks', 'bankSyncTitle'), ('Charts & PDF', 'summaryExportTitle'), ('Daily summary', 'dailySummaryTitle'), ('Business & employees', 'businessWorkspace'), ('Settings & billing', 'settings'), ('Support', 'support')]:
            banner += f'<button type="button" class="secondary" data-demo-section="{target}">{label}</button>'
        banner += '</nav><h2>Business demo tools</h2><nav aria-label="Business demo shortcuts">'
        for label, tab in [('Overview', 'overview'), ('Store branches', 'branches'), ('Staff & labor planning', 'staff'), ('Time clock & payroll', 'time'), ('Staff schedule', 'schedule'), ('Meetings & agendas', 'meetings'), ('Budgets & expenses', 'budgets'), ('Accounting', 'accounting'), ('Tax preparation', 'tax'), ('Marketing campaigns', 'marketing'), ('Tasks & ownership', 'tasks'), ('Business analyst preview', 'analyst')]:
            banner += f'<button type="button" class="secondary" data-demo-section="demoBusinessHub" data-demo-hub-tab="{tab}">{label}</button>'
        banner += '</nav><h2>POS demo tools</h2><nav aria-label="POS demo shortcuts">'
        for label, tab in [('Sales checkout', 'checkout'), ('Products & CSV upload', 'products'), ('Supplier purchases', 'purchases'), ('Sales & receipts', 'sales'), ('Promotions & discounts', 'promotions'), ('Suppliers', 'suppliers'), ('Brands', 'brands'), ('Product categories', 'categories')]:
            banner += f'<button type="button" class="secondary" data-demo-section="demoPos" data-demo-pos-tab="{tab}">{label}</button>'
        banner += '''</nav><p>These tools use temporary sample data. Real payments, payroll processing, tax filing, AI services and social publishing are not connected.</p><div class="row"><button type="button" class="secondary" data-demo-share>Copy demo link</button><a href="./index.html" data-demo-exit>Leave demo</a><a href="./plans.html" data-demo-exit>View real plans</a></div></section>'''
    html = html.replace('<main class="page">', '<main class="page">\n' + banner)
    # The actual marketing page is separate from the simulated signed-in app.
    if not settings:
        html = re.sub(r'<section id="landingScreen".*?(?=<section id="appScreen")', '', html, flags=re.S)
        html = html.replace('<section id="appScreen"', '<section id="landingScreen" hidden></section>\n<section id="appScreen"', 1)
    scripts = '<script defer src="./assets/vendor/chart.umd.js"></script><script defer src="./assets/vendor/jspdf.umd.min.js"></script>'
    if not settings:
        scripts += '<script defer src="./frontends/web/creator-tools.js?v=1"></script><script defer src="./frontends/web/product-guide.js?v=2"></script><script defer src="./frontends/web/demo-assistant.js?v=1"></script>'
    scripts += f'<script defer src="./frontends/web/{"settings" if settings else "web"}.js?v=demo4"></script>'
    if not settings:
        scripts += '<script defer src="./frontends/web/pos-demo-model.js?v=2"></script><script defer src="./frontends/web/demo-pos.js?v=2"></script>'
        scripts += '<script defer src="./frontends/web/demo-branches-model.js?v=1"></script><script defer src="./frontends/web/demo-business.js?v=4"></script>'
        scripts += '<script defer src="./frontends/web/demo-time-model.js?v=1"></script><script defer src="./frontends/web/demo-time.js?v=1"></script>'
        scripts += '<script defer src="./frontends/web/demo-schedule-model.js?v=1"></script><script defer src="./frontends/web/demo-schedule.js?v=1"></script>'
        scripts += '<script defer src="./frontends/web/demo-accounting.js?v=1"></script><script defer src="./frontends/web/demo-layout.js?v=5"></script>'
        # srcdoc uses the same generated Settings screen without needing to
        # loosen production hosting's X-Frame-Options: DENY response header.
        settings_html = json.dumps(render(ROOT / "settings.html", True), ensure_ascii=False).replace("<", "\\u003c")
        scripts += f'<script id="demoSettingsMarkup" type="application/json">{settings_html}</script>'
        scripts += '<a class="demo-menu-return" href="#demoMenu">Demo menu ↑</a>'
    html = html.replace('</body>', scripts + '</body>')
    html = '\n'.join(line.rstrip() for line in html.splitlines()) + '\n'
    return '<!-- Generated by scripts/demo_pages.py; edit the real screen or demo runtime. -->\n' + html


def generate(write=False):
    mismatches = []
    for name, source, settings in [('demo.html', 'index.html', False), ('demo-settings.html', 'settings.html', True)]:
        expected = render(ROOT / source, settings)
        destination = ROOT / name
        if write:
            destination.write_text(expected, encoding="utf-8")
        elif not destination.exists() or destination.read_text(encoding="utf-8") != expected:
            mismatches.append(name)
    if mismatches:
        raise SystemExit('Demo pages differ: ' + ', '.join(mismatches) + '. Run python scripts/sync_web_entries.py --write')
