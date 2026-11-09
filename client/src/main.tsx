import { createRoot } from "react-dom/client";
import "./index.css";

async function bootstrap() {
  try {
    const response = await fetch("/api/crm-config.json", { cache: "no-store" });
    if (response.ok) {
      window.__WEBORA_CONFIG__ = await response.json();
    }
  } catch {
    // The app renders a setup state when runtime configuration is unavailable.
  }
  const { default: App } = await import("./App");
  createRoot(document.getElementById("root")!).render(<App />);
}

void bootstrap();
