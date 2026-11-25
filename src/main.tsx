import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { inTauri } from "./platform";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Web version: cache the app for offline use. (The desktop app is already local.)
if (!inTauri() && import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("offline cache unavailable", e));
  });
}
