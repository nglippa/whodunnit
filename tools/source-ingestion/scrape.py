#!/usr/bin/env python3
"""Fetch ONE webpage with Scrapling and normalise it for Whodunnit's rule compiler.

Developer tooling only; never used by the web app at runtime.

  uv run --project tools/source-ingestion python tools/source-ingestion/scrape.py URL \
      --cache-dir data/sources/cache [--refresh] [--file local.html]

Behaviour
- Polite: checks robots.txt first, one URL per run, identifying User-Agent,
  plain HTTP (no browser impersonation, no stealth headers).
- Scraped HTML is parsed, never executed. Scripts, styles, navigation, headers,
  footers, forms and asides are discarded before conversion.
- Output: JSON on stdout (and in the cache) with url, title, retrievedAt,
  rawHash, contentHash, sections[] and markdown.
- Cache: keyed by URL. Without --refresh a cached extraction is returned as is.
  With --refresh, an unchanged contentHash is reported as "unchanged".
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

USER_AGENT = "WhodunnitRuleResearch/0.1 (developer tool; one page per run)"
DROP_TAGS = {"script", "style", "noscript", "nav", "footer", "header", "aside", "form", "iframe", "svg", "button", "template", "canvas", "select", "dialog"}
ROOT_SELECTORS = ["article", "main", "[role=main]", "#content", ".post", ".entry-content", ".markdown-body", "body"]
BLOCK = {"p", "div", "section", "article", "main", "blockquote", "li", "pre", "table", "tr", "figure", "figcaption", "dl", "dd", "dt"}
ZERO_WIDTH = re.compile("[​‌‍⁠﻿]")
# Common boilerplate class names across sites (navigation widgets, share bars, edit links, cookie notices).
BOILERPLATE_CLASS = re.compile(r"(?:^|[\s_-])(?:shortcut\w*|hatnote|navbox|noprint|mw-editsection|editsection|cookie\w*|share\w*|social|breadcrumbs?|sidebar|toc|advert\w*|newsletter|subscribe)(?:$|[\s_-])", re.I)


def sha256(data: bytes | str) -> str:
    if isinstance(data, str):
        data = data.encode("utf-8")
    return hashlib.sha256(data).hexdigest()


def clean_text(s: str) -> str:
    s = unicodedata.normalize("NFC", s)
    s = ZERO_WIDTH.sub("", s)
    s = "".join(ch for ch in s if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
    return s


def normalise_markdown(md: str) -> str:
    md = clean_text(md).replace("\r\n", "\n")
    md = re.sub(r"[ \t]+\n", "\n", md)
    md = re.sub(r"\n{3,}", "\n\n", md)
    return md.strip() + "\n"


def html_to_markdown(root) -> str:
    """Walk an lxml element tree and emit simple Markdown (headings, paragraphs, lists, quotes, code)."""
    from lxml import etree

    for bad in root.xpath("//comment()"):
        bad.getparent().remove(bad)
    for el in list(root.iter()):
        if not isinstance(el.tag, str):
            continue
        tag = el.tag.lower()
        role = (el.get("role") or "").lower()
        hidden = el.get("aria-hidden") == "true" or el.get("hidden") is not None
        hidden = hidden or bool(BOILERPLATE_CLASS.search(el.get("class") or ""))
        if tag in DROP_TAGS or role in {"navigation", "banner", "contentinfo", "complementary"} or hidden:
            parent = el.getparent()
            if parent is not None:
                parent.remove(el)

    out: list[str] = []

    def inline(el) -> str:
        parts = [el.text or ""]
        for child in el:
            if not isinstance(child.tag, str):
                parts.append(child.tail or "")
                continue
            t = child.tag.lower()
            inner = inline(child)
            if t in {"strong", "b"} and inner.strip():
                parts.append(f"**{inner.strip()}**")
            elif t in {"em", "i"} and inner.strip():
                parts.append(f"*{inner.strip()}*")
            elif t == "code":
                parts.append(f"`{inner}`")
            elif t == "br":
                parts.append("\n")
            else:
                parts.append(inner)
            parts.append(child.tail or "")
        return "".join(parts)

    def block(el, depth: int = 0) -> None:
        if not isinstance(el.tag, str):
            return
        t = el.tag.lower()
        if re.fullmatch(r"h[1-6]", t):
            text = re.sub(r"\s+", " ", inline(el)).strip()
            if text:
                out.append("#" * int(t[1]) + " " + text)
            return
        if t in {"ul", "ol"}:
            for i, li in enumerate([c for c in el if isinstance(c.tag, str) and c.tag.lower() == "li"]):
                marker = f"{i + 1}." if t == "ol" else "-"
                text = re.sub(r"\s+", " ", inline(li)).strip()
                if text:
                    out.append("  " * depth + f"{marker} {text}")
                for sub in li:
                    if isinstance(sub.tag, str) and sub.tag.lower() in {"ul", "ol"}:
                        block(sub, depth + 1)
            return
        if t == "pre":
            out.append("```\n" + etree.tostring(el, method="text", encoding="unicode").strip("\n") + "\n```")
            return
        if t == "blockquote":
            text = re.sub(r"\s+", " ", etree.tostring(el, method="text", encoding="unicode")).strip()
            if text:
                out.append("> " + text)
            return
        if t == "table":
            for tr in el.iter("tr"):
                cells = [re.sub(r"\s+", " ", etree.tostring(c, method="text", encoding="unicode")).strip() for c in tr if isinstance(c.tag, str) and c.tag.lower() in {"td", "th"}]
                if any(cells):
                    out.append("| " + " | ".join(cells) + " |")
            return
        # A container is anything with block-level content anywhere inside it (main, article, section, span wrappers…).
        has_block_child = any(isinstance(d.tag, str) and (d.tag.lower() in BLOCK or re.fullmatch(r"h[1-6]|ul|ol|pre|table", d.tag.lower())) for d in el.iterdescendants())
        if has_block_child:
            if (el.text or "").strip():
                out.append(el.text.strip())
            for c in el:
                block(c, depth)
                if isinstance(c.tag, str) and (c.tail or "").strip():
                    out.append(c.tail.strip())
            return
        text = re.sub(r"[ \t\r\f\v]+", " ", inline(el)).strip()
        if text:
            out.append(text)

    block(root)
    return "\n\n".join(out)


def sections_from_markdown(md: str) -> list[dict]:
    sections: list[dict] = []
    current = {"heading": "", "level": 0, "lines": []}
    for line in md.split("\n"):
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            if current["lines"] or current["heading"]:
                sections.append(current)
            current = {"heading": m.group(2).strip(), "level": len(m.group(1)), "lines": []}
        else:
            current["lines"].append(line)
    sections.append(current)
    out = []
    for i, s in enumerate(sections):
        text = "\n".join(s["lines"]).strip()
        if not text and not s["heading"]:
            continue
        slug = re.sub(r"[^a-z0-9]+", "-", s["heading"].lower()).strip("-")[:60] or "intro"
        out.append({"anchor": f"s{i}-{slug}", "heading": s["heading"], "level": s["level"], "text": text})
    return out


def robots_allows(url: str) -> tuple[bool, str]:
    from protego import Protego
    from scrapling.fetchers import Fetcher

    parts = urlparse(url)
    robots_url = f"{parts.scheme}://{parts.netloc}/robots.txt"
    try:
        r = Fetcher.get(robots_url, headers={"User-Agent": USER_AGENT}, stealthy_headers=False, timeout=15, retries=1)
    except Exception as e:  # network trouble fetching robots is not permission
        return True, f"robots.txt unavailable ({type(e).__name__}); proceeding with a single request"
    if r.status >= 400:
        return True, f"no robots.txt (HTTP {r.status})"
    body = r.body.decode("utf-8", "replace") if isinstance(r.body, (bytes, bytearray)) else str(r.body)
    rp = Protego.parse(body)
    return rp.can_fetch(url, USER_AGENT), "robots.txt checked"


def extract(body: bytes, content_type: str, url: str) -> tuple[str, str]:
    text = body.decode("utf-8", "replace")
    looks_markdown = url.endswith((".md", ".markdown", ".txt")) or "text/markdown" in content_type or "text/plain" in content_type
    if looks_markdown:
        title = next((m.group(1).strip() for m in re.finditer(r"^#\s+(.+)$", text, re.M)), Path(urlparse(url).path).name or url)
        return title, normalise_markdown(text)
    from lxml import html as lhtml
    from scrapling.parser import Selector

    page = Selector(text, url=url)
    title = (page.css("title::text").get() or "").strip() or (page.css("h1::text").get() or url).strip()
    root_sel = None
    for sel in ROOT_SELECTORS:
        found = page.css(sel)
        if found:
            root_sel = found[0]
            break
    fragment = root_sel.html_content if root_sel is not None else text
    root = lhtml.fragment_fromstring(fragment, create_parent="div")
    return clean_text(title)[:200], normalise_markdown(html_to_markdown(root))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="Page URL (also used as the cache key and recorded source URL)")
    ap.add_argument("--cache-dir", default="data/sources/cache")
    ap.add_argument("--refresh", action="store_true", help="Fetch again even if cached")
    ap.add_argument("--file", help="Normalise a local HTML/Markdown file instead of fetching (URL is recorded as given)")
    args = ap.parse_args()

    parsed = urlparse(args.url)
    if parsed.scheme not in {"http", "https"}:
        print(json.dumps({"error": "Only http(s) URLs are supported."}))
        return 2

    cache_dir = Path(args.cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path = cache_dir / f"{sha256(args.url)[:24]}.json"
    cached = json.loads(cache_path.read_text()) if cache_path.exists() else None
    if cached and not args.refresh and not args.file:
        cached["cache"] = "hit"
        print(json.dumps(cached))
        return 0

    if args.file:
        body = Path(args.file).read_bytes()
        content_type = "text/markdown" if args.file.endswith((".md", ".markdown", ".txt")) else "text/html"
        status, final_url, robots_note = 200, args.url, "local file"
    else:
        allowed, robots_note = robots_allows(args.url)
        if not allowed:
            print(json.dumps({"error": f"robots.txt disallows fetching {args.url} for this user agent."}))
            return 3
        from scrapling.fetchers import Fetcher

        r = Fetcher.get(args.url, headers={"User-Agent": USER_AGENT}, stealthy_headers=False, timeout=30, retries=1, follow_redirects=True)
        status, final_url = r.status, str(r.url)
        if status >= 400:
            print(json.dumps({"error": f"HTTP {status} from {args.url}"}))
            return 4
        body = r.body if isinstance(r.body, (bytes, bytearray)) else str(r.body).encode("utf-8")
        content_type = (r.headers or {}).get("content-type", "") if hasattr(r, "headers") else ""

    title, markdown = extract(body, content_type, final_url)
    content_hash = sha256(markdown)
    record = {
        "url": args.url,
        "finalUrl": final_url,
        "title": title or args.url,
        "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "status": status,
        "contentType": content_type,
        "robots": robots_note,
        "rawHash": sha256(bytes(body)),
        "contentHash": content_hash,
        "sections": sections_from_markdown(markdown),
        "markdown": markdown,
    }
    record["cache"] = "unchanged" if cached and cached.get("contentHash") == content_hash else ("refreshed" if cached else "miss")
    cache_path.write_text(json.dumps(record, ensure_ascii=False, indent=1))
    print(json.dumps(record))
    return 0


if __name__ == "__main__":
    sys.exit(main())
