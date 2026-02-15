"use client";
import React, { useState } from "react";
import GameBoard from "../components/GameBoard";

export default function ArcadeApp() {
  const [selectedTheme, setSelectedTheme] = useState("mickey");

  return (
    <main style={{ padding: "40px 20px", textAlign: "center", minHeight: "100vh", backgroundColor: "#f0f0f0" }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "10px", color: "#333" }}>CHESS ARCADE</h1>
      
      <div style={{ marginBottom: "30px" }}>
        <label style={{ fontWeight: "bold", marginRight: "10px" }}>Select Your Theme: </label>
        <select 
          value={selectedTheme} 
          onChange={(e) => setSelectedTheme(e.target.value)}
          style={{ padding: "8px", borderRadius: "5px", fontSize: "16px" }}
        >
          <option value="mickey">Mickey Mouse</option>
          <option value="miraculous">Miraculous</option>
          <option value="beast_quest">Beast Quest</option>
          {/* Added Moana Theme Option below */}
          <option value="moana">Moana Ocean Adventure</option>
        </select>
      </div>

      <GameBoard themeKey={selectedTheme} />
      
      <div style={{ marginTop: "40px", padding: "20px", borderTop: "2px solid #ddd" }}>
        <h3>Score Tracker</h3>
        <p>Win: +3 | Draw: +1 | Loss: -3</p>
      </div>
    </main>
  );
}
