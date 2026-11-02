"""Professional Word-document styling helpers for the ORBITAL GUARD submission.

Design system (shared by all five documents):
  * A4, 2.2 cm side margins; running header with a cyan rule; footer with
    "Page X of Y" field codes.
  * Display face Georgia (headings, navy) paired with Calibri body text — a
    deliberate pairing rather than one default family.
  * Numbered figures and tables with captions and a one-line explanation.
  * Callout boxes for measured results, honesty notes and limitations.
"""
from __future__ import annotations

from pathlib import Path

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor

NAVY = RGBColor(0x0B, 0x25, 0x45)
CYAN = RGBColor(0x0E, 0x74, 0x90)
SLATE = RGBColor(0x47, 0x55, 0x69)
INK = RGBColor(0x1E, 0x29, 0x3B)
AMBER = RGBColor(0xB4, 0x53, 0x09)
GREEN = RGBColor(0x04, 0x78, 0x57)
RED = RGBColor(0xB9, 0x1C, 0x1C)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

HEX_NAVY, HEX_CYAN, HEX_LIGHT, HEX_BAND, HEX_AMBER, HEX_GREEN, HEX_RED = "0B2545", "0E7490", "F1F5F9", "E2E8F0", "FEF3C7", "D1FAE5", "FEE2E2"
DISPLAY, BODY, MONO = "Georgia", "Calibri", "Consolas"
CONTENT_WIDTH_IN = 6.35


# ---------------------------------------------------------------- low-level xml
def _el(tag, **attrs):
    e = OxmlElement(tag)
    for k, v in attrs.items():
        e.set(qn(k), str(v))
    return e


def shade(cell, hex_fill):
    cell._tc.get_or_add_tcPr().append(_el("w:shd", **{"w:val": "clear", "w:color": "auto", "w:fill": hex_fill}))


def cell_margins(table, top=60, bottom=60, left=90, right=90):
    tblPr = table._tbl.tblPr
    mar = OxmlElement("w:tblCellMar")
    for tag, val in (("top", top), ("left", left), ("bottom", bottom), ("right", right)):
        mar.append(_el(f"w:{tag}", **{"w:w": val, "w:type": "dxa"}))
    tblPr.append(mar)


def table_borders(table, color="CBD5E1", size=4):
    borders = OxmlElement("w:tblBorders")
    for edge in ("top", "left", "bottom", "right", "insideH", "insideV"):
        borders.append(_el(f"w:{edge}", **{"w:val": "single", "w:sz": size, "w:space": 0, "w:color": color}))
    table._tbl.tblPr.append(borders)


def keep_with_next(par):
    par.paragraph_format.keep_with_next = True


def rule_under(par, color=HEX_CYAN, size=10):
    pPr = par._p.get_or_add_pPr()
    pbdr = OxmlElement("w:pBdr")
    pbdr.append(_el("w:bottom", **{"w:val": "single", "w:sz": size, "w:space": 4, "w:color": color}))
    pPr.append(pbdr)


def field(par, instr):
    r = par.add_run()
    r._r.append(_el("w:fldChar", **{"w:fldCharType": "begin"}))
    it = OxmlElement("w:instrText"); it.set(qn("xml:space"), "preserve"); it.text = instr
    r._r.append(it)
    r._r.append(_el("w:fldChar", **{"w:fldCharType": "separate"}))
    t = OxmlElement("w:t"); t.text = "1"
    r._r.append(t)
    r._r.append(_el("w:fldChar", **{"w:fldCharType": "end"}))
    return r


