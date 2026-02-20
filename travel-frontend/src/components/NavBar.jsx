import { Link } from "react-router-dom";

// NavBar shows the top tabs + login/logout button
export default function NavBar({ activeTab, setActiveTab }) {
  return (
    // Top bar container
    <div className="navbar">
      {/* Left side: CHAT / FLIGHT tabs */}
      <div className="nav-left">
        <button
          // Switch tab to "chat"
          onClick={() => setActiveTab("chat")}
          // Apply active styling when selected
          className={`btn ${activeTab === "chat" ? "btn-active" : ""}`}
        >
          CHAT
        </button>

        <button
          // Switch tab to "flight"
          onClick={() => setActiveTab("flight")}
          // Apply active styling when selected
          className={`btn ${activeTab === "flight" ? "btn-active" : ""}`}
        >
          FLIGHT
        </button>
      </div>

      {/* Right side: login/logout */}
      <div>
        {localStorage.getItem("access") ? (
          <Link to="/logout" className="btn btn-link">
            LOGOUT
          </Link>
        ) : (
          <Link to="/login" className="btn btn-link">
            LOGIN
          </Link>
        )}
      </div>
    </div>
  );
}
