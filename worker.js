const ALLOWED_ORIGIN =
  "https://tradebook-collab.github.io";

const BREVO_ENDPOINT =
  "https://api.brevo.com/v3/smtp/email";

const SENDER_EMAIL =
  "tradebook2009@gmail.com";

const SENDER_NAME =
  "TradeBook";

const OTP_TTL = 120;          // 2 minutes
const RESET_TTL = 600;        // 10 minutes


function corsHeaders(origin) {
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };

  headers["Access-Control-Allow-Origin"] =
    origin && origin !== ALLOWED_ORIGIN
      ? ALLOWED_ORIGIN
      : ALLOWED_ORIGIN;

  return headers;
}


function jsonResponse(body, status, origin) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        "Content-Type":
          "application/json; charset=utf-8",
        ...corsHeaders(origin)
      }
    }
  );
}


function isValidEmail(email) {
  return (
    typeof email === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  );
}


function isValidOtp(otp) {
  return (
    typeof otp === "string" &&
    /^\d{6}$/.test(otp)
  );
}


function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}


/* ==========================================
   OTP STORAGE
========================================== */

async function saveOtp(env, email, otp, type) {
  const key = `otp:${type}:${email}`;

  await env.OTP_STORE.put(
    key,
    JSON.stringify({
      otp,
      createdAt: Date.now()
    }),
    {
      expirationTtl: OTP_TTL
    }
  );
}


async function verifyOtp(env, email, otp, type) {
  const key = `otp:${type}:${email}`;

  const data =
    await env.OTP_STORE.get(key, "json");

  if (!data) {
    return false;
  }

  if (data.otp !== otp) {
    return false;
  }

  await env.OTP_STORE.delete(key);

  return true;
}


/* ==========================================
   RESET TOKEN STORAGE
========================================== */

function randomToken() {
  const bytes =
    crypto.getRandomValues(
      new Uint8Array(32)
    );

  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}


async function saveResetToken(
  env,
  token,
  email,
  localId
) {
  const key = `reset:${token}`;

  await env.OTP_STORE.put(
    key,
    JSON.stringify({
      email,
      localId,
      createdAt: Date.now()
    }),
    {
      expirationTtl: RESET_TTL
    }
  );
}


async function getResetToken(env, token) {
  if (
    typeof token !== "string" ||
    !token
  ) {
    return null;
  }

  return await env.OTP_STORE.get(
    `reset:${token}`,
    "json"
  );
}


async function consumeResetToken(env, token) {
  await env.OTP_STORE.delete(
    `reset:${token}`
  );
}


/* ==========================================
   FIREBASE SERVICE ACCOUNT AUTH
========================================== */

function base64UrlEncode(input) {
  let bytes;

  if (input instanceof Uint8Array) {
    bytes = input;
  } else {
    bytes = new TextEncoder().encode(
      String(input)
    );
  }

  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}


function pemToArrayBuffer(pem) {
  const base64 =
    pem
      .replace(
        "-----BEGIN PRIVATE KEY-----",
        ""
      )
      .replace(
        "-----END PRIVATE KEY-----",
        ""
      )
      .replace(/\s+/g, "");

  const binary =
    atob(base64);

  const bytes =
    new Uint8Array(
      binary.length
    );

  for (
    let i = 0;
    i < binary.length;
    i++
  ) {
    bytes[i] =
      binary.charCodeAt(i);
  }

  return bytes.buffer;
}


async function createServiceAccountJwt(env) {
  const privateKey =
    String(
      env.FIREBASE_PRIVATE_KEY || ""
    ).replaceAll("\\n", "\n");

  const clientEmail =
    String(
      env.FIREBASE_CLIENT_EMAIL || ""
    ).trim();

  if (
    !privateKey ||
    !clientEmail
  ) {
    throw new Error(
      "Firebase service account is not configured."
    );
  }

  const now =
    Math.floor(
      Date.now() / 1000
    );

  const header = {
    alg: "RS256",
    typ: "JWT"
  };

  const claimSet = {
    iss: clientEmail,
    scope:
      "https://www.googleapis.com/auth/identitytoolkit https://www.googleapis.com/auth/cloud-platform",
    aud:
      "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsigned =
    `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claimSet))}`;

  const key =
    await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(privateKey),
      {
        name:
          "RSASSA-PKCS1-v1_5",
        hash:
          "SHA-256"
      },
      false,
      ["sign"]
    );

  const signature =
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(
        unsigned
      )
    );

  return (
    `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`
  );
}


