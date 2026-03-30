// import React from "react";

// /**
//  * Format distance meters into km.
//  */
// function formatDistance(distanceMeters) {
//   if (distanceMeters == null) return "-";
//   return `${(Number(distanceMeters) / 1000).toFixed(1)} km`;
// }

// /**
//  * Convert different possible step shapes into readable text.
//  */
// function formatStep(step) {
//   if (!step) return "Step";
//   if (typeof step === "string") return step;

//   const main =
//     step.instruction ||
//     step.navigationInstruction ||
//     step.text ||
//     step.travelMode ||
//     step.travel_mode ||
//     "Step";

//   const extra = [];

//   if (step.line) extra.push(step.line);
//   if (step.headsign) extra.push(`towards ${step.headsign}`);

//   return extra.length ? `${main} (${extra.join(", ")})` : main;
// }

// /**
//  * Renders one leg card from the backend response.
//  */
// function LegCard({ title, leg }) {
//   if (!leg) return null;

//   return (
//     <div style={styles.legCard}>
//       <h4 style={{ marginTop: 0 }}>{title}</h4>

//       <p>
//         <strong>Mode:</strong> {leg.mode || "-"}
//       </p>
//       <p>
//         <strong>From:</strong> {leg.start_address || "-"}
//       </p>
//       <p>
//         <strong>To:</strong> {leg.destination || "-"}
//       </p>

//       {leg.leave_at && (
//         <p>
//           <strong>Leave at:</strong> {leg.leave_at}
//         </p>
//       )}

      // {/* {leg.start_after_buffer_at && (
      //   <p>
      //     <strong>Start after buffer */}