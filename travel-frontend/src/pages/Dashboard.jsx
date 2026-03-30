import { useEffect, useState } from "react";
import NavBar from "../components/NavBar";
import FlightPanel from "../panels/FlightPanel";
import TravelChat from "../components/chat/TravelChat";
import { api } from "../api";

// Dashboard is the main page with tabs and a big content box
export default function Dashboard() {
  // Active tab state
  const [activeTab, setActiveTab] = useState("chat");

  // Latest intent pulled from backend (optional UI display)
  const [latestIntent, setLatestIntent] = useState(null);

  // Load latest intent from backend
  const refreshIntent = async () => {
    try {
      const r = await api.get("/travel/intents/latest/");
      setLatestIntent(r.data.intent);
    } catch {
      setLatestIntent(null);
    }
  };

  // Load intent once on page load
  useEffect(() => {
    refreshIntent();
  }, []);

  return (
    <div>
      <NavBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main page padding */}
      <div className="container">
        {/* Big content box */}
        <div className="panel">
          {activeTab === "chat" ? (
            <TravelChat />
          ) : (
            <FlightPanel latestIntent={latestIntent} />
          )}
        </div>
      </div>
    </div>
  );
}