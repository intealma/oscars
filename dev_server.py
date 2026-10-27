"""Lokal demo av sajten. Serverar filerna och tar emot beställningar på samma sätt som send.php gör på webbhotellet."""
import json
import re
import secrets
import sys
from datetime import date, datetime, timedelta
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ORDERS = ROOT / "orders" / "orders.php"
GUARD = "<?php exit; ?>\n"
HIDDEN = ("/orders", "/dev_server.py", "/send.php", "/README.md")
CUTOFF_HOUR = 9
MIN_PERSONS = 5


def earliest_lunch_date(now):
    d = now.date()
    if d.weekday() < 5 and now.hour < CUTOFF_HOUR:
        return d
    d += timedelta(days=1)
    while d.weekday() > 4:
        d += timedelta(days=1)
    return d


def clean(value, n=120):
    return " ".join(str(value or "").split())[:n]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if self.path.startswith(HIDDEN):
            return self.send_error(404)
        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith(HIDDEN):
            return self.send_error(404)
        super().do_HEAD()

    def do_POST(self):
        if self.path.split("?")[0] != "/send.php":
            return self.send_error(404)
        length = min(int(self.headers.get("Content-Length") or 0), 50000)
        try:
            data = json.loads(self.rfile.read(length).decode("utf-8", "replace"))
        except ValueError:
            return self.respond(False, 400)
        ref = f"OS-{datetime.now():%y%m%d}-{secrets.token_hex(2).upper()}"
        if data.get("webbplats"):
            return self.respond(True, ref=ref)

        menu = json.loads((ROOT / "meny.json").read_text(encoding="utf-8"))
        catalog = {r["id"]: r for r in menu["rader"]}
        groups, total, persons, vardag, forfragan = {}, 0, 0, False, False
        for row in data.get("rader") or []:
            item = catalog.get(clean(row.get("id"), 40))
            n = int(row.get("antal") or 0) if str(row.get("antal", "")).isdigit() else 0
            if not item or not 1 <= n <= 999:
                continue
            group = menu["grupper"][item["grupp"]]
            name = item["namn"]
            if item["id"].startswith("dagens"):
                name = f"{clean(row.get('namn')) or name} ({item['alt']})"
            groups.setdefault(group["namn"], []).append({"antal": n, "namn": name, "pris": item["pris"], "summa": n * item["pris"]})
            total += n * item["pris"]
            if group["typ"] == "vardag":
                vardag = True
                persons += n * group.get("personer", 1)
            else:
                forfragan = True
        if not groups:
            return self.respond(False, 422, fel="rader")

        now = datetime.now()
        try:
            datum = date.fromisoformat(str(data.get("datum")))
        except ValueError:
            return self.respond(False, 422, fel="datum")
        if datum < now.date() or (vardag and (datum.weekday() > 4 or datum < earliest_lunch_date(now) or persons < MIN_PERSONS)):
            return self.respond(False, 422, fel="datum")
        tid = data.get("tid") if re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", str(data.get("tid") or "")) else ""

        order = {
            "ref": ref,
            "tid": now.isoformat(timespec="seconds"),
            "typ": "Förfrågan" if forfragan else "Beställning",
            "datum": datum.isoformat(),
            "klockslag": tid,
            "rader": groups,
            "summa": total,
            "namn": clean(data.get("namn")),
            "foretag": clean(data.get("foretag")),
            "telefon": clean(data.get("telefon"), 40),
            "epost": clean(data.get("epost"), 160),
            "adress": clean(data.get("adress"), 200),
            "meddelande": str(data.get("meddelande") or "").strip()[:2000],
        }
        if not (order["namn"] and order["telefon"] and "@" in order["epost"] and order["adress"] and data.get("samtycke") == "ja"):
            return self.respond(False, 422, fel="kontakt")

        ORDERS.parent.mkdir(exist_ok=True)
        if not ORDERS.exists():
            ORDERS.write_text(GUARD, encoding="utf-8")
        with ORDERS.open("a", encoding="utf-8") as f:
            f.write(json.dumps(order, ensure_ascii=False).replace("<", "\\u003c").replace(">", "\\u003e") + "\n")
        rows = "\n".join(f"    {r['antal']} x {r['namn']}" for rs in groups.values() for r in rs)
        print(f"\n  {order['typ']} {ref}: {datum}, {total} kr, {order['foretag'] or order['namn']}\n{rows}\n", flush=True)
        self.respond(True, ref=ref)

    def respond(self, ok, status=200, **extra):
        body = json.dumps({"ok": ok, **extra}, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8086
    print(f"Restaurang Oscar demo: http://localhost:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
