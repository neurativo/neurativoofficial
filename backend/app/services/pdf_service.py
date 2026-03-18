import os
import re
from jinja2 import Environment, FileSystemLoader
from app.services.supabase_service import get_lecture_for_summarization
from datetime import datetime
from playwright.sync_api import sync_playwright

# Module-level browser singleton to avoid spawning a new Chromium process per request.
_playwright_instance = None
_browser = None

def _get_browser():
    global _playwright_instance, _browser
    if _browser is None or not _browser.is_connected():
        if _playwright_instance is not None:
            try:
                _playwright_instance.stop()
            except Exception:
                pass
        _playwright_instance = sync_playwright().start()
        _browser = _playwright_instance.chromium.launch(headless=True)
    return _browser

def format_duration(seconds: int) -> str:
    if not seconds:
        return "0m 0s"
    m = seconds // 60
    s = seconds % 60
    return f"{m}m {s}s"

def clean_markdown_to_html(text: str) -> str:
    """
    Simple markdown cleaner for the specific format we generate.
    """
    if not text:
        return ""
    
    html = text
    
    # 1. Bold: **text** -> <b>text</b>
    html = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', html)
    
    # Process blocks
    lines = html.split('\n')
    processed_lines = []
    in_list = False
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            if in_list:
                processed_lines.append("</ul>")
                in_list = False
            processed_lines.append("<br>")
            continue
            
        if stripped.startswith("## "):
            if in_list:
                processed_lines.append("</ul>")
                in_list = False
            processed_lines.append(f"<h3>{stripped[3:]}</h3>")
        elif stripped.startswith("- "):
            if not in_list:
                processed_lines.append("<ul>")
                in_list = True
            content = stripped[2:]
            # Ensure bolding inside list item is processed
            content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', content)
            processed_lines.append(f"<li>{content}</li>")
        else:
            if in_list:
                processed_lines.append("</ul>")
                in_list = False
            # Ensure bolding inside paragraph is processed
            content = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', stripped)
            processed_lines.append(f"<p>{content}</p>")
            
    if in_list:
        processed_lines.append("</ul>")
        
    return "\n".join(processed_lines)

def generate_lecture_pdf(lecture_id: str) -> bytes:
    """
    Generates a PDF using Jinja2 and Playwright (sync).
    Returns PDF bytes.
    """
    # 1. Fetch Data
    data = get_lecture_for_summarization(lecture_id)
    if not data:
        raise Exception("Lecture not found")

    transcript = data.get("transcript") or ""
    summary = data.get("summary") or ""
    title = data.get("title") or "Lecture Notes"
    created_at = str(data.get("created_at") or datetime.now().date())
    if len(created_at) > 10:
        created_at = created_at[:10]
        
    duration_sec = data.get("total_duration_seconds") or 0
    duration_formatted = format_duration(duration_sec)
    total_chunks = data.get("total_chunks") or 0
    
    word_count = len(transcript.split()) if transcript else 0
    transcript_len = len(transcript)
    summary_len = len(summary)
    compression = round(summary_len / transcript_len, 2) if transcript_len > 0 else 0.0

    # 2. Prepare Template Context
    # Clean markdown in summary
    summary_html = clean_markdown_to_html(summary.strip())
    # Transcript removed from PDF as per requirement
    
    context = {
        "title": title,
        "created_at": created_at,
        "duration_formatted": duration_formatted,
        "word_count": word_count,
        "compression_ratio": compression,
        "total_chunks": total_chunks,
        "summary_html": summary_html
    }

    # 3. Render HTML via Jinja2
    template_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')
    env = Environment(loader=FileSystemLoader(template_dir))
    template = env.get_template('lecture_template.html')
    html_content = template.render(**context)

    # 4. Generate PDF via Playwright (reuses shared browser instance)
    browser = _get_browser()
    page = browser.new_page()
    try:
        page.set_content(html_content)
        pdf_bytes = page.pdf(
            format="A4",
            margin={
                "top": "30mm",
                "bottom": "30mm",
                "left": "26mm",
                "right": "26mm"
            },
            print_background=True,
            display_header_footer=True,
            header_template="<div></div>",
            footer_template="""
                <div style="
                    width: 100%;
                    font-size: 12px;
                    color: #9ca3af;
                    text-align: center;
                    padding-bottom: 30px;
                    font-family: Arial, sans-serif;
                ">
                    Generated by Neurativo • Page <span class='pageNumber'></span> of <span class='totalPages'></span>
                </div>
            """
        )
    finally:
        page.close()

    return pdf_bytes
