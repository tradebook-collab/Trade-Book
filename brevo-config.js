// TradeBook OTP Worker configuration.
// This file contains NO Brevo API key.
// Set workerEndpoint to your deployed Cloudflare Worker /send-otp URL.
window.TRADEBOOK_BREVO_CONFIG = {
  workerEndpoint: "https://tradebook-otp.tradebook2009.workers.dev/send-otp",
  senderName: "TradeBook"
};
