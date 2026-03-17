// travel-frontend/src/pages/Login.jsx

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  // Store form input values
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // Error message shown under the form
  const [err, setErr] = useState("");

  const nav = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");

    try {
      // Ask backend for JWT tokens
      const r = await api.post("/auth/login/", {
        username,
        password,
      });

      // Save tokens into localStorage
      localStorage.setItem("access", r.data.access);
      localStorage.setItem("refresh", r.data.refresh);

      // IMPORTANT:
      // Redirect to homepage instead of /chat
      // because you said you want localhost:5173 after login
      nav("/");
    } catch (error) {
      setErr("Login failed. Check username/password.");
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f0f", color: "white", padding: "32px" }}>
      <div style={{ maxWidth: "420px", margin: "0 auto" }}>
        <h1>Login</h1>

        <form onSubmit={onSubmit}>
          <div style={{ marginBottom: "12px" }}>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              style={{ width: "100%", padding: "12px" }}
            />
          </div>

          <div style={{ marginBottom: "12px" }}>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="password"
              type="password"
              style={{ width: "100%", padding: "12px" }}
            />
          </div>

          <button type="submit" style={{ padding: "12px 18px" }}>
            Sign in
          </button>
        </form>

        {err && (
          <div style={{ marginTop: "14px", color: "#ff8a8a" }}>
            {err}
          </div>
        )}

        <div style={{ marginTop: "16px" }}>
          No account?{" "}
          <Link to="/register" style={{ color: "#8ab4ff" }}>
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}