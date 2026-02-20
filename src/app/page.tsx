"use client";
import React, { useState, useEffect } from "react";
// Using the explicit capitalized filename as confirmed
import GameBoard from "./components/GameBoard.js";

export default function Home() {
  const [themeKey, setThemeKey] = useState("mickey");
  const [assignedRole, setAssignedRole] = useState("w");

  const themes = {
    beast_quest: { name: "Beast Quest", icon: "/themes/beast_quest/icon.png" },
    mickey: { name: "Mickey Mouse Arcade", icon: "/themes/mickey/icon.png" },
    miraculous: { name: "Miraculous Ladybug", icon: "/themes/miraculous/icon.png" },
    moana: { name: "Moana Ocean Adventure", icon: "/themes/moana/icon.png" }
  };

  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      {/* THEME SELECTOR BAR */}
      <div style={{ 
        display: "flex", 
        justifyContent: "center", 
        gap: "15px", 
        padding: "20px", 
        backgroundColor: "#111", 
        borderBottom: "2px solid #333",
        flexWrap: "wrap"
      }}>
        {Object.entries(themes).map(([key, data]) => (
          <button
            key={key}
            onClick={() => setThemeKey(key)}
            style={{
              padding: "10px 20px",
              backgroundColor: themeKey === key ? "#fff" : "#222",
              color: themeKey === key ? "#000" : "#fff",
              border: "none",
              borderRadius: "10px",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px",
              transition: "all 0.2s",
              width: "140px"
            }}
          >
            {data.icon ? (
              <img 
                src={data.icon} 
                style={{ maxHeight: "100%", width: "auto", filter: "drop-shadow(0px 0px 10px rgba(255,255,255,0.1))" }} 
                alt="Theme Character" 
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} 
              />
            ) : (
              <div style={{ height: "140px" }} /> 
            )}
            <span style={{ fontSize: "10px", fontWeight: "bold", textAlign: "center" }}>{data.name.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* GAME BOARD COMPONENT */}
      <GameBoard 
        themeKey={themeKey} 
        assignedRole={assignedRole} 
        setAssignedRole={setAssignedRole} 
      />
    </main>
  );
}
