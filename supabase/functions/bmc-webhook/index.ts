// Buy Me a Coffee webhook → marca al usuario como Mecenas.
// Deploy: automático con la integración GitHub (declarada en supabase/config.toml), o `supabase functions deploy bmc-webhook`.
// Secrets: BMC_WEBHOOK_SECRET (página del webhook en BMC) y, opcional, SUPPORTER_MIN_AMOUNT (por defecto 5: un café).
//
// BMC envía JSON { event_id, type, live_mode, created, attempt, data } firmado con
// HMAC-SHA256(raw body, secret) en hex, cabecera `x-signature-sha256`.
// Los nombres de campo de `data` no están del todo documentados: se leen de forma defensiva
// y el evento completo se guarda en `donations.raw` para revisarlo.

import { createClient } from "npm:@supabase/supabase-js@2";

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Eventos que cuentan como apoyo (los refunds/cancelaciones solo se registran)
const SUPPORT_EVENTS = new Set([
  "donation.created",
  "membership.started",
  "recurring_donation.started",
  "extra_purchase.created",
]);

async function validSignature(rawBody: string, signature: string | null, secret: string) {
  if (!signature) return false;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  const got = signature.trim().toLowerCase();
  if (got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

const pick = (obj: Record<string, unknown>, ...keys: string[]) => {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") return obj[k];
  return undefined;
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
  // Aviso por Telegram (notify_admin_once: no repite la misma clave dentro del intervalo). Nunca lanza.
  const alert = async (key: string, text: string, within = "6 hours") => {
    const { error } = await supabase.rpc("notify_admin_once", {
      p_key: `bmc:${key}`, p_text: `☕⚠️ <b>Webhook de Buy Me a Coffee</b>\n${text}`, p_within: within,
    });
    if (error) console.error("notify_admin_once", error);
  };

  const secret = Deno.env.get("BMC_WEBHOOK_SECRET");
  if (!secret) {
    await alert("no_secret", "Falta el secreto BMC_WEBHOOK_SECRET: las donaciones no se están registrando.");
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const rawBody = await req.text();
  if (!(await validSignature(rawBody, req.headers.get("x-signature-sha256"), secret))) {
    // Puede ser ruido de internet, o que el secreto de BMC haya cambiado: un aviso cada 6 h como mucho
    await alert("bad_signature", "Llegó una petición con la firma incorrecta. Si no llegan las donaciones, " +
      "comprueba que BMC_WEBHOOK_SECRET coincide con el de la página del webhook en Buy Me a Coffee.");
    return new Response("Invalid signature", { status: 401 });
  }

  let event: Record<string, unknown>;
  try { event = JSON.parse(rawBody); } catch { return new Response("Bad request", { status: 400 }); }

  const type = String(event.type ?? "");
  const data = (event.data ?? event.response ?? {}) as Record<string, unknown>;
  const liveMode = event.live_mode !== false;

  const payEmail = String(pick(data, "supporter_email", "payer_email", "email") ?? "").trim().toLowerCase();
  const note = String(pick(data, "support_note", "note", "message") ?? "");
  const msgEmails = (note.match(EMAIL_RE) ?? []).map((e) => e.toLowerCase());
  const emails = [...new Set([...msgEmails, payEmail].filter(Boolean))];
  const amount = Number(pick(data, "amount", "total_amount", "support_amount", "membership_amount") ?? 0);
  const currency = String(pick(data, "currency", "support_currency") ?? "");
  const externalId = String(pick(data, "id", "support_id", "transaction_id") ?? event.event_id ?? crypto.randomUUID());

  const { error: insErr } = await supabase.from("donations").upsert(
    { external_id: `${type}:${externalId}`, provider: "bmc", type, email: payEmail || null, emails,
      amount, currency, live_mode: liveMode, raw: event },
    { onConflict: "external_id", ignoreDuplicates: true },
  );
  if (insErr) {
    console.error("donations insert", insErr);
    await alert(`insert:${externalId}`, `No se pudo guardar el evento <code>${esc(type)}</code> (${esc(amount)} ${esc(currency)}): ` +
      `<code>${esc(insErr.message)}</code>\nRevisa Admin → Donaciones y los logs de la función.`, "7 days");
  }

  // Los eventos de prueba (live_mode=false) se registran pero no activan Mecenas
  let matched = false;
  const minAmount = Number(Deno.env.get("SUPPORTER_MIN_AMOUNT") ?? "5");
  if (liveMode && SUPPORT_EVENTS.has(type) && amount >= minAmount) {
    for (const email of emails) {
      const { data: ok, error } = await supabase.rpc("mark_supporter_by_email", { p_email: email });
      if (error) {
        console.error("mark_supporter_by_email", error);
        await alert(`match:${externalId}`, `No se pudo activar Mecenas tras una donación: <code>${esc(error.message)}</code>\n` +
          "Actívalo a mano en Admin → Usuarios.", "7 days");
      }
      if (ok === true) matched = true;
    }
    if (matched) {
      await supabase.from("donations").update({ matched: true }).eq("external_id", `${type}:${externalId}`);
    }
  }

  return new Response(JSON.stringify({ ok: true, matched }), { headers: { "Content-Type": "application/json" } });
});