# ---------------------------------------------------------------- document setup
def new_document(doc_title: str, doc_code: str) -> Document:
    doc = Document()
    st = doc.styles
    normal = st["Normal"]
    normal.font.name = BODY
    normal.font.size = Pt(10.5)
    normal.font.color.rgb = INK
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.14

    for name, size, color, bold in (("Heading 1", 17, NAVY, True), ("Heading 2", 13, NAVY, True),
                                    ("Heading 3", 11.5, CYAN, True), ("Heading 4", 10.5, SLATE, True)):
        s = st[name]
        s.font.name = DISPLAY
        s.font.size = Pt(size)
        s.font.bold = bold
        s.font.color.rgb = color
        s.paragraph_format.space_before = Pt(14 if name == "Heading 1" else 10)
        s.paragraph_format.space_after = Pt(5)
        s.paragraph_format.keep_with_next = True

    for name in ("Caption",):
        s = st[name]
        s.font.name = BODY
        s.font.size = Pt(9)
        s.font.italic = True
        s.font.color.rgb = SLATE
        s.paragraph_format.space_before = Pt(3)
        s.paragraph_format.space_after = Pt(10)

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.right_margin = Cm(2.2)
    sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(1.9)
    sec.header_distance, sec.footer_distance = Cm(1.0), Cm(1.0)
    sec.different_first_page_header_footer = True

    # running header (not on the cover)
    h = sec.header.paragraphs[0]
    h.text = ""
    r = h.add_run("ORBITAL GUARD")
    r.font.name = DISPLAY; r.font.size = Pt(9); r.font.bold = True; r.font.color.rgb = NAVY
    r2 = h.add_run(f"   ·   {doc_title}")
    r2.font.name = BODY; r2.font.size = Pt(9); r2.font.color.rgb = SLATE
    h.alignment = WD_ALIGN_PARAGRAPH.LEFT
    rule_under(h, HEX_CYAN, 6)

    f = sec.footer.paragraphs[0]
    f.text = ""
    fr = f.add_run(f"{doc_code}  ·  Research prototype — not an operational SSA system")
    fr.font.size = Pt(8); fr.font.color.rgb = SLATE; fr.font.name = BODY
    f.add_run("\t\t")
    pr = f.add_run("Page "); pr.font.size = Pt(8); pr.font.color.rgb = SLATE
    field(f, "PAGE").font.size = Pt(8)
    of = f.add_run(" of "); of.font.size = Pt(8); of.font.color.rgb = SLATE
    field(f, "NUMPAGES").font.size = Pt(8)
    return doc


