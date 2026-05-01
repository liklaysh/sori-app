import React from "react";
import ReactDOM from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: "var(--sori-surface-main)",
          border: "1px solid var(--sori-border-subtle)",
          color: "var(--sori-text-primary)",
          fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
          borderRadius: "12px"
        },
        className: "sori-toast"
      }}
    />
  </React.StrictMode>
);
