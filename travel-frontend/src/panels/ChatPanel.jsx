// travel-frontend/src/panels/ChatPanel.jsx
//
// This ChatPanel:
// ✅ Sends chat messages to backend
// ✅ Shows chat history as a list (not one big string)
// ✅ If backend returns flight_widget, renders <FlightWidget initial={...} />
// ✅ ENTER key works (form submit)
// ✅ Has Clear button (clears only UI, does NOT touch tokens/login)

import { useState } from "react"; // React state hooks
import { api } from "../api"; // Axios instance
import FlightWidget from "../components/FlightWidget"; // ✅ Render flight widget inside chat

export default function ChatPanel({ onNewIntent }) {
  // Text user types into the input box
  const [prompt, setPrompt] = useState("");

  // Chat messages array
  // Each message: { role: "user" | "assistant", text: string, flight_widget?: object|null }
  const [messages, setMessages] = useState([]);

  // Send one message to backend
  const send = async () => {
    // Do nothing if user input is empty/whitespace
    if (!prompt.trim()) return;

    // Save the current prompt (because we clear input immediately)
    const userText = prompt;

    // Clear input (better UX)
    setPrompt("");

    // Add user message to UI immediately
    setMessages((prev) => [
      ...prev,
      { role: "user", text: userText, flight_widget: null },
    ]);

    try {
      // Call backend chat endpoint
      const r = await api.post("/chat/send/", { prompt: userText });

      // Extract response fields
      const answer = r.data?.answer || ""; // assistant text
      const flightWidget = r.data?.flight_widget || null; // optional widget payload

      // Add assistant message to UI
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: answer, flight_widget: flightWidget },
      ]);

      // Ask parent to refresh latest intent (updates Flight tab "Detected from chat")
      onNewIntent?.();
    } catch (e) {
      // Show a helpful error message in chat
      const msg =
        e?.response?.data?.detail ||
        e?.message ||
        "Chat request failed.";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${msg}`, flight_widget: null },
      ]);
    }
  };

  return (
    <div>
      <h2>CHAT</h2>

      {/* Form makes ENTER key send */}
      <form
        onSubmit={(e) => {
          e.preventDefault(); // prevent page reload
          send(); // send message
        }}
        style={{ display: "flex", gap: 8, alignItems: "center" }}
      >
        <input
          value={prompt} // controlled input
          onChange={(e) => setPrompt(e.target.value)} // update state
          placeholder='Try: "flight from Riga to Amsterdam, 1 adult, tomorrow"'
          style={{ width: "100%", padding: 10 }}
        />

        {/* Submit button (ENTER triggers this) */}
        <button type="submit" style={{ padding: "10px 18px" }}>
          Send
        </button>

        {/* Clear button clears only UI messages */}
        <button
          type="button"
          onClick={() => setMessages([])}
          style={{ padding: "10px 18px" }}
        >
          Clear
        </button>
      </form>

      {/* Messages */}
      <div style={{ marginTop: 18 }}>
        {messages.map((m, idx) => (
          <div key={idx} style={{ marginBottom: 16 }}>
            {/* Text message line */}
            <div style={{ whiteSpace: "pre-wrap" }}>
              <b>{m.role === "user" ? "YOU" : "BOT"}:</b> {m.text}
            </div>

            {/* ✅ If backend returned flight_widget, render the full widget below the bot message */}
            {m.flight_widget && (
              <div style={{ marginTop: 10 }}>
                <FlightWidget initial={m.flight_widget} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}