import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    try {
      const r = await api.post("/auth/login/", { username, password });
      localStorage.setItem("access", r.data.access);
      localStorage.setItem("refresh", r.data.refresh);
      nav("/chat");
    } catch {
      setErr("Login failed. Check username/password.");
    }
  };

  return (
    <div>
      <h2>Login</h2>
      {err && <p>{err}</p>}
      <form onSubmit={onSubmit}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
        <br />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
        <br />
        <button type="submit">Sign in</button>
      </form>
      <p>
        No account? <Link to="/register">Register</Link>
      </p>
    </div>
  );
}
