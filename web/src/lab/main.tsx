import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Lab, shots } from "./Lab";
import "../theme.css";
import "../ui/base.css";
import "./lab.css";

// scripts/shots.mjs reads the list of shots from here.
(window as unknown as { __LAB_SHOTS__: typeof shots }).__LAB_SHOTS__ = shots;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Lab />
  </StrictMode>,
);
