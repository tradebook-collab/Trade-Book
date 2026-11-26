/* TradeBook APK installer
   This file is additive only. Existing app.js functions are not modified.
*/
(function () {
  "use strict";

  const APK_URL =
    "https://github.com/tradebook-collab/Trade-Journal-Intraday-/releases/download/apk-latest/TradeBook.apk";

  function setupApkInstall() {
    const button = document.getElementById("installAppBtn");
    if (!button || button.dataset.apkHandlerAttached === "1") return;

    button.dataset.apkHandlerAttached = "1";

    button.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopImmediatePropagation();

      window.location.href = APK_URL;
    }, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupApkInstall);
  } else {
    setupApkInstall();
  }
})();
