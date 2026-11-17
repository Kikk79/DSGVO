import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/atkinson-hyperlegible-next/wght.css";
import App from "./App";
import "./styles/globals.css";

async function start() {
  // Entwicklungsmodus im normalen Browser (ohne Tauri-Laufzeit): Backend simulieren.
  // Der dynamische Import hinter import.meta.env.DEV fehlt im Produktions-Build.
  if (import.meta.env.DEV && !("__TAURI_INTERNALS__" in window)) {
    const { installMockBackend } = await import("./dev/mockBackend");
    installMockBackend();
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

void start();
