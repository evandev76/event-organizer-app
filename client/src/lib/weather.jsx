import React from "react";

function weatherSvg(icon) {
  if (icon === "rain") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 18a1 1 0 0 1-.9-1.4l1-2.2a1 1 0 1 1 1.8.8l-1 2.2A1 1 0 0 1 7 18Zm5 0a1 1 0 0 1-.9-1.4l1-2.2a1 1 0 1 1 1.8.8l-1 2.2A1 1 0 0 1 12 18Zm5 0a1 1 0 0 1-.9-1.4l1-2.2a1 1 0 1 1 1.8.8l-1 2.2A1 1 0 0 1 17 18Zm-1.2-8.9A5.5 5.5 0 0 0 6.3 7.8 4.5 4.5 0 0 0 7.5 16H18a4 4 0 0 0 2.8-6.9Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm0-16h1v3h-2V2h1Zm0 19h1v-3h-2v3h1ZM3.5 12.5v-2H1v2h2.5Zm19.5 0v-2H20.5v2H23ZM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4L4.2 5.6Zm13.4 13.4 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1ZM18.4 4.2l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1ZM5.6 19.8l-1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1Z" />
    </svg>
  );
}

export function WeatherIcon({ icon, className = "" }) {
  if (icon !== "sun" && icon !== "rain") return null;
  return <span className={`wicon ${icon} ${className}`.trim()} title={icon === "rain" ? "Pluie" : "Soleil"}>{weatherSvg(icon)}</span>;
}

