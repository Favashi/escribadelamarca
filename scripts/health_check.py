#!/usr/bin/env python3
"""Comprueba que la app responde (web, API, Auth, Edge Function, CDN) y avisa por Telegram de los cambios de estado.

Lo ejecuta .github/workflows/health.yml cada 15 minutos. Solo avisa cuando algo se cae, cada 2 horas mientras
siga caído y cuando se recupera. El estado anterior se guarda en .health/state.json (caché de GitHub Actions).
Sin dependencias: solo la biblioteca estándar de Python.

Variables de entorno: TELEGRAM_BOT_TOKEN y TELEGRAM_MONITOR_CHAT_ID o, si no hay, TELEGRAM_CHAT_ID
(opcionales; sin ellas solo informa en el log)
y GITHUB_STEP_SUMMARY (la pone GitHub).
"""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATE_FILE = os.path.join(ROOT, '.health', 'state.json')
SITE = 'https://favashi.github.io/escribadelamarca/'
REMIND_EVERY = 2 * 3600
TZ = ZoneInfo('Europe/Madrid')


def read(path):
    with open(os.path.join(ROOT, path), encoding='utf-8') as f:
        return f.read()


config = read('js/config.js')
SUPABASE_URL = re.search(r"SUPABASE_URL = '([^']+)'", config).group(1)
ANON_KEY = re.search(r"SUPABASE_ANON_KEY = '([^']+)'", config).group(1)
SUPABASE_JS = re.search(r"from '(https://cdn\.jsdelivr\.net/[^']+)'", read('js/supabase.js')).group(1)

# (nombre, url, cabeceras, código esperado, texto que debe aparecer)
CHECKS = [
    ('Web (GitHub Pages)', SITE, {}, 200, 'Escriba de la Marca'),
    ('Código de la app', SITE + 'js/app.js', {}, 200, None),
    ('API de datos (Supabase)', SUPABASE_URL + '/rest/v1/categories?select=slug&limit=1', {'apikey': ANON_KEY}, 200, None),
    ('Inicio de sesión (Supabase Auth)', SUPABASE_URL + '/auth/v1/health', {'apikey': ANON_KEY}, 200, None),
    ('Webhook de donaciones (Edge Function)', SUPABASE_URL + '/functions/v1/bmc-webhook', {}, 405, None),
    ('Librería supabase-js (jsDelivr)', SUPABASE_JS, {}, 200, None),
]


def probe(url, headers, expected, text):
    """Devuelve None si va bien o el motivo del fallo."""
    req = urllib.request.Request(url, headers={'User-Agent': 'escribadelamarca-health', **headers})
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            code, body = res.status, res.read(200_000).decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        code, body = e.code, ''
    except Exception as e:  # red, DNS, timeout…
        return f'sin respuesta ({type(e).__name__}: {e})'[:200]
    if code != expected:
        return f'HTTP {code} (se esperaba {expected})'
    if text and text not in body:
        return f'la respuesta no contiene «{text}»'
    return None


def run_checks():
    failures = {}
    for name, url, headers, expected, text in CHECKS:
        error = probe(url, headers, expected, text)
        if error:                      # un reintento para no avisar por un fallo puntual
            time.sleep(20)
            error = probe(url, headers, expected, text)
        failures[name] = error
    return failures


def telegram(text):
    # Canal de monitorización; si no está configurado, el chat de siempre
    token = os.environ.get('TELEGRAM_BOT_TOKEN')
    chat = os.environ.get('TELEGRAM_MONITOR_CHAT_ID') or os.environ.get('TELEGRAM_CHAT_ID')
    if not token or not chat:
        print('Sin secretos de Telegram: no se avisa.')
        return
    data = urllib.parse.urlencode({
        'chat_id': chat, 'text': text, 'parse_mode': 'HTML', 'disable_web_page_preview': 'true',
        'reply_markup': json.dumps({'inline_keyboard': [[{'text': 'Abrir la app', 'url': SITE}]]}),
    }).encode()
    try:
        urllib.request.urlopen(f'https://api.telegram.org/bot{token}/sendMessage', data=data, timeout=20).read()
    except Exception as e:
        print(f'No se pudo avisar por Telegram: {e}')


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def hhmm(ts):
    return datetime.fromtimestamp(ts, TZ).strftime('%d/%m %H:%M')


def duration(seconds):
    m = int(seconds // 60)
    return f'{m} min' if m < 120 else f'{m // 60} h {m % 60} min'


def main():
    now = time.time()
    try:
        with open(STATE_FILE, encoding='utf-8') as f:
            prev = json.load(f)
    except (OSError, ValueError):
        prev = {'down': False}

    failures = run_checks()
    broken = {k: v for k, v in failures.items() if v}
    state = dict(prev)
    detail = '\n'.join(f'• <b>{esc(k)}</b>: {esc(v)}' for k, v in broken.items())

    if broken and not prev.get('down'):
        telegram(f'🚨 <b>Escriba de la Marca no funciona bien</b>\n{detail}')
        state = {'down': True, 'since': now, 'last_alert': now, 'broken': list(broken)}
    elif broken:
        if now - prev.get('last_alert', 0) >= REMIND_EVERY or set(broken) != set(prev.get('broken', [])):
            telegram(f'🚨 <b>Sigue fallando</b> desde el {hhmm(prev["since"])} ({duration(now - prev["since"])})\n{detail}')
            state['last_alert'] = now
        state['broken'] = list(broken)
    elif prev.get('down'):
        telegram(f'✅ <b>Escriba de la Marca vuelve a funcionar</b> tras {duration(now - prev["since"])} '
                 f'(desde el {hhmm(prev["since"])}).')
        state = {'down': False}

    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    with open(STATE_FILE, 'w', encoding='utf-8') as f:
        json.dump(state, f)

    lines = ['## Estado de Escriba de la Marca', '', '| Servicio | Estado |', '|---|---|']
    lines += [f'| {k} | {"✅" if not v else "❌ " + v} |' for k, v in failures.items()]
    if state.get('down'):
        lines += ['', f'Caído desde el {hhmm(state["since"])}.']
    summary = '\n'.join(lines)
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(summary + '\n')


if __name__ == '__main__':
    main()
