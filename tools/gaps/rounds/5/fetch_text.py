# The first round's way of keeping a text that was read (docs/plans/VISUAL-GAPS.md, section 3.2): a throwaway. It
# fetches a page or a PDF and writes its text to a file, with where it came from and when, so that a brief's quotes
# can be checked against exactly what was read (check.ts beside this file).
#
#   uv run --with pypdf --with beautifulsoup4 python -I tools/gaps/rounds/1/fetch_text.py <url> <out.txt>
#
# The bytes as fetched are kept beside the text, as <out>.raw. A PDF's pages are marked "[page N]", by the file's
# own count, which may differ from the numbers printed on its pages.
import datetime
import io
import pathlib
import subprocess
import sys

url, out = sys.argv[1], pathlib.Path(sys.argv[2])
out.parent.mkdir(parents=True, exist_ok=True)
raw = out.with_suffix(".raw")
subprocess.run(["curl", "-sSL", "--fail", "-m", "120", "-A", "Mozilla/5.0 (compatible; text-retrieval)", "-o", str(raw), url], check=True)
data = raw.read_bytes()
if data[:5] == b"%PDF-":
    from pypdf import PdfReader

    pages = PdfReader(io.BytesIO(data)).pages
    text = "\n\n".join(f"[page {i + 1}]\n{p.extract_text() or ''}" for i, p in enumerate(pages))
    kind = f"PDF, {len(pages)} pages"
else:
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(data, "html.parser")
    for tag in soup(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()
    # A line for each block, and the words inside one as they run: a link or an italic must not part a word from its comma.
    for tag in soup(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6", "tr", "br", "td", "th", "section", "article", "blockquote", "dd", "dt", "figcaption", "table", "title"]):
        tag.append("\n")
        tag.insert_before("\n")
    text = "\n".join(" ".join(line.split()) for line in soup.get_text().splitlines() if line.strip())
    kind = "HTML"
out.write_text(f"# {url}\n# fetched {datetime.date.today().isoformat()} ({kind}, {len(data)} bytes)\n\n{text}\n")
print(f"{out}: {kind}, {len(text)} characters of text")
if len(text) < 2000:
    print("  very little text: a page that needs a browser, a refusal, or a scan with no text layer. Read the file before citing it.")
