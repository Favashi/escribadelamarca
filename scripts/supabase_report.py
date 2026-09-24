#!/usr/bin/env python3
"""Informe de salud de Supabase por Telegram, con la Management API (sin servicios externos).

- Cada día: errores de las últimas 24 h en los logs (API 5xx, Edge Functions, Auth y Postgres). El plan gratuito
  guarda los logs 1 día, por eso se consulta a diario. Solo avisa si hay algo que mirar.
- Los lunes (o con --advisors): Advisors de seguridad y rendimiento. Avisa siempre, aunque esté todo bien.

Lo ejecuta .github/workflows/supabase-report.yml. Variables de entorno:
  SUPABASE_ACCESS_TOKEN   token personal (Supabase → Account → Access Tokens). Obligatorio.
  TELEGRAM_BOT_TOKEN y TELEGRAM_MONITOR_CHAT_ID (o TELEGRAM_CHAT_ID)   opcionales; sin ellos solo se escribe en el log.
Sin dependencias: solo la biblioteca estándar de Python.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
API = 'https://api.supabase.com'
with open(os.path.join(ROOT, 'js/config.js'), encoding='utf-8') as f:
    REF = re.search(r"SUPABASE_URL = 'https://([a-z0-9]+)\.supabase\.co'", f.read()).group(1)
TOKEN = os.environ.get('SUPABASE_ACCESS_TOKEN', '')
DASHBOARD = f'https://supabase.com/dashboard/project/{REF}'

# Umbrales para avisar. Muchos errores de Postgres son normales: accesos que la seguridad rechaza («permission
# denied»), «ya existe» al añadir dos veces… Los FATAL por reinicio (despliegues de Supabase) no cuentan.
PG_ERRORS_THRESHOLD = 50
AUTH_ERRORS_THRESHOLD = 5
BENIGN_FATAL = "event_message not like '%terminating connection due to administrator command%'"

# Avisos de los Advisors revisados y aceptados (ver las migraciones): no se repiten cada semana.
# (título del aviso, nombre del objeto; '' = aviso sin objeto)
KNOWN_ADVISORS = {
    # La lista de deseos compartida se ve sin sesión, a propósito
    ('Public Can Execute SECURITY DEFINER Function', 'public_wishlist'),
    # Funciones que llaman los usuarios con sesión; las admin_* comprueban assert_admin() por dentro
    *(('Signed-In Users Can Execute SECURITY DEFINER Function', f) for f in (
        'admin_apply_suggestion', 'admin_donations', 'admin_match_donation', 'admin_metrics', 'admin_reject_suggestion',
        'admin_restore_version', 'admin_set_supporter', 'admin_users', 'delete_my_account', 'is_admin', 'is_supporter',
        'public_wishlist', 'scribes', 'setting_enabled', 'trade_matches')),
    # Solo se entra con Google: no hay contraseñas que comprobar (y además es de pago)
    ('Leaked Password Protection Disabled', ''),
}


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def api(path, params=None):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {TOKEN}', 'User-Agent': 'escribadelamarca-report'})
    with urllib.request.urlopen(req, timeout=60) as res:
        return json.load(res)


def iso(dt):
    """Fecha UTC con «Z» (la API rechaza el formato «+00:00» de isoformat())."""
    return dt.astimezone(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.000Z')


def logs(sql, start, end):
    data = api(f'/v1/projects/{REF}/analytics/endpoints/logs', {
        'sql': sql, 'iso_timestamp_start': iso(start), 'iso_timestamp_end': iso(end)})
    if data.get('error'):
        raise RuntimeError(f'Error en la consulta de logs: {data["error"]}')
    return data.get('result') or []


def telegram(text, buttons=None):
    # Canal de monitorización; si no está configurado, el chat de siempre
    token = os.environ.get('TELEGRAM_BOT_TOKEN')
    chat = os.environ.get('TELEGRAM_MONITOR_CHAT_ID') or os.environ.get('TELEGRAM_CHAT_ID')
    print(text)
    if not token or not chat:
        print('(Sin secretos de Telegram: no se avisa.)')
        return
    payload = {'chat_id': chat, 'text': text[:3900], 'parse_mode': 'HTML', 'disable_web_page_preview': 'true'}
    if buttons:
        payload['reply_markup'] = json.dumps({'inline_keyboard': [[{'text': t, 'url': u} for t, u in buttons]]})
    try:
        urllib.request.urlopen(f'https://api.telegram.org/bot{token}/sendMessage',
                               data=urllib.parse.urlencode(payload).encode(), timeout=20).read()
    except Exception as e:
        print(f'No se pudo avisar por Telegram: {e}')


def summary(md):
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
            f.write(md + '\n')


# ---------- Logs de las últimas 24 h ----------
COUNTS_SQL = """
select
  countIf(source = 'edge_logs') as api_total,
  countIf(source = 'edge_logs' and toInt32OrZero(log_attributes['response.status_code']) >= 500) as api_5xx,
  countIf(source = 'function_edge_logs' and toInt32OrZero(log_attributes['response.status_code']) >= 500) as fn_5xx,
  countIf(source = 'function_logs' and lower(log_attributes['level']) = 'error') as fn_errors,
  countIf(source = 'auth_logs' and lower(log_attributes['level']) in ('error', 'fatal')) as auth_errors,
  countIf(source = 'postgres_logs' and log_attributes['parsed.error_severity'] = 'ERROR'
          and event_message not like 'permission denied%') as pg_errors,
  countIf(source = 'postgres_logs' and log_attributes['parsed.error_severity'] = 'ERROR'
          and event_message like 'permission denied%') as pg_denied,
  countIf(source = 'postgres_logs' and log_attributes['parsed.error_severity'] in ('FATAL', 'PANIC') and {BENIGN_FATAL}) as pg_fatal
