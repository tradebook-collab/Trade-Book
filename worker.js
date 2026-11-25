const ALLOWED_ORIGIN = "https://tradebook-collab.github.io";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SENDER_EMAIL = "tradebook2009@gmail.com";
const SENDER_NAME = "TradeBook";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
}
function getOtpInfo(type) {
  if (type === "change") return { subject: "TradeBook Password Change OTP", title: "TradeBook Password Change", message: "Use this OTP to confirm your TradeBook password change." };
  if (type === "delete") return { subject: "TradeBook Account Deletion OTP", title: "TradeBook Account Deletion", message: "Use this OTP to confirm permanent deletion of your TradeBook account." };
  return { subject: "TradeBook Password Reset OTP", title: "TradeBook Password Reset", message: "Use this OTP to reset your TradeBook password." };
}
function buildOtpHtml(otp, type) {
  const info = getOtpInfo(type);
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#182033"><div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e9f2;border-radius:16px;padding:28px"><h2 style="margin:0 0 12px">${info.title}</h2><p>${info.message}</p><div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px 10px;background:#f1f4f9;border-radius:12px">${otp}</div><p style="margin-top:20px">This code is valid for <strong>2 minutes</strong>.</p><p style="font-size:13px;color:#667085">If you did not request this code, you can safely ignore this email.</p></div></body></html>`;
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method === "GET") return json({ success: true, message: "Trade Book OTP Worker is online" }, 200, origin);
    const url = new URL(request.url);
    if (url.pathname !== "/send-otp" || request.method !== "POST") return json({ success: false, error: "Not found" }, 404, origin);
    if (origin && origin !== ALLOWED_ORIGIN) return json({ success: false, error: "Origin not allowed" }, 403, origin);
    if (!env.BREVO_API_KEY) return json({ success: false, error: "BREVO_API_KEY is not configured." }, 500, origin);
    let body; try { body = await request.json(); } catch { return json({ success: false, error: "Invalid JSON body." }, 400, origin); }
    const to = String(body?.to || "").trim(); const otp = String(body?.otp || "").trim(); const type = String(body?.type || "reset").trim().toLowerCase();
    if (!to || !/^\d{6}$/.test(otp) || !["reset", "change", "delete"].includes(type)) return json({ success: false, error: "Invalid to, otp, or type." }, 400, origin);
    const info = getOtpInfo(type);
    const payload = { sender: { name: SENDER_NAME, email: SENDER_EMAIL }, to: [{ email: to }], subject: info.subject, textContent: `${info.message} Your OTP is ${otp}.\n\nThis code is valid for 2 minutes.`, htmlContent: buildOtpHtml(otp, type) };
    let response; try { response = await fetch(BREVO_ENDPOINT, { method: "POST", headers: { accept: "application/json", "api-key": env.BREVO_API_KEY, "content-type": "application/json" }, body: JSON.stringify(payload) }); } catch { return json({ success: false, error: "Brevo request failed." }, 502, origin); }
    if (!response.ok) { let detail = "Brevo rejected the request."; try { const data = await response.json(); detail = data?.message || data?.code || detail; } catch {} return json({ success: false, error: detail }, response.status, origin); }
    let result = {}; try { result = await response.json(); } catch {}
    return json({ success: true, type, messageId: result?.messageId || null }, 200, origin);
  }
};
