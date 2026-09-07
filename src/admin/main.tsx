import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import AdminApp from "./App";
import "../styles/system.css";
import "../styles/superadmin.css";

const root = document.getElementById("admin-root");

if (!root) throw new Error("超级管理中枢挂载节点不存在");

createRoot(root).render(
  <StrictMode>
    <AdminApp />
  </StrictMode>,
);
