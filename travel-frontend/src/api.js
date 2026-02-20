// travel-frontend/src/api.js

import axios from "axios"; // HTTP client

// Base URL of Django API
const BASE_URL = "http://127.0.0.1:8000/api";

// Main axios instance (used everywhere)
export const api = axios.create({
  baseURL: BASE_URL, // All requests go to /api/...
});

// Plain instance (no interceptors) used ONLY for refresh to avoid infinite loops
const plain = axios.create({
  baseURL: BASE_URL,
});

// Attach access token to every request
api.interceptors.request.use((config) => {
  // Read access token from browser storage
  const access = localStorage.getItem("access");

  // If it exists, attach it to Authorization header
  if (access) {
    config.headers.Authorization = `Bearer ${access}`;
  }

  return config;
});

// Refresh access token using refresh token
async function refreshAccessToken() {
  // Read refresh token from browser storage
  const refresh = localStorage.getItem("refresh");

  // If there is no refresh token, we cannot refresh
  if (!refresh) {
    throw new Error("No refresh token stored");
  }

  // Call backend refresh endpoint
  const r = await plain.post("/auth/refresh/", { refresh });

  // Save new access token
  localStorage.setItem("access", r.data.access);

  // Return new access token
  return r.data.access;
}

// If request fails with 401, refresh token and retry once
api.interceptors.response.use(
  (response) => response, // On success, return response
  async (error) => {
    const original = error.config;

    // If unauthorized and not retried yet
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true; // Mark as retried once

      try {
        // Refresh the token
        const newAccess = await refreshAccessToken();

        // Retry original request with new token
        original.headers.Authorization = `Bearer ${newAccess}`;
        return api(original);
      } catch (e) {
        // Refresh failed -> logout user cleanly
        localStorage.removeItem("access");
        localStorage.removeItem("refresh");
        window.location.href = "/login";
      }
    }

    // Other errors -> just throw
    return Promise.reject(error);
  }
);