# ---------------------------------------------------------------- content blocks
class Builder:
    def __init__(self, doc: Document, title: str):
        self.doc = doc
        self.title = title
        self.fig = 0
        self.tab = 0

    # --- text
    def h1(self, text, numbered=None):
        p = self.doc.add_heading(text if numbered is None else f"{numbered}  {text}", level=1)
        rule_under(p, HEX_BAND, 6)
        return p

    def h2(self, text):
        return self.doc.add_heading(text, level=2)

    def h3(self, text):
        return self.doc.add_heading(text, level=3)

    def p(self, text="", bold_lead=None, size=None, italic=False, color=None, space_after=None):
        par = self.doc.add_paragraph()
        if bold_lead:
            r = par.add_run(bold_lead); r.bold = True
            r.font.color.rgb = NAVY
        r = par.add_run(text)
        r.italic = italic
        if size: r.font.size = Pt(size)
        if color: r.font.color.rgb = color
        if space_after is not None: par.paragraph_format.space_after = Pt(space_after)
        return par

    def bullet(self, text, lead=None):
        par = self.doc.add_paragraph(style="List Bullet")
        par.paragraph_format.space_after = Pt(3)
        if lead:
            r = par.add_run(lead); r.bold = True; r.font.color.rgb = NAVY
        par.add_run(text)
        return par

    def numbered(self, text, lead=None):
        par = self.doc.add_paragraph(style="List Number")
        par.paragraph_format.space_after = Pt(3)
        if lead:
            r = par.add_run(lead); r.bold = True; r.font.color.rgb = NAVY
        par.add_run(text)
        return par

    def code(self, text):
        par = self.doc.add_paragraph()
        par.paragraph_format.space_before = Pt(4)
        par.paragraph_format.space_after = Pt(8)
        par.paragraph_format.left_indent = Cm(0.3)
        r = par.add_run(text)
        r.font.name = MONO; r.font.size = Pt(8.5); r.font.color.rgb = NAVY
        pPr = par._p.get_or_add_pPr()
        pPr.append(_el("w:shd", **{"w:val": "clear", "w:fill": HEX_LIGHT}))
        return par

    def callout(self, label, text, kind="info"):
        fills = {"info": HEX_LIGHT, "measured": HEX_GREEN, "warn": HEX_AMBER, "danger": HEX_RED}
        colors = {"info": CYAN, "measured": GREEN, "warn": AMBER, "danger": RED}
        t = self.doc.add_table(rows=1, cols=1)
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = t.cell(0, 0)
        shade(cell, fills[kind])
        cell_margins(t, 90, 90, 130, 130)
        par = cell.paragraphs[0]
        par.paragraph_format.space_after = Pt(2)
        r = par.add_run(label.upper()); r.bold = True; r.font.size = Pt(8.5); r.font.color.rgb = colors[kind]; r.font.name = BODY
        p2 = cell.add_paragraph()
        p2.paragraph_format.space_after = Pt(0)
        r2 = p2.add_run(text); r2.font.size = Pt(9.5)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)
        return t

    def page_break(self):
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    # --- figures
    def figure(self, path, caption, explanation="", width=CONTENT_WIDTH_IN, max_height=7.4):
        from PIL import Image
        p = Path(path)
        # Prefer the print-optimised copy produced by optimize_assets.py.
        opt_dir = Path(__file__).resolve().parents[1] / "assets/opt"
        for cand in (opt_dir / (p.stem + ".jpg"), opt_dir / (p.stem + ".png")):
            if cand.exists():
                p = cand
                break
        if not p.exists():
            self.callout("figure unavailable", f"{caption} — the source image was not available at build time.", "warn")
            return
        iw, ih = Image.open(p).size
        w = width
        h = w * ih / iw
        if h > max_height:
            h = max_height
            w = h * iw / ih
        par = self.doc.add_paragraph()
        par.alignment = WD_ALIGN_PARAGRAPH.CENTER
        par.paragraph_format.space_before = Pt(6)
        par.paragraph_format.space_after = Pt(2)
        par.add_run().add_picture(str(p), width=Inches(w))
        keep_with_next(par)
        self.fig += 1
        cap = self.doc.add_paragraph(style="Caption")
        cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = cap.add_run(f"Figure {self.fig}. "); r.bold = True; r.italic = False; r.font.color.rgb = NAVY
        cap.add_run(caption)
        if explanation:
            ex = self.doc.add_paragraph()
            ex.alignment = WD_ALIGN_PARAGRAPH.CENTER
            ex.paragraph_format.space_after = Pt(10)
            rr = ex.add_run(explanation); rr.font.size = Pt(9); rr.font.color.rgb = SLATE
        return self.fig

    # --- tables
    def table(self, headers, rows, caption=None, explanation="", widths=None, font_size=9, header_fill=HEX_NAVY):
        if caption:
            self.tab += 1
            cap = self.doc.add_paragraph(style="Caption")
            cap.paragraph_format.space_after = Pt(3)
            r = cap.add_run(f"Table {self.tab}. "); r.bold = True; r.italic = False; r.font.color.rgb = NAVY
            cap.add_run(caption)
            keep_with_next(cap)
        t = self.doc.add_table(rows=1, cols=len(headers))
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        table_borders(t)
        cell_margins(t)
        hdr = t.rows[0]
        for i, h in enumerate(headers):
            c = hdr.cells[i]
            shade(c, header_fill)
            par = c.paragraphs[0]
            par.paragraph_format.space_after = Pt(0)
            r = par.add_run(str(h)); r.bold = True; r.font.size = Pt(font_size); r.font.color.rgb = WHITE
        # repeat header row on page breaks
        trPr = hdr._tr.get_or_add_trPr()
        trPr.append(_el("w:tblHeader", **{"w:val": "true"}))
        for ri, row in enumerate(rows):
            cells = t.add_row().cells
            for i, val in enumerate(row):
                c = cells[i]
                if ri % 2 == 1:
                    shade(c, "F8FAFC")
                par = c.paragraphs[0]
                par.paragraph_format.space_after = Pt(0)
                txt = str(val)
                bold = txt.startswith("**") and txt.endswith("**")
                r = par.add_run(txt.strip("*"))
                r.font.size = Pt(font_size)
                r.bold = bold
        if widths:
            for row in t.rows:
                for i, w in enumerate(widths):
                    row.cells[i].width = Inches(w)
        if explanation:
            ex = self.doc.add_paragraph()
            ex.paragraph_format.space_before = Pt(3)
            ex.paragraph_format.space_after = Pt(10)
            rr = ex.add_run(explanation); rr.font.size = Pt(8.5); rr.font.color.rgb = SLATE; rr.italic = True
        else:
            self.doc.add_paragraph().paragraph_format.space_after = Pt(4)
        return t

    def band(self, pairs, fill=HEX_LIGHT):
        """Two-column key/value band used for milestone headers."""
        t = self.doc.add_table(rows=0, cols=2)
        table_borders(t, "E2E8F0")
        cell_margins(t, 50, 50, 100, 100)
        for k, v in pairs:
            cells = t.add_row().cells
            shade(cells[0], fill)
            p0 = cells[0].paragraphs[0]; p0.paragraph_format.space_after = Pt(0)
            r0 = p0.add_run(k); r0.bold = True; r0.font.size = Pt(8.5); r0.font.color.rgb = NAVY
            p1 = cells[1].paragraphs[0]; p1.paragraph_format.space_after = Pt(0)
            r1 = p1.add_run(v); r1.font.size = Pt(9)
            cells[0].width = Inches(1.5); cells[1].width = Inches(4.85)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)
        return t


