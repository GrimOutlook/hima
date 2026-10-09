import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/400.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "../assets/main.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing app root element");

createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