from logs
""".replace('{BENIGN_FATAL}', BENIGN_FATAL)
TOP_SQL = """
select source, substring(event_message, 1, 160) as msg, count() as n
from logs
where (source in ('edge_logs', 'function_edge_logs') and toInt32OrZero(log_attributes['response.status_code']) >= 500)
   or (source = 'function_logs' and lower(log_attributes['level']) = 'error')
   or (source = 'auth_logs' and lower(log_attributes['level']) in ('error', 'fatal'))
   or (source = 'postgres_logs' and log_attributes['parsed.error_severity'] in ('ERROR', 'FATAL', 'PANIC')
       and event_message not like 'permission denied%' and {BENIGN_FATAL})
group by source, msg
order by n desc
limit 8
""".replace('{BENIGN_FATAL}', BENIGN_FATAL)
SOURCE_NAMES = {'edge_logs': 'API', 'function_edge_logs': 'Función', 'function_logs': 'Función',
                'auth_logs': 'Auth', 'postgres_logs': 'Postgres'}


def logs_report():
    end = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    start = end - timedelta(hours=24)
    c = logs(COUNTS_SQL, start, end)[0]
    c = {k: int(v or 0) for k, v in c.items()}
    summary('## Logs de Supabase (últimas 24 h)\n\n| Métrica | Valor |\n|---|---|\n'
            + '\n'.join(f'| {k} | {v} |' for k, v in c.items()))
    alarming = (c['api_5xx'] + c['fn_5xx'] + c['fn_errors'] + c['pg_fatal']
                or c['auth_errors'] >= AUTH_ERRORS_THRESHOLD or c['pg_errors'] >= PG_ERRORS_THRESHOLD)
    if not alarming:
        print('Logs: nada que avisar.', c)
        return
    top = logs(TOP_SQL, start, end)
    lines = [
        '🩺 <b>Supabase: errores en las últimas 24 h</b>',
        f'API: {c["api_5xx"]} errores 5xx de {c["api_total"]} peticiones',
        f'Edge Functions: {c["fn_5xx"]} respuestas 5xx, {c["fn_errors"]} errores',
        f'Auth: {c["auth_errors"]} errores',
        f'Postgres: {c["pg_errors"]} errores{" (normal si son pocos: duplicados…)" if c["pg_errors"] < PG_ERRORS_THRESHOLD else ""}'
        + (f', <b>{c["pg_fatal"]} FATAL/PANIC</b>' if c['pg_fatal'] else ''),
        f'Accesos rechazados por la seguridad: {c["pg_denied"]} (normal: sesiones caducadas, curiosos…)',
    ]
    if top:
        lines += ['', '<b>Los más repetidos</b>:']
        lines += [f'• {SOURCE_NAMES.get(r["source"], r["source"])} ×{r["n"]}: <code>{esc(r["msg"])}</code>' for r in top]
    telegram('\n'.join(lines), [('Ver los logs', f'{DASHBOARD}/logs/explorer')])


# ---------- Advisors ----------
def advisors_report():
    found = []
    known = 0
    for kind, label in (('security', 'Seguridad'), ('performance', 'Rendimiento')):
        lints = api(f'/v1/projects/{REF}/advisors/{kind}').get('lints') or []
        for lint in lints:
            if lint.get('level') not in ('ERROR', 'WARN'):
                continue
            title = lint.get('title') or lint.get('name')
            name = (lint.get('metadata') or {}).get('name') or ''
            if (title, name) in KNOWN_ADVISORS:
                known += 1
                continue
            found.append((label, lint.get('level'), title, name))
    # Agrupa por aviso: «Función con search_path mutable (3): a, b, c»
    groups = {}
    for label, level, title, name in found:
        groups.setdefault((label, level, title), []).append(name)
    summary('## Advisors\n\n' + ('\n'.join(f'- {l} · {lv} · {t} ({len(n)})' for (l, lv, t), n in groups.items()) or '✓ Sin avisos'))
    known_txt = f' ({known} avisos ya revisados e intencionados)' if known else ''
    if not groups:
        telegram(f'🛡️ <b>Advisors de Supabase</b>: ✓ nada nuevo{known_txt}.')
        return
    lines = ['🛡️ <b>Advisors de Supabase</b>']
    for (label, level, title), names in sorted(groups.items(), key=lambda g: (g[0][1] != 'ERROR', g[0][0])):
        who = ', '.join(sorted({n for n in names if n}))[:200]
        lines.append(f'{"🔴" if level == "ERROR" else "🟡"} {esc(label)}: {esc(title)} ({len(names)})' + (f'\n   <i>{esc(who)}</i>' if who else ''))
    lines.append(f'\nSolo se listan los avisos nuevos{known_txt}. Si alguno es intencionado, añádelo a KNOWN_ADVISORS.')
    telegram('\n'.join(lines), [('Ver los Advisors', f'{DASHBOARD}/advisors/security')])


def main():
    if not TOKEN:
        print('Falta SUPABASE_ACCESS_TOKEN: no se puede consultar la Management API.')
        summary('⚠️ Falta el secreto `SUPABASE_ACCESS_TOKEN`: informe no generado.')
        return 0
    with_advisors = '--advisors' in sys.argv or datetime.now(timezone.utc).weekday() == 0
    problems = []
    auth_failed = False
    for name, fn in (('logs', logs_report), ('advisors', advisors_report if with_advisors else None)):
        if not fn:
            continue
        try:
            fn()
        except (urllib.error.HTTPError, urllib.error.URLError, RuntimeError, KeyError, IndexError, ValueError) as e:
            detail = e.read().decode('utf-8', 'replace')[:300] if isinstance(e, urllib.error.HTTPError) else str(e)[:300]
            auth_failed |= isinstance(e, urllib.error.HTTPError) and e.code in (401, 403)
            problems.append(f'{name}: {e} {detail}'.strip())
    if problems:
        telegram('⚠️ <b>No se pudo generar el informe de Supabase</b>\n' + '\n'.join(f'• <code>{esc(p)}</code>' for p in problems)
                 + ('\nEl token SUPABASE_ACCESS_TOKEN no es válido o ha caducado: crea otro y actualiza el secreto en GitHub.'
                    if auth_failed else ''))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