# ---------------------------------------------------------------- cover page
def cover(doc, *, code, title, subtitle, abstract, meta_rows, metrics, banner=None):
    b = Builder(doc, title)
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run("ORBITAL GUARD")
    r.font.name = DISPLAY; r.font.size = Pt(30); r.font.bold = True; r.font.color.rgb = NAVY
    p2 = doc.add_paragraph()
    r2 = p2.add_run("AI-Powered Space Debris Detection and Collision Risk Analysis")
    r2.font.name = BODY; r2.font.size = Pt(12); r2.font.color.rgb = CYAN
    rule_under(p2, HEX_CYAN, 12)

    p3 = doc.add_paragraph()
    p3.paragraph_format.space_before = Pt(16)
    r3 = p3.add_run(title)
    r3.font.name = DISPLAY; r3.font.size = Pt(21); r3.font.bold = True; r3.font.color.rgb = NAVY
    p4 = doc.add_paragraph()
    r4 = p4.add_run(subtitle)
    r4.font.size = Pt(11); r4.font.color.rgb = SLATE

    if banner and Path(banner).exists():
        par = doc.add_paragraph()
        par.paragraph_format.space_before = Pt(10)
        par.paragraph_format.space_after = Pt(8)
        par.add_run().add_picture(str(banner), width=Inches(CONTENT_WIDTH_IN))

    b.table(["Document", "Detail"], meta_rows, widths=[1.7, 4.65], font_size=9)

    p5 = doc.add_paragraph()
    r5 = p5.add_run("Summary"); r5.font.name = DISPLAY; r5.font.size = Pt(12); r5.bold = True; r5.font.color.rgb = NAVY
    b.p(abstract)

    # measured-fact strip instead of a decorative graphic
    b.table([m[0] for m in metrics], [[m[1] for m in metrics]], font_size=9, header_fill=HEX_CYAN)
    b.p("All quantitative statements in this document are traceable to the project's experiment records, "
        "API responses and test logs held in the repository (docs/evidence, ml/experiments). Synthetic results "
        "are labelled as such; no collision probability is claimed.", size=8.5, italic=True, color=SLATE)
    b.page_break()
    return b


def contents(b: Builder, entries):
    b.h1("Contents")
    b.table(["Section", "What it covers"], entries, widths=[2.3, 4.05], font_size=9)
