// travel-frontend/src/components/chat/PlacesResults.jsx
/**
 * Display restaurants, attractions, or things to do from Google Places API.
 */

import React from "react";
import MockDataBanner from "./MockDataBanner";

export default function PlacesResults({
  title,
  places,
  isMock,
  onSelectPlace,
  selectedPlaceId,
}) {
  if (!places || places.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <h3 style={{ marginBottom: "16px" }}>{title}</h3>
      
      {isMock && (
        <MockDataBanner message="Using sample data — Google Places API unavailable or not configured." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {places.map((place, idx) => {
          const isSelected = selectedPlaceId === place.id;
          return (
            <div
              key={place.id || idx}
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: isSelected ? "#1a2a3a" : "#12151b",
                border: isSelected ? "1px solid #4c8dff" : "1px solid #2a2f3a",
                cursor: onSelectPlace ? "pointer" : "default",
              }}
              onClick={() => onSelectPlace && onSelectPlace(place)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, marginBottom: "6px" }}>
                    {place.name}
                    {place.ai_recommended && (
                      <span style={{ marginLeft: "8px", fontSize: "12px", color: "#4c8dff" }}>
                        ✨ AI Pick
                      </span>
                    )}
                  </h4>
                  <p style={{ margin: 0, fontSize: "14px", color: "#888" }}>
                    {place.address}
                  </p>
                  {place.description && (
                    <p style={{ margin: "8px 0 0", fontSize: "13px", color: "#aaa" }}>
                      {place.description}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right", minWidth: "80px" }}>
                  {place.rating && (
                    <div style={{ fontSize: "16px", fontWeight: "bold", color: "#f1c40f" }}>
                      ⭐ {place.rating}
                    </div>
                  )}
                  {place.review_count && (
                    <div style={{ fontSize: "12px", color: "#888" }}>
                      {place.review_count} reviews
                    </div>
                  )}
                  {place.price_display && (
                    <div style={{ fontSize: "14px", color: "#4c8dff", marginTop: "4px" }}>
                      {place.price_display}
                    </div>
                  )}
                </div>
              </div>
              
              {place.opening_hours && place.opening_hours.length > 0 && (
                <details style={{ marginTop: "10px", fontSize: "13px", color: "#888" }}>
                  <summary style={{ cursor: "pointer" }}>Opening hours</summary>
                  <ul style={{ margin: "8px 0 0 16px", padding: 0 }}>
                    {place.opening_hours.slice(0, 3).map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </details>
              )}
              
              {place.google_maps_url && (
                <a
                  href={place.google_maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "13px", color: "#4c8dff", marginTop: "8px", display: "inline-block" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  View on Google Maps →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// travel-frontend/src/components/chat/ToursResults.jsx
/**
 * Display tours and activities from Viator API.
 */

export function ToursResults({
  tours,
  isMock,
  onSelectTour,
  selectedTourId,
}) {
  if (!tours || tours.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <h3 style={{ marginBottom: "16px" }}>Tours & Activities</h3>
      
      {isMock && (
        <MockDataBanner message="Using sample data — Apply for Viator API at partnerresources.viator.com" />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {tours.map((tour, idx) => {
          const isSelected = selectedTourId === tour.id;
          return (
            <div
              key={tour.id || idx}
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: isSelected ? "#1a2a3a" : "#12151b",
                border: isSelected ? "1px solid #4c8dff" : "1px solid #2a2f3a",
                cursor: onSelectTour ? "pointer" : "default",
              }}
              onClick={() => onSelectTour && onSelectTour(tour)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, marginBottom: "6px" }}>{tour.name}</h4>
                  <p style={{ margin: 0, fontSize: "14px", color: "#888" }}>
                    {tour.short_description || tour.description?.slice(0, 120)}
                  </p>
                  {tour.duration_text && (
                    <p style={{ margin: "6px 0 0", fontSize: "13px", color: "#aaa" }}>
                      ⏱ {tour.duration_text}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right", minWidth: "100px" }}>
                  {tour.price_from && (
                    <div style={{ fontSize: "18px", fontWeight: "bold", color: "#2ecc71" }}>
                      From €{tour.price_from}
                    </div>
                  )}
                  {tour.rating && (
                    <div style={{ fontSize: "14px", color: "#f1c40f", marginTop: "4px" }}>
                      ⭐ {tour.rating} ({tour.review_count})
                    </div>
                  )}
                </div>
              </div>
              
              {tour.highlights && tour.highlights.length > 0 && (
                <div style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {tour.highlights.slice(0, 3).map((h, i) => (
                    <span
                      key={i}
                      style={{
                        padding: "4px 8px",
                        fontSize: "12px",
                        background: "#2a2f3a",
                        borderRadius: "4px",
                        color: "#ccc",
                      }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
              )}
              
              {tour.booking_url && (
                <a
                  href={tour.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: "13px", color: "#4c8dff", marginTop: "10px", display: "inline-block" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  Book on Viator →
                </a>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// travel-frontend/src/components/chat/CarRentalResults.jsx
/**
 * Display car rental offers.
 */

export function CarRentalResults({
  offers,
  pickupLocation,
  pickupDate,
  dropoffDate,
  isMock,
  onSelectCar,
  selectedCarId,
}) {
  if (!offers || offers.length === 0) {
    return null;
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <h3 style={{ marginBottom: "8px" }}>Car Rental Options</h3>
      <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#888" }}>
        {pickupLocation} · {pickupDate} → {dropoffDate}
      </p>
      
      {isMock && (
        <MockDataBanner message="Using sample car rental data for demonstration." />
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {offers.map((offer, idx) => {
          const isSelected = selectedCarId === offer.id;
          const vehicle = offer.vehicle || offer;
          const pricing = offer.pricing || offer;
          const provider = offer.provider || {};
          
          return (
            <div
              key={offer.id || idx}
              style={{
                padding: "16px",
                borderRadius: "12px",
                background: isSelected ? "#1a2a3a" : "#12151b",
                border: isSelected ? "1px solid #4c8dff" : "1px solid #2a2f3a",
                cursor: onSelectCar ? "pointer" : "default",
              }}
              onClick={() => onSelectCar && onSelectCar(offer)}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: 0, marginBottom: "4px" }}>
                    {vehicle.category || vehicle.model}
                  </h4>
                  <p style={{ margin: 0, fontSize: "14px", color: "#888" }}>
                    {vehicle.model}
                  </p>
                  <div style={{ marginTop: "8px", fontSize: "13px", color: "#aaa" }}>
                    <span>👤 {vehicle.seats} seats</span>
                    <span style={{ marginLeft: "12px" }}>🧳 {vehicle.bags} bags</span>
                    <span style={{ marginLeft: "12px" }}>⚙️ {vehicle.transmission}</span>
                    {vehicle.air_conditioning && (
                      <span style={{ marginLeft: "12px" }}>❄️ A/C</span>
                    )}
                  </div>
                  <p style={{ margin: "6px 0 0", fontSize: "12px", color: "#666" }}>
                    via {provider.name || "Rental Provider"}
                  </p>
                </div>
                <div style={{ textAlign: "right", minWidth: "120px" }}>
                  <div style={{ fontSize: "20px", fontWeight: "bold", color: "#2ecc71" }}>
                    €{pricing.total?.toFixed(2) || pricing.total_price}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    {pricing.total_days || pricing.num_days} days
                  </div>
                  {pricing.daily_rate && (
                    <div style={{ fontSize: "12px", color: "#aaa" }}>
                      €{pricing.daily_rate}/day
                    </div>
                  )}
                </div>
              </div>
              
              {offer.inclusions && offer.inclusions.length > 0 && (
                <div style={{ marginTop: "10px", fontSize: "12px", color: "#888" }}>
                  ✓ {offer.inclusions.slice(0, 3).join(" · ")}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// travel-frontend/src/components/chat/ItineraryDisplay.jsx
/**
 * Display AI-generated day-by-day itinerary.
 */

export function ItineraryDisplay({ itinerary }) {
  if (!itinerary || !itinerary.days) {
    return null;
  }

  return (
    <div style={{ marginTop: "20px" }}>
      <h3 style={{ marginBottom: "8px" }}>
        Your {itinerary.num_days}-Day Itinerary
      </h3>
      <p style={{ margin: "0 0 16px", fontSize: "14px", color: "#888" }}>
        {itinerary.city} · {itinerary.check_in} → {itinerary.check_out}
      </p>

      {itinerary.days.map((day) => (
        <div
          key={day.day_number}
          style={{
            marginBottom: "20px",
            padding: "16px",
            borderRadius: "12px",
            background: "#12151b",
            border: "1px solid #2a2f3a",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
            <h4 style={{ margin: 0 }}>
              Day {day.day_number}: {day.theme}
            </h4>
            <span style={{ fontSize: "13px", color: "#888" }}>
              {day.day_of_week}, {day.date}
            </span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {day.activities?.map((activity, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  gap: "12px",
                  padding: "10px",
                  background: "#1a1f28",
                  borderRadius: "8px",
                  borderLeft: `3px solid ${
                    activity.type === "restaurant" ? "#e74c3c" :
                    activity.type === "attraction" ? "#3498db" :
                    activity.type === "tour" ? "#2ecc71" : "#9b59b6"
                  }`,
                }}
              >
                <div style={{ minWidth: "80px", fontSize: "13px", color: "#888" }}>
                  {activity.time}
                  {activity.end_time && (
                    <>
                      <br />
                      <span style={{ fontSize: "11px" }}>→ {activity.end_time}</span>
                    </>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: "bold", marginBottom: "4px" }}>
                    {activity.name}
                  </div>
                  <div style={{ fontSize: "13px", color: "#aaa" }}>
                    {activity.description}
                  </div>
                  {activity.tips && (
                    <div style={{ fontSize: "12px", color: "#f1c40f", marginTop: "6px" }}>
                      💡 {activity.tips}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(day.total_estimated_cost || day.walking_distance_km) && (
            <div style={{ marginTop: "12px", fontSize: "12px", color: "#888", display: "flex", gap: "16px" }}>
              {day.total_estimated_cost && (
                <span>💰 Est. cost: €{day.total_estimated_cost}</span>
              )}
              {day.walking_distance_km && (
                <span>🚶 Walking: ~{day.walking_distance_km} km</span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}