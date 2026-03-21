import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import { applyNav, setPendingNav } from "@/lib/notification-nav";
import type { PendingNav } from "@/lib/notification-nav";
import "./index.css";

// Read URL params now (before React mounts), stash them, clean URL bar
(function captureUrlNav() {
  const params = new URLSearchParams(window.location.search);
  const navType = params.get("navType");
  if (!navType) return;

  let nav: PendingNav | null = null;
  if (navType === "channel") {
    const serverId = params.get("serverId");
    const channelId = params.get("channelId");
    if (serverId && channelId) nav = { type: "channel", serverId, channelId };
  } else if (navType === "dm") {
    const threadId = params.get("threadId");
    if (threadId) nav = { type: "dm", threadId };
  }
  if (nav) setPendingNav(nav);

  // Remove params from URL bar without reloading
  window.history.replaceState({}, "", window.location.pathname);
})();

// Register service worker for push notifications + PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js")
    .then((reg) => console.log("[sw] registered", reg.scope))
    .catch((err) => console.warn("[sw] registration failed", err));

  // Handle notification click when the app is already open → navigate without page reload
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "NOTIFICATION_NAVIGATE") {
      if (e.data.nav) {
        applyNav(e.data.nav as PendingNav);
      } else if (e.data.url) {
        window.location.href = e.data.url;
      }
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
