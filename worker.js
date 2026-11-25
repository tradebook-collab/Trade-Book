/**
 * TradeBook OTP Worker
 * Cloudflare Workers + Brevo SMTP API
 *
 * Required Worker secrets/variables:
 *   BREVO_API_KEY   = your Brevo API key (Secret)
 *   SENDER_EMAIL    = your verified Brevo sender email
 * Optional variable:
 *   SENDER_NAME     = TradeBook
 */

const ALLOWED_ORIGIN = "https://tradebook-collab.github.io";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

function corsHeaders(origin) {
  const allowed = origin === ALLOWED_ORIGIN || origin === null || origin === "";
  return {
    "Access-Control-Allow-Origin": allowed ? (origin || ALLOWED_ORIGIN) : ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function jsonResponse(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin)
    }
  });
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email.trim());
}

function isValidOtp(otp) {
  return typeof otp === "string" && /^\\d{6}$/.test(otp);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function buildOtpHtml(otp) {
  const safeOtp = escapeHtml(otp);
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#182033">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e9f2;border-radius:16px;padding:28px">
<h2 style="margin:0 0 12px">TradeBook Password Reset</h2>
<p>Your TradeBook password reset OTP is:</p>
<div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px 10px;background:#f1f4f9;border-radius:12px">${safeOtp}</div>
<p style="margin-top:20px">This code is valid for <strong>2 minutes</strong>.</p>
<p style="font-size:13px;color:#667085">If you did not request this code, you can safely ignore this email.</p>
</div></body></html>`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/") {
      return jsonResponse({ success: true, message: "Trade Book OTP Worker is online" }, 200, origin);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return jsonResponse({ success: true, message: "Trade Book OTP Worker is online" }, 200, origin);
    }

    if (request.method !== "POST" || url.pathname !== "/send-otp") {
      return jsonResponse({ success: false, message: "Endpoint not found" }, 404, origin);
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonResponse({ success: false, message: "Origin not allowed" }, 403, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse({ success: false, message: "Invalid JSON body" }, 400, origin);
    }

    const to = String(body?.to || "").trim();
    const otp = String(body?.otp || "").trim();

    if (!isValidEmail(to)) {
      return jsonResponse({ success: false, message: "Invalid email address" }, 400, origin);
    }

    if (!isValidOtp(otp)) {
      return jsonResponse({ success: false, message: "OTP must contain exactly 6 digits" }, 400, origin);
    }

    const apiKey = String(env.BREVO_API_KEY || "").trim();
    const senderEmail = String(env.SENDER_EMAIL || "").trim();
    const senderName = String(env.SENDER_NAME || "TradeBook").trim();

    if (!apiKey || !senderEmail) {
      return jsonResponse({ success: false, message: "Worker Brevo configuration is missing" }, 500, origin);
    }

    const payload = {
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject: "TradeBook Password Reset OTP",
      textContent: `Your TradeBook password reset OTP is ${otp}.\\n\\nThis code is valid for 2 minutes. If you did not request this code, ignore this email.`,
      htmlContent: buildOtpHtml(otp)
    };

    let brevoResponse;
    try {
      brevoResponse = await fetch(BREVO_ENDPOINT, {
        method: "POST",
        headers: {
          "accept": "application/json",
          "api-key": apiKey,
          "content-type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (_) {
      return jsonResponse({ success: false, message: "Could not connect to Brevo" }, 502, origin);
    }

    if (!brevoResponse.ok) {
      let detail = "Brevo request failed";
      try {
        const errorData = await brevoResponse.json();
        detail = errorData?.message || errorData?.code || detail;
      } catch (_) {}
      return jsonResponse({ success: false, message: detail }, brevoResponse.status, origin);
    }

    return jsonResponse({ success: true, message: "OTP sent successfully" }, 200, origin);
  }
};
