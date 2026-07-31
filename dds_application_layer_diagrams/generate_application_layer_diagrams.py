from __future__ import annotations

import math
from pathlib import Path
from textwrap import wrap

from PIL import Image, ImageDraw, ImageFont


OUT_DIR = Path(__file__).resolve().parent
FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(BOLD if bold else FONT, size)


COLORS = {
    "bg": "#f8fafc",
    "panel": "#ffffff",
    "ink": "#172033",
    "muted": "#526070",
    "line": "#475569",
    "frontend": "#e0f2fe",
    "app": "#ecfdf5",
    "data": "#fff7ed",
    "security": "#fee2e2",
    "service": "#dcfce7",
    "route": "#dbeafe",
    "store": "#ffedd5",
    "ai": "#ede9fe",
    "rate": "#fef9c3",
}


def rounded_box(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    title: str,
    body: str = "",
    *,
    fill: str = "#ffffff",
    outline: str = "#334155",
    title_size: int = 22,
    body_size: int = 17,
    radius: int = 16,
    width: int = 2,
) -> None:
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)
    x1, y1, x2, _ = xy
    tw = x2 - x1 - 28
    lines = []
    for part in title.split("\n"):
        lines.extend(wrap(part, max(12, tw // (title_size // 2))))
    y = y1 + 16
    for line in lines:
        draw.text((x1 + 14, y), line, font=font(title_size, True), fill=COLORS["ink"])
        y += title_size + 4
    if body:
        y += 4
        for part in body.split("\n"):
            wrapped = wrap(part, max(18, tw // (body_size // 2))) or [""]
            for line in wrapped:
                draw.text((x1 + 14, y), line, font=font(body_size), fill=COLORS["muted"])
                y += body_size + 5


def arrow(
    draw: ImageDraw.ImageDraw,
    start: tuple[int, int],
    end: tuple[int, int],
    *,
    fill: str = COLORS["line"],
    width: int = 3,
    label: str | None = None,
    label_offset: tuple[int, int] = (0, -28),
) -> None:
    draw.line([start, end], fill=fill, width=width)
    angle = math.atan2(end[1] - start[1], end[0] - start[0])
    size = 12
    p1 = (
        end[0] - size * math.cos(angle - math.pi / 6),
        end[1] - size * math.sin(angle - math.pi / 6),
    )
    p2 = (
        end[0] - size * math.cos(angle + math.pi / 6),
        end[1] - size * math.sin(angle + math.pi / 6),
    )
    draw.polygon([end, p1, p2], fill=fill)
    if label:
        mx = (start[0] + end[0]) // 2 + label_offset[0]
        my = (start[1] + end[1]) // 2 + label_offset[1]
        bbox = draw.textbbox((mx, my), label, font=font(16, True))
        draw.rounded_rectangle(
            (bbox[0] - 7, bbox[1] - 4, bbox[2] + 7, bbox[3] + 4),
            radius=8,
            fill=COLORS["bg"],
            outline="#cbd5e1",
        )
        draw.text((mx, my), label, font=font(16, True), fill=COLORS["ink"])


def title(draw: ImageDraw.ImageDraw, text: str, subtitle: str = "") -> None:
    draw.text((52, 34), text, font=font(34, True), fill=COLORS["ink"])
    if subtitle:
        draw.text((54, 78), subtitle, font=font(19), fill=COLORS["muted"])


def save(img: Image.Image, name: str) -> None:
    img.save(OUT_DIR / name, "PNG")


def topology() -> None:
    img = Image.new("RGB", (1900, 1220), COLORS["bg"])
    d = ImageDraw.Draw(img)
    title(
        d,
        "Application Layer Subsystem Topology",
        "FastAPI backend modules between the Next.js frontend and TrustFabric data/integration services",
    )

    rounded_box(d, (55, 150, 380, 1030), "Frontend Layer", "Next.js UI\nAuthProvider\nAPI client\nTanStack Query", fill=COLORS["frontend"])
    rounded_box(d, (455, 150, 1415, 1030), "Application Layer: FastAPI / Uvicorn", "", fill=COLORS["app"], width=3)
    rounded_box(d, (1490, 150, 1845, 1030), "Data & Integration Layer", "Firestore\nFirebase Auth\nGitHub REST\nAWS APIs\nSlack/Figma\nAI Providers", fill=COLORS["data"])

    boxes = [
        ((500, 230, 790, 365), "API Routing", "app/api/router.py\napp/api/routes/*", COLORS["route"]),
        ((835, 230, 1125, 365), "Auth & Authorization", "get_actor()\nrequire_admin()", COLORS["security"]),
        ((1170, 230, 1370, 365), "Rate Protection", "token bucket\n429 on overflow", COLORS["rate"]),
        ((500, 430, 790, 565), "Organization Context", "tenant resolution\nmembers + invites", COLORS["service"]),
        ((835, 430, 1125, 565), "Policy Repository", "governance policies\nscan policies", COLORS["service"]),
        ((1170, 430, 1370, 565), "Audit + Reports", "audit events\nHTML/PDF reports", COLORS["service"]),
        ((500, 630, 790, 765), "Compliance Scan Engine", "GitHub scans\nAWS scans", COLORS["service"]),
        ((835, 630, 1125, 765), "Framework Evaluation", "YAML frameworks\nscores + gaps", COLORS["service"]),
        ((1170, 630, 1370, 765), "AI + Brand Analysis", "copilot\nvision scanner", COLORS["ai"]),
    ]
    for xy, t, b, c in boxes:
        rounded_box(d, xy, t, b, fill=c, title_size=21, body_size=16)

    arrow(d, (380, 520), (500, 300), label="HTTP/JSON")
    arrow(d, (790, 300), (835, 300), label="Depends")
    arrow(d, (1125, 300), (1170, 300), label="limits")
    arrow(d, (650, 365), (650, 430))
    arrow(d, (980, 365), (980, 430))
    arrow(d, (1270, 365), (1270, 430))
    arrow(d, (650, 565), (650, 630))
    arrow(d, (980, 565), (980, 630))
    arrow(d, (1270, 565), (1270, 630))
    arrow(d, (1415, 300), (1490, 300), label="auth/store", label_offset=(-95, -28))
    arrow(d, (1415, 500), (1490, 500), label="queries", label_offset=(-85, -28))
    arrow(d, (1415, 700), (1490, 700), label="API calls", label_offset=(-85, -28))
    arrow(d, (650, 765), (650, 930), label="ScanRecord")
    arrow(d, (650, 930), (1490, 930), label="persist + notify", label_offset=(0, -34))
    arrow(d, (1490, 810), (1370, 700), label="results", label_offset=(-10, -38))

    d.text((58, 1090), "Figure: Application Layer subsystem topology and main cross-layer dependencies", font=font(20, True), fill=COLORS["muted"])
    save(img, "application_layer_topology.png")


def request_lifecycle() -> None:
    img = Image.new("RGB", (1700, 1220), COLORS["bg"])
    d = ImageDraw.Draw(img)
    title(
        d,
        "Authenticated Request Lifecycle",
        "How one protected frontend request becomes an organization-scoped backend service call",
    )

    steps = [
        ((120, 150, 465, 260), "1. Browser Request", "Authorization: Bearer token\nX-Organization-Id header", COLORS["frontend"]),
        ((675, 150, 1025, 260), "2. CORS + Router", "FastAPI route match\nrequest enters dependency chain", COLORS["route"]),
        ((1235, 150, 1580, 260), "3. Bearer Extraction", "HTTPBearer(auto_error=False)\nmissing token -> 401", COLORS["security"]),
        ((1235, 360, 1580, 490), "4. Token Verification", "Dev token in non-production\nor Firebase ID token", COLORS["security"]),
        ((675, 360, 1025, 490), "5. Organization Resolution", "membership lookup\nX-Organization-Id validation", COLORS["service"]),
        ((120, 360, 465, 490), "6. Role Check", "require_admin() blocks writes\nviewer reads allowed", COLORS["security"]),
        ((120, 600, 465, 730), "7. Pydantic Validation", "JSON body or file upload\ninvalid input -> 422", COLORS["route"]),
        ((675, 600, 1025, 730), "8. Service Function", "scan.py, copilot.py,\norganizations.py, store.py", COLORS["service"]),
        ((1235, 600, 1580, 730), "9. Data/External Call", "Firestore, GitHub, AWS,\nSlack, Figma, AI providers", COLORS["data"]),
        ((675, 860, 1025, 990), "10. Typed Response", "Pydantic model -> JSON\nreturned to frontend", COLORS["app"]),
    ]
    for xy, t, b, c in steps:
        rounded_box(d, xy, t, b, fill=c, title_size=22, body_size=16)

    arrows = [
        ((465, 205), (675, 205)),
        ((1025, 205), (1235, 205)),
        ((1408, 260), (1408, 360)),
        ((1235, 425), (1025, 425)),
        ((675, 425), (465, 425)),
        ((292, 490), (292, 600)),
        ((465, 665), (675, 665)),
        ((1025, 665), (1235, 665)),
        ((1408, 730), (1025, 925)),
        ((675, 925), (465, 665)),
    ]
    for s, e in arrows:
        arrow(d, s, e)

    rounded_box(d, (1130, 850, 1580, 1015), "Failure exits", "401 missing or invalid token\n403 insufficient organization role\n429 rate limited\n422 invalid request model", fill="#fee2e2", outline="#991b1b")
    arrow(d, (1465, 490), (1465, 850), fill="#991b1b", label="auth errors")

    d.text((122, 1090), "Figure: Application Layer protected request lifecycle using FastAPI dependencies and Pydantic validation", font=font(20, True), fill=COLORS["muted"])
    save(img, "authenticated_request_lifecycle.png")


def scan_flow() -> None:
    img = Image.new("RGB", (1900, 1320), COLORS["bg"])
    d = ImageDraw.Draw(img)
    title(
        d,
        "GitHub Compliance Scan Data Flow",
        "End-to-end path for POST /api/v1/scans from frontend action to persisted scan result",
    )

    rounded_box(d, (70, 170, 360, 285), "Frontend Scans Page", "User clicks Run Scan", fill=COLORS["frontend"])
    rounded_box(d, (460, 170, 760, 285), "POST /api/v1/scans", "ScanTriggerRequest\ngithub_org + scope", fill=COLORS["route"])
    rounded_box(d, (860, 170, 1160, 285), "Security Dependencies", "get_actor()\nRateLimited(expensive)", fill=COLORS["security"])
    rounded_box(d, (1260, 170, 1580, 285), "Scan Engine", "app/services/scan.py", fill=COLORS["service"])

    rounded_box(d, (1260, 420, 1580, 550), "Firestore Store", "GitHub connection\nscan policies\nsystems", fill=COLORS["store"])
    rounded_box(d, (860, 420, 1160, 550), "Secret Decryption", "decrypt_secret()\nFernet token recovery", fill=COLORS["security"])
    rounded_box(d, (460, 420, 760, 550), "GitHub REST API", "repos, branches\nsecurity settings\nCopilot org data", fill=COLORS["data"])
    rounded_box(d, (70, 420, 360, 550), "Evidence Snapshot", "repo-level facts\norg-level facts", fill=COLORS["app"])

    rounded_box(d, (70, 700, 360, 835), "Enabled Checks", "branch protection\nPR reviews\nsecret scanning\nCopilot controls", fill=COLORS["service"])
    rounded_box(d, (460, 700, 760, 835), "Evaluate Findings", "ScanViolation objects\ncompliant vs violation", fill=COLORS["service"])
    rounded_box(d, (860, 700, 1160, 835), "Optional Custom Policy AI", "Claude evaluation\nonly when configured", fill=COLORS["ai"])
    rounded_box(d, (1260, 700, 1580, 835), "Score + Record", "compliance_score\nScanRecord", fill=COLORS["app"])

    rounded_box(d, (460, 1000, 760, 1130), "Persist Result", "store.save_scan()\nlink_scan_to_systems()", fill=COLORS["store"])
    rounded_box(d, (860, 1000, 1160, 1130), "Report/Framework Ready", "HTML/PDF report\nframework evaluation", fill=COLORS["rate"])
    rounded_box(d, (1260, 1000, 1580, 1130), "Frontend Updates", "query invalidation\nscan detail display", fill=COLORS["frontend"])

    flow_arrows = [
        ((360, 227), (460, 227)),
        ((760, 227), (860, 227)),
        ((1160, 227), (1260, 227)),
        ((1420, 285), (1420, 420)),
        ((1260, 485), (1160, 485)),
        ((860, 485), (760, 485)),
        ((460, 485), (360, 485)),
        ((215, 550), (215, 700)),
        ((360, 785), (460, 785)),
        ((760, 785), (860, 785)),
        ((1160, 785), (1260, 785)),
        ((1420, 835), (610, 1000)),
        ((760, 1065), (860, 1065)),
        ((1160, 1065), (1260, 1065)),
    ]
    for s, e in flow_arrows:
        arrow(d, s, e)

    arrow(d, (1420, 550), (215, 700), label="enabled policy toggles", label_offset=(-120, -38))
    arrow(d, (215, 550), (610, 700), label="evidence", label_offset=(0, -40))

    d.text((72, 1220), "Figure: Application Layer GitHub compliance scan workflow and data movement", font=font(20, True), fill=COLORS["muted"])
    save(img, "github_compliance_scan_data_flow.png")


def main() -> None:
    topology()
    request_lifecycle()
    scan_flow()


if __name__ == "__main__":
    main()
