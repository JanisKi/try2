import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

export default function Logout() {
  const nav = useNavigate();

  useEffect(() => {
    const run = async () => {
      const refresh = localStorage.getItem("refresh");

      try {
        if (refresh) {
          await api.post("/auth/logout/", { refresh });
        }
      } catch {
        // Even if request fails, we still clear tokens locally
      }

      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      nav("/login");
    };

    run();
  }, [nav]);

  return <p>Logging out...</p>;
}
