#!/usr/bin/env python3
"""
generate.py — build index.html from the repo's userstyles and userscripts.
Run from repo root. Writes index.html in-place.
"""

import os
import re
import html
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).parent
USERSTYLES_DIR  = BASE / "userstyles"
USERSCRIPTS_DIR = BASE / "userscripts"
OUT = BASE / "index.html"

RAW_BASE = "https://raw.githubusercontent.com/HimadriChakra12/My-Usershytts/main"

# ── helpers ────────────────────────────────────────────────────────────────────

def extract_name(path: Path) -> str:
    """Read @name from UserScript/UserStyle metadata block, else use stem."""
    try:
        text = path.read_text(errors="replace")
        m = re.search(r"@name\s+(.+)", text)
        if m:
            return m.group(1).strip()
    except Exception:
        pass
    return path.stem

def card(name: str, raw_url: str) -> str:
    n = html.escape(name)
    u = html.escape(raw_url)
    return f'<a class="card" href="{u}" title="{n}">{n}</a>'

# ── userstyles — group by top-level dir, then sub-dir ─────────────────────────

def collect_userstyles():
    """
    Returns: dict[section -> dict[subsection -> list[card_html]]]
    section   = top-level dirname, or '' for root-level files
    subsection = next dirname, or '' for direct children of section
    Up to 3 dir levels rendered; deeper levels collapse under the nearest named dir.
    """
    tree = defaultdict(lambda: defaultdict(list))

    for f in sorted(USERSTYLES_DIR.rglob("*.user.css")):
        rel   = f.relative_to(USERSTYLES_DIR)
        parts = rel.parts          # e.g. ('Discord','ThirdParty','System24','base.user.css')
        name  = extract_name(f)
        url   = f"{RAW_BASE}/userstyles/{'/'.join(rel.parts)}"

        if len(parts) == 1:
            section, subsection = "", ""
        elif len(parts) == 2:
            section, subsection = parts[0], ""
        else:
            # collapse everything ≥3 levels into "section / sub (rest...)"
            section    = parts[0]
            subsection = " / ".join(parts[1:-1])

        tree[section][subsection].append(card(name, url))

    return tree

def collect_userscripts():
    scripts = []
    for f in sorted(USERSCRIPTS_DIR.glob("*.user.js")):
        name = extract_name(f)
        rel  = f.relative_to(BASE)
        url  = f"{RAW_BASE}/{'/'.join(rel.parts)}"
        scripts.append(card(name, url))
    return scripts

# ── HTML generation ────────────────────────────────────────────────────────────

def render_userstyles(tree) -> str:
    parts = []

    # root-level styles (section == '') — shown under a plain ~/ header
    root_subs = tree.get("", {})
    if root_subs:
        parts.append('<h2 class="section root">~</h2>')
        for subsection, cards in sorted(root_subs.items()):
            if subsection:
                parts.append(f'<h3 class="sub">{html.escape(subsection)}</h3>')
            parts.append('<div class="grid">' + "".join(cards) + "</div>")

    for section in sorted(k for k in tree if k):
        parts.append(f'<h2 class="section">{html.escape(section)}</h2>')
        subs = tree[section]
        for subsection in sorted(subs):
            if subsection:
                parts.append(f'<h3 class="sub">{html.escape(subsection)}</h3>')
            parts.append('<div class="grid">' + "".join(subs[subsection]) + "</div>")

    return "\n".join(parts)

def render_userscripts(scripts) -> str:
    return '<div class="grid">' + "".join(scripts) + "</div>"

# ── main ───────────────────────────────────────────────────────────────────────

def main():
    style_tree  = collect_userstyles()
    script_list = collect_userscripts()

    styles_html  = render_userstyles(style_tree)
    scripts_html = render_userscripts(script_list)

    html_doc = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HIM Userstyles &amp; Userscripts</title>
<style>
/* reset */
*, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}

:root {{
  --bg:      #0a0a0a;
  --bg2:     #1a1a1a;
  --bg3:     #2a2a2a;
  --fg:      #e8e8e8;
  --fg-dim:  #888;
  --accent:  #e8e8e8;
  --border:  #2e2e2e;
  --radius:  4px;
  --gap:     16px;
  --font:    system-ui, sans-serif;
  --mono:    "IosevkaCharonMono", ui-monospace, monospace;
}}

body {{
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font);
  font-size: 15px;
  line-height: 1.5;
}}

/* layout */
.page {{ max-width: 1200px; margin: 0 auto; padding: 40px 24px 80px; }}

/* topbar */
.topbar {{
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 48px;
}}
.topbar h1 {{
  font-size: clamp(2rem, 5vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.03em;
}}
.tab-btn {{
  background: var(--bg3);
  color: var(--fg);
  border: 1px solid var(--border);
  padding: 6px 14px;
  font-size: 13px;
  cursor: pointer;
  text-decoration: none;
  border-radius: var(--radius);
}}
.tab-btn:hover {{ background: var(--bg2); }}

/* sections */
.pane {{ display: none; }}
.pane:target, .pane.active {{ display: block; }}

.section {{
  font-size: 1.1rem;
  font-weight: 700;
  margin: 36px 0 12px;
  color: var(--fg);
  letter-spacing: 0.01em;
}}
.section::before {{
  content: "~/";
  color: var(--fg-dim);
  font-weight: 400;
}}
.section.root::before {{ content: ""; }}

.sub {{
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--fg-dim);
  margin: 20px 0 8px 2px;
  letter-spacing: 0.02em;
}}
.sub::before {{ content: "/"; margin-right: 3px; }}

/* grid */
.grid {{
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--gap);
  margin-bottom: 4px;
}}

/* card */
.card {{
  display: block;
  background: var(--bg2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px 40px;
  color: var(--fg);
  text-decoration: none;
  font-size: 0.88rem;
  word-break: break-word;
  transition: background 0.1s, border-color 0.1s;
  min-height: 90px;
}}
.card:hover {{
  background: var(--bg3);
  border-color: #555;
}}

/* fallback for no :target — show userstyles by default */
.pane#userstyles {{ display: block; }}
.pane#userscripts:target ~ #userstyles,
.pane#userscripts:target {{ display: block; }}
.pane#userscripts:target ~ #userstyles {{ display: none; }}
</style>
</head>
<body>
<div class="page">

  <div class="topbar">
    <h1 id="page-title">HIM Userstyles</h1>
    <a class="tab-btn" href="#userscripts" id="tab-link">userscripts</a>
  </div>

  <div class="pane" id="userstyles">
{styles_html}
  </div>

  <div class="pane" id="userscripts">
{scripts_html}
  </div>

</div>

<!-- minimal JS just for the toggle label — remove if you want pure CSS -->
<script>
(function(){{
  var link  = document.getElementById('tab-link');
  var title = document.getElementById('page-title');
  function sync(){{
    if(location.hash === '#userscripts'){{
      title.textContent = 'HIM Userscripts';
      link.textContent  = 'userstyles';
      link.href         = '#userstyles';
    }} else {{
      title.textContent = 'HIM Userstyles';
      link.textContent  = 'userscripts';
      link.href         = '#userscripts';
    }}
  }}
  window.addEventListener('hashchange', sync);
  sync();
}})();
</script>
</body>
</html>
"""
    OUT.write_text(html_doc, encoding="utf-8")
    print(f"Written: {OUT}  ({OUT.stat().st_size} bytes)")

if __name__ == "__main__":
    main()
