import { Link } from "react-router-dom";
import TravelChat from "../components/chat/TravelChat";

/**
 * Standalone full-page chat route: /chat
 */
export default function Chat() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0f1115",
        color: "white",
        padding: "24px",
      }}
    >
      <div
        style={{
          maxWidth: "1400px",
          margin: "0 auto",
          padding: "24px",
          borderRadius: "18px",
          background: "#111317",
          border: "1px solid #222733",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            alignItems: "center",
            marginBottom: "18px",
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0 }}>CHAT</h1>

          <div>
            <Link
              to="/logout"
              style={{
                color: "#9fc2ff",
                textDecoration: "none",
                fontWeight: "bold",
              }}
            >
              Logout
            </Link>
          </div>
        </div>

        <TravelChat />
      </div>
    </div>
  );
}