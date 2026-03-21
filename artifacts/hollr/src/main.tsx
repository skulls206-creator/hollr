import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "@/components/errors/ErrorBoundary";
import "./index.css";

// Register service worker for push notifications + PWA
if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register(import.meta.env.BASE_URL + "sw.js")
    .then((reg) => console.log("[sw] registered", reg.scope))
    .catch((err) => console.warn("[sw] registration failed", err));

  // Handle notification click → navigate to the right URL
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.type === "NOTIFICATION_NAVIGATE" && e.data.url) {
      window.location.href = e.data.url;
    }
  });
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
