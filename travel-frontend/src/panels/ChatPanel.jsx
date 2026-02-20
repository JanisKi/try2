import { useState } from "react"; // React state
import { api } from "../api"; // Axios API wrapper

export default function ChatPanel({ onNewIntent }) {
  // Input text user types
  const [prompt, setPrompt] = useState("");

  // Log is plain text for MVP display
  const [log, setLog] = useState("");

  // Send one message to backend
  const send = async () => {
    // Do nothing if prompt is empty
    if (!prompt.trim()) return;

    // Save user message before clearing input
    const userText = prompt;

    // Clear input box immediately (better UX)
    setPrompt("");

    // Append user message to log
    setLog((p) => p + `\nYOU: ${userText}\n`);

    // Call backend chat endpoint
    const r = await api.post("/chat/send/", { prompt: userText });

    // Append bot response to log
    setLog((p) => p + `BOT: ${r.data.answer}\n`);

    // If a new intent may have been saved, ask parent to refresh it
    onNewIntent?.();
  };

  return (
    // ✅ Wrapping input + button in a form makes ENTER work automatically
    <form
      onSubmit={(e) => {
        e.preventDefault(); // Prevent browser page reload
        send(); // Send message
      }}
    >
      <h2>CHAT</h2>

      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={prompt} // Controlled input value
          onChange={(e) => setPrompt(e.target.value)} // Update state on typing
          placeholder='Try: "flights from Riga to Amsterdam tomorrow 1 adult"'
          style={{ width: "70%", padding: 8 }}
        />

        {/* ✅ type="submit" means Enter triggers this too */}
        <button type="submit" style={{ padding: "8px 16px" }}>
          Send
        </button>
      </div>

      {/* Log output */}
      <pre style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>{log}</pre>
    </form>
  );
}