async function getGoogleAccessToken(env) {
  const assertion =
    await createServiceAccountJwt(
      env
    );

  const response =
    await fetch(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "content-type":
            "application/x-www-form-urlencoded"
        },
        body:
          new URLSearchParams({
            grant_type:
              "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion
          }).toString()
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data?.access_token
  ) {
    throw new Error(
      data?.error_description ||
      "Could not obtain Firebase service access token."
    );
  }

  return data.access_token;
}


/* ==========================================
   FIREBASE USER LOOKUP
========================================== */

async function findFirebaseUserByEmail(
  env,
  email
) {
  const projectId =
    String(
      env.FIREBASE_PROJECT_ID || ""
    ).trim();

  if (!projectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID is not configured."
    );
  }

  const accessToken =
    await getGoogleAccessToken(
      env
    );

  const endpoint =
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:query`;

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            returnUserInfo:
              true,
            limit:
              "1",
            expression: [
              {
                email:
                  email
              }
            ]
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Could not look up the Firebase account."
    );
  }

  const user =
    Array.isArray(data?.users)
      ? data.users[0]
      : null;

  return user || null;
}


/* ==========================================
   FIREBASE PASSWORD UPDATE
========================================== */

async function updateFirebasePassword(
  env,
  localId,
  newPassword
) {
  const projectId =
    String(
      env.FIREBASE_PROJECT_ID || ""
    ).trim();

  if (!projectId) {
    throw new Error(
      "FIREBASE_PROJECT_ID is not configured."
    );
  }

  const accessToken =
    await getGoogleAccessToken(
      env
    );

  const endpoint =
    `https://identitytoolkit.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/accounts:update`;

  const response =
    await fetch(
      endpoint,
      {
        method: "POST",
        headers: {
          Authorization:
            `Bearer ${accessToken}`,
          "Content-Type":
            "application/json"
        },
        body:
          JSON.stringify({
            localId,
            password:
              newPassword
          })
      }
    );

  const data =
    await response.json();

  if (!response.ok) {
    throw new Error(
      data?.error?.message ||
      "Could not update the Firebase password."
    );
  }

  return data;
}


/* ==========================================
   OTP TYPE INFORMATION
========================================== */

function getOtpInfo(type) {
  if (type === "change") {
    return {
      subject:
        "TradeBook Password Change OTP",

      title:
        "TradeBook Password Change",

      message:
        "Your TradeBook password change OTP is:"
    };
  }

  if (type === "delete") {
    return {
      subject:
        "TradeBook Account Deletion OTP",

      title:
        "TradeBook Account Deletion",

      message:
        "Your TradeBook account deletion OTP is:"
    };
  }

  if (type === "login") {
    return {
      subject:
        "TradeBook Login OTP",

      title:
        "TradeBook Login",

      message:
        "Your TradeBook login OTP is:"
    };
  }

  return {
    subject:
      "TradeBook Password Reset OTP",

    title:
      "TradeBook Password Reset",

    message:
      "Your TradeBook password reset OTP is:"
  };
}


/* ==========================================
   OTP EMAIL HTML
========================================== */

function buildOtpHtml(otp, type) {
  const safeOtp =
    escapeHtml(otp);

  const info =
    getOtpInfo(type);

  return `
<!doctype html>
<html>
<body
style="
font-family:Arial,sans-serif;
background:#f5f7fb;
padding:24px;
color:#182033;
">

<div
style="
max-width:520px;
margin:auto;
background:#fff;
border:1px solid #e5e9f2;
border-radius:16px;
padding:28px;
">

<h2 style="margin:0 0 12px">
${info.title}
</h2>

<p>
${info.message}
</p>

<div
style="
font-size:32px;
font-weight:700;
letter-spacing:8px;
text-align:center;
padding:18px 10px;
background:#f1f4f9;
border-radius:12px;
">

${safeOtp}

</div>

<p style="margin-top:20px">
This code is valid for 2 minutes.
</p>

<p
style="
font-size:13px;
color:#667085;
">

If you did not request this action,
you can safely ignore this email.

</p>

</div>

</body>
</html>
`;
}


