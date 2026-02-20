import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { api } from "../api";

export default function Register() {
  const nav = useNavigate();
  const [form, setForm] = useState({
    username: "",
    email: "",
    first_name: "",
    last_name: "",
    age: "",
    password: "",
  });
  const [err, setErr] = useState("");

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");

    try {
      await api.post("/auth/register/", {
        ...form,
        age: form.age ? Number(form.age) : null,
      });

      // Auto-login after register (optional)
      const r = await api.post("/auth/login/", { username: form.username, password: form.password });
      localStorage.setItem("access", r.data.access);
      localStorage.setItem("refresh", r.data.refresh);

      nav("/chat");
    } catch {
      setErr("Register failed. Username/email might already exist.");
    }
  };

  return (
    <div>
      <h2>Register</h2>
      {err && <p>{err}</p>}
      <form onSubmit={onSubmit}>
        <input placeholder="username" value={form.username} onChange={(e) => set("username", e.target.value)} />
        <br />
        <input placeholder="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        <br />
        <input placeholder="first name" value={form.first_name} onChange={(e) => set("first_name", e.target.value)} />
        <br />
        <input placeholder="last name" value={form.last_name} onChange={(e) => set("last_name", e.target.value)} />
        <br />
        <input placeholder="age" value={form.age} onChange={(e) => set("age", e.target.value)} />
        <br />
        <input placeholder="password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} />
        <br />
        <button type="submit">Create account</button>
      </form>
      <p>
        Have account? <Link to="/login">Login</Link>
      </p>
    </div>
  );
}
