import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

export default function Chat() {
  const [prompt, setPrompt] = useState("");
  const [out, setOut] = useState("");

  const send = async () => {
    if (!prompt.trim()) return;

    const userText = prompt;
    setPrompt("");
    setOut((p) => p + `\nYOU: ${userText}\n`);

    const r = await api.post("/chat/send/", { prompt: userText });
    setOut((p) => p + `BOT: ${r.data.answer}\n`);
  };

  return (
    <div>
      <h2>Chat</h2>
      <p>
        <Link to="/logout">Logout</Link>
      </p>

      <input value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Type message..." style={{ width: "70%" }} />
      <button onClick={send}>Send</button>

      <pre>{out}</pre>
    </div>
  );
}