/* ==========================================
   MAIN WORKER
========================================== */

export default {
  async fetch(request, env) {

    const origin =
      request.headers.get(
        "Origin"
      ) || "";


    /* =========================
       OPTIONS / CORS
    ========================= */

    if (
      request.method === "OPTIONS"
    ) {
      return new Response(
        null,
        {
          status: 204,
          headers:
            corsHeaders(origin)
        }
      );
    }


    const url =
      new URL(request.url);


    /* =========================
       HEALTH / STATUS
    ========================= */

    if (
      request.method === "GET" &&
      (
        url.pathname === "/" ||
        url.pathname === "/health"
      )
    ) {
      return jsonResponse(
        {
          success:
            true,

          message:
            "Trade Book OTP Worker is online"
        },
        200,
        origin
      );
    }


    /* =========================
       ORIGIN CHECK
    ========================= */

    if (
      origin &&
      origin !== ALLOWED_ORIGIN
    ) {
      return jsonResponse(
        {
          success:
            false,

          message:
            "Origin not allowed"
        },
        403,
        origin
      );
    }


    /* =========================
       READ JSON
    ========================= */

    let body;

    try {
      body =
        await request.json();
    } catch (_) {
      return jsonResponse(
        {
          success:
            false,

          message:
            "Invalid JSON body"
        },
        400,
        origin
      );
    }


    /* =========================
       SEND OTP
    ========================= */

    if (
      request.method === "POST" &&
      url.pathname === "/send-otp"
    ) {

      const to =
        String(
          body?.to || ""
        )
        .trim()
        .toLowerCase();

      const otp =
        String(
          body?.otp || ""
        )
        .trim();

      const type =
        String(
          body?.type ||
          "reset"
        )
        .trim()
        .toLowerCase();


      if (
        !isValidEmail(to)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Invalid email address"
          },
          400,
          origin
        );
      }


      if (
        !isValidOtp(otp)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "OTP must contain exactly 6 digits"
          },
          400,
          origin
        );
      }


      if (
        ![
          "reset",
          "change",
          "delete",
          "login"
        ].includes(type)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Invalid OTP type"
          },
          400,
          origin
        );
      }


      const apiKey =
        String(
          env.BREVO_API_KEY ||
          ""
        ).trim();

      if (!apiKey) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "BREVO_API_KEY is not configured."
          },
          500,
          origin
        );
      }


      const otpInfo =
        getOtpInfo(type);


      const payload = {
        sender: {
          name:
            SENDER_NAME,

          email:
            SENDER_EMAIL
        },

        to: [
          {
            email:
              to
          }
        ],

        subject:
          otpInfo.subject,

        textContent:
          `${otpInfo.message}

Your OTP is ${otp}.

This code is valid for 2 minutes.

If you did not request this action,
ignore this email.`,

        htmlContent:
          buildOtpHtml(
            otp,
            type
          )
      };


      let brevoResponse;

      try {
        brevoResponse =
          await fetch(
            BREVO_ENDPOINT,
            {
              method:
                "POST",

              headers: {
                accept:
                  "application/json",

                "api-key":
                  apiKey,

                "content-type":
                  "application/json"
              },

              body:
                JSON.stringify(
                  payload
                )
            }
          );
      } catch (_) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Could not connect to Brevo"
          },
          502,
          origin
        );
      }


      if (
        !brevoResponse.ok
      ) {

        let detail =
          "Brevo request failed";

        try {
          const errorData =
            await brevoResponse.json();

          detail =
            errorData?.message ||
            errorData?.code ||
            detail;

        } catch (_) {}


        return jsonResponse(
          {
            success:
              false,

            message:
              detail
          },
          brevoResponse.status,
          origin
        );
      }


      /* =========================
         SAVE OTP
      ========================= */

      try {
        await saveOtp(
          env,
          to,
          otp,
          type
        );
      } catch (_) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "OTP email was sent, but the OTP could not be stored."
          },
          500,
          origin
        );
      }


      return jsonResponse(
        {
          success:
            true,

          message:
            "OTP sent successfully",

          type:
            type
        },
        200,
        origin
      );
    }


    /* =========================
       VERIFY OTP
       RESET PASSWORD FLOW
    ========================= */

    if (
      request.method === "POST" &&
      url.pathname === "/verify-otp"
    ) {

      const email =
        String(
          body?.email || ""
        )
        .trim()
        .toLowerCase();

      const otp =
        String(
          body?.otp || ""
        )
        .trim();

      const type =
        String(
          body?.type ||
          "reset"
        )
        .trim()
        .toLowerCase();


      if (
        !["reset", "login"].includes(type)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "OTP verification is not available for this OTP type."
          },
          400,
          origin
        );
      }


      if (
        !isValidEmail(email)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Invalid email address"
          },
          400,
          origin
        );
      }


      if (
        !isValidOtp(otp)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Enter the 6-digit OTP."
          },
          400,
          origin
        );
      }


      const otpOk =
        await verifyOtp(
          env,
          email,
          otp,
          "reset"
        );


      if (!otpOk) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Incorrect or expired OTP."
          },
          400,
          origin
        );
      }

      if (type === "login") {
        return jsonResponse(
          {
            success: true,
            message: "Login OTP verified successfully"
          },
          200,
          origin
        );
      }


      let user;

      try {
        user =
          await findFirebaseUserByEmail(
            env,
            email
          );
      } catch (error) {
        return jsonResponse(
          {
            success:
              false,

            message:
              error.message ||
              "Could not verify the TradeBook account."
          },
          500,
          origin
        );
      }


      if (
        !user?.localId
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "No TradeBook account was found for this email address."
          },
          404,
          origin
        );
      }


      const resetToken =
        randomToken();


      await saveResetToken(
        env,
        resetToken,
        email,
        user.localId
      );


      return jsonResponse(
        {
          success:
            true,

          message:
            "OTP verified successfully",

          resetToken
        },
        200,
        origin
      );
    }


    /* =========================
       RESET PASSWORD
    ========================= */

    if (
      request.method === "POST" &&
      url.pathname === "/reset-password"
    ) {

      const resetToken =
        String(
          body?.resetToken ||
          ""
        ).trim();

      const email =
        String(
          body?.email ||
          ""
        )
        .trim()
        .toLowerCase();

      const newPassword =
        String(
          body?.newPassword ||
          ""
        );


      if (
        !resetToken ||
        !isValidEmail(email) ||
        !newPassword
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Invalid password reset request."
          },
          400,
          origin
        );
      }


      if (
        newPassword.length < 8 ||
        !/[A-Z]/.test(newPassword) ||
        !/[a-z]/.test(newPassword) ||
        !/\d/.test(newPassword) ||
        !/[^A-Za-z0-9]/.test(newPassword)
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Password does not meet the required conditions."
          },
          400,
          origin
        );
      }


      const resetData =
        await getResetToken(
          env,
          resetToken
        );


      if (
        !resetData
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Reset session expired. Please start Forgot Password again."
          },
          400,
          origin
        );
      }


      if (
        resetData.email !==
        email
      ) {
        return jsonResponse(
          {
            success:
              false,

            message:
              "Reset session does not match the email address."
          },
          400,
          origin
        );
      }


      try {
        await updateFirebasePassword(
          env,
          resetData.localId,
          newPassword
        );
      } catch (error) {
        return jsonResponse(
          {
            success:
              false,

            message:
              error.message ||
              "Could not update the Firebase password."
          },
          500,
          origin
        );
      }


      await consumeResetToken(
        env,
        resetToken
      );


      return jsonResponse(
        {
          success:
            true,

          message:
            "Password reset successfully"
        },
        200,
        origin
      );
    }


    /* =========================
       UNKNOWN ENDPOINT
    ========================= */

    return jsonResponse(
      {
        success:
          false,

        message:
          "Endpoint not found"
      },
      404,
      origin
    );
  }
};
