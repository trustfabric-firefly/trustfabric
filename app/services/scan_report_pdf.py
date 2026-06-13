from __future__ import annotations

import unicodedata

from fpdf import FPDF
from fpdf.enums import XPos, YPos
from fpdf.fonts import TextStyle

from app.domain.models import ScanRecord

_PAGE_W = 210.0
_MARGIN = 16.0
_CONTENT_W = _PAGE_W - 2 * _MARGIN
_BODY_SIZE = 8
_LINE = 0.35

_TEXT_REPLACEMENTS = {
    "→": "->",
    "←": "<-",
    "↔": "<->",
    "…": "...",
    "✓": "OK",
    "⚠": "!",
    "’": "'",
    "‘": "'",
    "“": '"',
    "”": '"',
    "–": "-",
    "—": "-",
}


def _pdf_text(value: str) -> str:
    text = value or ""
    for old, new in _TEXT_REPLACEMENTS.items():
        text = text.replace(old, new)
    normalized = unicodedata.normalize("NFKD", text)
    return normalized.encode("latin-1", "replace").decode("latin-1")


def _hex_rgb(value: str) -> tuple[int, int, int]:
    cleaned = value.lstrip("#")
    return tuple(int(cleaned[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]


def _score_color(score: int) -> tuple[int, int, int]:
    if score >= 80:
        return _hex_rgb("#22c55e")
    if score >= 50:
        return _hex_rgb("#f59e0b")
    return _hex_rgb("#ef4444")


def _body_style(*, color: tuple[int, int, int] | None = None, bold: bool = False) -> TextStyle:
    return TextStyle(
        font_style="B" if bold else "",
        font_size_pt=_BODY_SIZE,
        color=color or _hex_rgb("#334155"),
    )


class _ScanReportPDF(FPDF):
    def footer(self) -> None:
        self.set_y(-12)
        self.set_font("Helvetica", "I", 7)
        self.set_text_color(*_hex_rgb("#94a3b8"))
        self.cell(0, 4, f"Page {self.page_no()}/{{nb}}", align="R")


def build_scan_report_pdf(record: ScanRecord) -> bytes:
    score = record.results.compliance_score
    score_rgb = _score_color(score)
    ts = record.timestamp.strftime("%B %d, %Y at %H:%M UTC")

    pdf = _ScanReportPDF(orientation="P", unit="mm", format="A4")
    pdf.set_margins(_MARGIN, _MARGIN, _MARGIN)
    pdf.set_auto_page_break(auto=True, margin=16)
    pdf.alias_nb_pages()
    pdf.add_page()

    _draw_header(pdf, record, ts)
    _draw_score_summary(pdf, score, score_rgb, record)
    _draw_violations_section(pdf, record)
    _draw_compliant_section(pdf, record)
    _draw_nist_section(pdf)

    pdf.set_y(-18)
    pdf.set_font("Helvetica", "I", 7)
    pdf.set_text_color(*_hex_rgb("#94a3b8"))
    pdf.cell(0, 4, "AI-assisted analysis. Human review required before taking action.", align="L")

    out = pdf.output()
    return bytes(out)


def _draw_header(pdf: FPDF, record: ScanRecord, ts: str) -> None:
    top = pdf.get_y()
    left_w = 92.0
    meta_w = 78.0
    meta_x = _PAGE_W - _MARGIN - meta_w
    line_h = 4.5

    pdf.set_xy(_MARGIN, top)
    pdf.set_font("Helvetica", "B", 18)
    pdf.set_text_color(*_hex_rgb("#1e293b"))
    pdf.cell(left_w, 8, "TrustFabric", new_x=XPos.LMARGIN, new_y=YPos.NEXT)

    pdf.set_x(_MARGIN)
    pdf.set_font("Helvetica", "", 10)
    pdf.set_text_color(*_hex_rgb("#64748b"))
    pdf.cell(left_w, 5, "AI Governance Compliance Report", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    left_bottom = pdf.get_y()

    meta = [
        _pdf_text(f"Organization: {record.organization}"),
        f"Scan ID: {record.scan_id[:8]}...",
        f"Date: {ts}",
        f"Duration: {record.duration_seconds:.1f}s",
    ]
    pdf.set_font("Helvetica", "", 8)
    pdf.set_text_color(*_hex_rgb("#475569"))
    y_meta = top
    for line in meta:
        pdf.set_xy(meta_x, y_meta)
        pdf.cell(meta_w, line_h, line, align="R")
        y_meta += line_h

    pdf.set_y(max(left_bottom, y_meta) + 6)
    pdf.set_draw_color(*_hex_rgb("#1e293b"))
    pdf.set_line_width(0.6)
    pdf.line(_MARGIN, pdf.get_y(), _PAGE_W - _MARGIN, pdf.get_y())
    pdf.set_line_width(_LINE)
    pdf.ln(8)


def _draw_score_summary(pdf: FPDF, score: int, score_rgb: tuple[int, int, int], record: ScanRecord) -> None:
    pad = 7.0
    score_w = 24.0
    stat_col_w = 18.0
    stat_count = 3
    stats_w = stat_col_w * stat_count
    stats_x = _PAGE_W - _MARGIN - pad - stats_w
    mid_x = _MARGIN + pad + score_w + 4
    mid_w = stats_x - mid_x - 6

    subtitle = f"Based on {record.results.total_policies} policies checked against GitHub configuration"
    pdf.set_font("Helvetica", "", _BODY_SIZE)
    subtitle_lines = pdf.multi_cell(mid_w, 4, _pdf_text(subtitle), dry_run=True, output="LINES")
    box_h = max(32.0, 14 + len(subtitle_lines) * 4 + 6)

    y0 = pdf.get_y()
    pdf.set_fill_color(*_hex_rgb("#f8fafc"))
    pdf.set_draw_color(*_hex_rgb("#e2e8f0"))
    pdf.rect(_MARGIN, y0, _CONTENT_W, box_h, style="DF")

    pdf.set_xy(_MARGIN + pad, y0 + (box_h - 12) / 2)
    pdf.set_font("Helvetica", "B", 16)
    pdf.set_text_color(*score_rgb)
    pdf.cell(score_w, 12, f"{score}%", align="C", new_x=XPos.RIGHT, new_y=YPos.TOP)

    pdf.set_xy(mid_x, y0 + pad)
    pdf.set_font("Helvetica", "B", 11)
    pdf.set_text_color(*_hex_rgb("#1e293b"))
    pdf.cell(mid_w, 5, "Overall Compliance Score", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_x(mid_x)
    pdf.set_font("Helvetica", "", _BODY_SIZE)
    pdf.set_text_color(*_hex_rgb("#64748b"))
    pdf.multi_cell(mid_w, 4, _pdf_text(subtitle))

    stats = (
        ("Violations", len(record.results.violations), "#ef4444"),
        ("Compliant", len(record.results.compliant), "#22c55e"),
        ("Total checks", record.results.total_policies, "#1e293b"),
    )
    stat_value_y = y0 + pad + 1
    stat_label_y = y0 + pad + 9
    for idx, (label, value, color) in enumerate(stats):
        x = stats_x + idx * stat_col_w
        pdf.set_xy(x, stat_value_y)
        pdf.set_font("Helvetica", "B", 12)
        pdf.set_text_color(*_hex_rgb(color))
        pdf.cell(stat_col_w, 6, str(value), align="C")
        pdf.set_xy(x, stat_label_y)
        pdf.set_font("Helvetica", "", 6.5)
        pdf.set_text_color(*_hex_rgb("#64748b"))
        pdf.cell(stat_col_w, 3.5, label.upper(), align="C")

    pdf.set_y(y0 + box_h + 8)


def _draw_violations_section(pdf: FPDF, record: ScanRecord) -> None:
    if record.results.violations:
        _section_heading(pdf, f"Policy Violations ({len(record.results.violations)})")
        _data_table(
            pdf,
            headers=["Policy", "Severity", "Evidence", "Recommendation"],
            col_widths=(42, 18, 59, 59),
            rows=[
                [
                    _pdf_text(v.policy_name),
                    v.severity.value.upper(),
                    _pdf_text(v.evidence),
                    _pdf_text(v.recommendation),
                ]
                for v in record.results.violations
            ],
            severity_col=1,
        )
    else:
        _section_heading(pdf, "No Violations Found")
        pdf.set_font("Helvetica", "", _BODY_SIZE)
        pdf.set_text_color(*_hex_rgb("#22c55e"))
        pdf.cell(0, 5, "All checked policies are compliant.", new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        pdf.ln(4)


def _draw_compliant_section(pdf: FPDF, record: ScanRecord) -> None:
    if not record.results.compliant:
        return
    _section_heading(pdf, f"Compliant Policies ({len(record.results.compliant)})")
    _data_table(
        pdf,
        headers=["Policy", "Severity", "Evidence"],
        col_widths=(50, 18, 110),
        rows=[
            [_pdf_text(c.policy_name), c.severity.value.upper(), _pdf_text(c.evidence)]
            for c in record.results.compliant
        ],
        severity_col=1,
    )


def _draw_nist_section(pdf: FPDF) -> None:
    _section_heading(pdf, "NIST AI RMF Alignment")
    items = [
        ("Govern", "Role-based access, advisory-only AI recommendations, policy lifecycle management"),
        ("Map", "AI system registry capturing model type, data sensitivity, integrations"),
        ("Measure", "Automated compliance scanning, LLM interaction logging, risk scoring"),
        ("Manage", "Rate limiting, risk tiers driving required controls, human-in-the-loop approval"),
    ]

    gap = 6.0
    col_w = (_CONTENT_W - gap) / 2
    inner_w = col_w - 8
    text_line_h = 3.6
    pad = 4.0

    rows: list[list[tuple[str, str, float]]] = []
    for i in range(0, len(items), 2):
        pair = items[i : i + 2]
        row_boxes: list[tuple[str, str, float]] = []
        for title, desc in pair:
            lines = pdf.multi_cell(inner_w, text_line_h, _pdf_text(desc), dry_run=True, output="LINES")
            box_h = pad + 5 + len(lines) * text_line_h + pad
            row_boxes.append((title, desc, box_h))
        rows.append(row_boxes)

    for row_boxes in rows:
        row_h = max(box[2] for box in row_boxes) + 2
        if pdf.get_y() + row_h > 272:
            pdf.add_page()

        y0 = pdf.get_y()
        for col_idx, (title, desc, _box_h) in enumerate(row_boxes):
            x = _MARGIN + col_idx * (col_w + gap)
            pdf.set_draw_color(*_hex_rgb("#e2e8f0"))
            pdf.set_fill_color(*_hex_rgb("#fafafa"))
            pdf.rect(x, y0, col_w, row_h, style="DF")

            pdf.set_xy(x + pad, y0 + pad)
            pdf.set_font("Helvetica", "B", _BODY_SIZE)
            pdf.set_text_color(*_hex_rgb("#d97706"))
            pdf.cell(inner_w, 4, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)

            pdf.set_x(x + pad)
            pdf.set_font("Helvetica", "", _BODY_SIZE)
            pdf.set_text_color(*_hex_rgb("#64748b"))
            pdf.multi_cell(inner_w, text_line_h, _pdf_text(desc))

        pdf.set_y(y0 + row_h + gap)


def _section_heading(pdf: FPDF, title: str) -> None:
    pdf.ln(2)
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*_hex_rgb("#64748b"))
    pdf.cell(0, 5, title.upper(), new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.set_draw_color(*_hex_rgb("#e2e8f0"))
    pdf.line(_MARGIN, pdf.get_y(), _PAGE_W - _MARGIN, pdf.get_y())
    pdf.ln(4)


def _data_table(
    pdf: FPDF,
    *,
    headers: list[str],
    col_widths: tuple[float, ...],
    rows: list[list[str]],
    severity_col: int | None = None,
) -> None:
    body = _body_style()
    with pdf.table(
        width=_CONTENT_W,
        col_widths=col_widths,
        line_height=4.2,
        text_align="LEFT",
        padding=(2, 2.5),
        first_row_as_headings=True,
        headings_style=TextStyle(
            font_style="B",
            font_size_pt=_BODY_SIZE,
            color=_hex_rgb("#64748b"),
            fill_color=_hex_rgb("#f1f5f9"),
        ),
    ) as table:
        header = table.row()
        for label in headers:
            header.cell(_pdf_text(label))

        for row in rows:
            data = table.row()
            for col_idx, value in enumerate(row):
                if severity_col is not None and col_idx == severity_col:
                    style = _severity_style(value.lower())
                else:
                    style = body
                data.cell(_pdf_text(value), style=style)

    pdf.ln(4)


def _severity_style(severity: str) -> TextStyle:
    color = _hex_rgb("#64748b")
    if severity == "high":
        color = _hex_rgb("#ef4444")
    elif severity == "medium":
        color = _hex_rgb("#f59e0b")
    return TextStyle(font_style="B", font_size_pt=_BODY_SIZE, color=color)
