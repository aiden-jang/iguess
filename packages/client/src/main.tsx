// Self-hosted: Google's CDN was a render-blocking third party on the critical path.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/fredoka/wght.css";
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register the service worker for installability + offline shell — production only. In dev a
// cache-first worker serves stale bundles, so instead we unregister any that's lingering.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: the app works fine without it.
      });
    });
  } else {
    void navigator.serviceWorker
      .getRegistrations()
      .then((regs) => regs.forEach((r) => void r.unregister()));
  }
}

// Web Analytics. The token is locked to iguess.aidenjang.com, so anywhere else the beacon is
// CORS-refused and adds nothing but console noise.
if (import.meta.env.PROD && location.hostname === "iguess.aidenjang.com") {
  const beacon = document.createElement("script");
  beacon.type = "module";
  beacon.src = "https://static.cloudflareinsights.com/beacon.min.js";
  beacon.setAttribute(
    "data-cf-beacon",
    '{"token": "d82d578ac26b433aa45873add475d26e"}',
  );
  document.body.appendChild(beacon);
}
