/**
 * TradeBook OTP Worker
 * Cloudflare Workers + Brevo SMTP API
 *
 * Required Worker secret:
 *   BREVO_API_KEY = your Brevo API key
 */

const ALLOWED_ORIGIN = "https://tradebook-collab.github.io";
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const SENDER_EMAIL = "tradebook2009@gmail.com";
const SENDER_NAME = "TradeBook";

function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  if (!origin || origin === ALLOWED_ORIGIN) {
    headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN;
  }

  return headers;
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
  return typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function isValidOtp(otp) {
  return typeof otp === "string" && /^\d{6}$/.test(otp);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getOtpInfo(type) {
  const map = {
    reset: {
      subject: "TradeBook Password Reset OTP",
      title: "TradeBook Password Reset",
      text: "Your TradeBook password reset OTP is"
    },
    change: {
      subject: "TradeBook Password Change OTP",
      title: "TradeBook Password Change",
      text: "Your TradeBook password change OTP is"
    },
    delete: {
      subject: "TradeBook Account Deletion OTP",
      title: "TradeBook Account Deletion",
      text: "Your TradeBook account deletion OTP is"
    }
  };
  return map[type] || map.reset;
}

function buildOtpHtml(otp, type) {
  const safeOtp = escapeHtml(otp);
  const info = getOtpInfo(type);
  return `<!doctype html>
<html><body style="font-family:Arial,sans-serif;background:#f5f7fb;padding:24px;color:#182033">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #e5e9f2;border-radius:16px;padding:28px">
<h2 style="margin:0 0 12px">${escapeHtml(info.title)}</h2>
<p>${escapeHtml(info.text)}:</p>
<div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;padding:18px 10px;background:#f1f4f9;border-radius:12px">${safeOtp}</div>
<p style="margin-top:20px">This code is valid for 2 minutes.</p>
<p style="font-size:13px;color:#667085">If you did not request this code, you can safely ignore this email.</p>
</div></body></html>`;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(origin)
      });
    }

    const url = new URL(request.url);

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return jsonResponse(
        { success: true, message: "Trade Book OTP Worker is online" },
        200,
        origin
      );
    }

    if (request.method !== "POST" || url.pathname !== "/send-otp") {
      return jsonResponse(
        { success: false, message: "Endpoint not found" },
        404,
        origin
      );
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return jsonResponse(
        { success: false, message: "Origin not allowed" },
        403,
        origin
      );
    }

    let body;
    try {
      body = await request.json();
    } catch (_) {
      return jsonResponse(
        { success: false, message: "Invalid JSON body" },
        400,
        origin
      );
    }

    const to = String(body?.to || "").trim().toLowerCase();
    const otp = String(body?.otp || "").trim();
    const type = String(body?.type || "reset").trim().toLowerCase();

    if (!isValidEmail(to)) {
      return jsonResponse(
        { success: false, message: "Invalid email address" },
        400,
        origin
      );
    }

    if (!isValidOtp(otp)) {
      return jsonResponse(
        { success: false, message: "OTP must contain exactly 6 digits" },
        400,
        origin
      );
    }

    if (!['reset','change','delete'].includes(type)) {
      return jsonResponse(
        { success: false, message: "Invalid OTP type" },
        400,
        origin
      );
    }

    const apiKey = String(env.BREVO_API_KEY || "").trim();

    if (!apiKey) {
      return jsonResponse(
        { success: false, message: "BREVO_API_KEY is not configured." },
        500,
        origin
      );
    }

    const payload = {
      sender: {
        name: SENDER_NAME,
        email: SENDER_EMAIL
      },
      to: [{ email: to }],
      subject: getOtpInfo(type).subject,
      textContent:
        `${getOtpInfo(type).text} ${otp}.\n\nThis code is valid for 2 minutes. If you did not request this code, ignore this email.`,
      htmlContent: buildOtpHtml(otp, type)
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
      return jsonResponse(
        { success: false, message: "Could not connect to Brevo" },
        502,
        origin
      );
    }

    if (!brevoResponse.ok) {
      let detail = "Brevo request failed";
      try {
        const errorData = await brevoResponse.json();
        detail = errorData?.message || errorData?.code || detail;
      } catch (_) {}

      return jsonResponse(
        { success: false, message: detail },
        brevoResponse.status,
        origin
      );
    }

    return jsonResponse(
      { success: true, message: "OTP sent successfully" },
      200,
      origin
    );
  }
};
