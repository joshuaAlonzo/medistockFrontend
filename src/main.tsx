import { createRoot } from "react-dom/client";
import App from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root application element.");

createRoot(root).render(
  <AuthProvider>
    <App />
  </AuthProvider>,
);
