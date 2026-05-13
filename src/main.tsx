import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "@/App";
import { getBasePath } from "@/config/env";
import "./app/globals.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element #root was not found.");
}

createRoot(rootElement).render(
  <BrowserRouter basename={getBasePath()}>
    <App />
  </BrowserRouter>
);
