import React from "react";

/**
 * Turn snake_case into readable labels.
 */
function humanizeKey(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Recursively collect route-like objects from any backend response shape.
 * This makes the component more robust even if your backend evolves.
 */
function collectLegs(value, path = [], acc = []) {
  if (!value) return acc;

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectLegs(item, [...path, `Item ${index + 1}`], acc);
    });
    return acc;
  }

  if (typeof value !== "object") return acc;

  const looksLikeLeg =
    value.mode ||
    value.google_maps_url ||
    value.duration_minutes ||
    value.destination ||
    value.start_address;

  if (looksLikeLeg) {
    acc.push({
      title: path[path.length - 1] || "Route leg",
      leg: value,
    });
    return acc;
  }

  Object.entries(value).forEach(([key, nested]) => {
    collectLegs(nested, [...path, humanizeKey(key)], acc);
  });

  return acc;
}

/**
 * Renders the generated trip plan from backend.
 * It tries to show route legs nicely, and also includes raw JSON for debugging.
 */
export default function GeneratedPlan({ plan }) {
  const legs = collectLegs(plan);

  return (
    <div style={{ marginTop: "28px" }}>
      <h2 style={{ marginBottom: "16px" }}>Generated trip plan</h2>

      {legs.length === 0 && (
        <div
          style={{
            marginBottom: "16px",
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
          }}
        >
          No route cards could be extracted from the response. Raw JSON is shown below.
        </div>
      )}

      {legs.map((item, idx) => {
        const leg = item.leg;
        const steps = Array.isArray(leg?.steps) ? leg.steps : [];

        return (
          <div
            key={`${item.title}-${idx}`}
            style={{
              marginBottom: "16px",
              padding: "18px",
              borderRadius: "14px",
              background: "#12151b",
              border: "1px solid #2a2f3a",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "12px" }}>{item.title}</h3>

            <div style={{ marginBottom: "6px" }}>
              <strong>Mode:</strong> {leg?.mode || "-"}
            </div>

            {leg?.start_address && (
              <div style={{ marginBottom: "6px" }}>
                <strong>From:</strong> {leg.start_address}
              </div>
            )}

            {leg?.destination && (
              <div style={{ marginBottom: "6px" }}>
                <strong>To:</strong> {leg.destination}
              </div>
            )}

            {leg?.duration_minutes != null && (
              <div style={{ marginBottom: "6px" }}>
                <strong>Duration:</strong> {leg.duration_minutes} minutes
              </div>
            )}

            {leg?.distance_meters != null && (
              <div style={{ marginBottom: "6px" }}>
                <strong>Distance:</strong> {leg.distance_meters} meters
              </div>
            )}

            {leg?.leave_at && (
              <div style={{ marginBottom: "6px" }}>
                <strong>Leave at:</strong> {leg.leave_at}
              </div>
            )}

            {leg?.start_after_buffer_at && (
              <div style={{ marginBottom: "6px" }}>
                <strong>Start after buffer:</strong> {leg.start_after_buffer_at}
              </div>
            )}

            {leg?.summary && (
              <div style={{ marginBottom: "6px" }}>
                <strong>Summary:</strong> {leg.summary}
              </div>
            )}

            {leg?.google_maps_url && (
              <div style={{ marginTop: "12px", marginBottom: "12px" }}>
                <a
                  href={leg.google_maps_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#7db2ff" }}
                >
                  Open route in Google Maps
                </a>
              </div>
            )}

            {steps.length > 0 && (
              <div>
                <strong>Steps:</strong>
                <ul style={{ marginTop: "8px" }}>
                  {steps.map((step, stepIdx) => (
                    <li key={stepIdx} style={{ marginBottom: "6px" }}>
                      {typeof step === "string" ? step : JSON.stringify(step)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      <details
        style={{
          marginTop: "18px",
          padding: "14px",
          borderRadius: "12px",
          background: "#12151b",
          border: "1px solid #2a2f3a",
        }}
      >
        <summary style={{ cursor: "pointer", fontWeight: "bold" }}>
          Show raw backend response
        </summary>

        <pre
          style={{
            marginTop: "12px",
            whiteSpace: "pre-wrap",
            overflowX: "auto",
            fontSize: "13px",
            lineHeight: 1.5,
          }}
        >
          {JSON.stringify(plan, null, 2)}
        </pre>
      </details>
    </div>
  );
}