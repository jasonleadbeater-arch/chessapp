"use client";
import React, { useState } from "react";
import GameBoard from "../components/GameBoard";

export default function ArcadeApp() {
  const [selectedTheme, setSelectedTheme] = useState("mickey");

  // Logic to determine which character icon to show based on the dropdown
  const getThemeIcon = () => {
    switch (selectedTheme) {
      case "mickey":
        return "/assets/Sorcerer.png";
      case "miraculous":
        return "/assets/iconBackgroundRemoved.png";
      default:
        return null; // No specific character icon for other themes yet
    }
  };

  const themeIcon = getThemeIcon();

  return (
    <main style={{ padding: "40px 20px", textAlign: "center", minHeight: "100vh", backgroundColor: "#f0f0f0" }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "10px", color: "#333" }}>CHESS ARCADE</h1>
      
      <div style={{ marginBottom: "30px", display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
        
        {/* Dynamic Character Icon Display */}
        {themeIcon && (
          <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <img 
              src={themeIcon} 
              style={{ maxHeight: "100%", width: "auto", filter: "drop-shadow(5px 5px 10px rgba(0,0,0,0.2))" }} 
              alt="Theme Character" 
            />
          </div>
        )}

        <div>
          <label style={{ fontWeight: "bold", marginRight: "10px" }}>Select Your Theme: </label>
          <select 
            value={selectedTheme} 
            onChange={(e) => setSelectedTheme(e.target.value)}
            style={{ padding: "8px", borderRadius: "5px", fontSize: "16px", cursor: "pointer" }}
          >
            <option value="mickey">Mickey Mouse</option>
            <option value="miraculous">Miraculous</option>
            <option value="beast_quest">Beast Quest</option>
            <option value="moana">Moana Ocean Adventure</option>
          </select>
        </div>
      </div>

      <GameBoard themeKey={selectedTheme} />
      
      <div style={{ marginTop: "40px", padding: "20px", borderTop: "2px solid #ddd", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
           <img src="/assets/treasure_icon.png" style={{ width: "40px", height: "40px" }} alt="Coin" />
           <h3 style={{ margin: 0 }}>Score Tracker</h3>
        </div>
        <p>Win: +3 | Draw: +1 | Loss: -3</p>
      </div>
    </main>
  );
}
