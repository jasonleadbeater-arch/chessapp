"use client";
import React, { useState } from "react";
import GameBoard from "../components/GameBoard";

export default function ArcadeApp() {
  const [selectedTheme, setSelectedTheme] = useState("mickey");
  const [userRole, setUserRole] = useState("w");

  return (
    <main style={{ 
      padding: "20px", 
      textAlign: "center", 
      minHeight: "100vh", 
      backgroundColor: "#000", // Makes the entire background black
      color: "#fff"            // Makes text white for readability
    }}>
      
      <div style={{ 
        marginBottom: "20px", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        gap: "10px" 
      }}>
        {/* Character Icon Display - Now using treasure_icon.png directly */}
        <div style={{ height: "140px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img 
            src="/treasure_icon.png" 
            style={{ maxHeight: "100%", width: "auto", filter: "drop-shadow(0px 0px 10px rgba(255,255,255,0.1))" }} 
            alt="Treasure Icon" 
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        </div>

        <div style={{ backgroundColor: "#111", padding: "15px", borderRadius: "10px", border: "1px solid #333" }}>
          <label style={{ fontWeight: "bold", marginRight: "10px", color: "#ccc" }}>Select Your Theme: </label>
          <select 
            value={selectedTheme} 
            onChange={(e) => setSelectedTheme(e.target.value)}
            style={{ 
              padding: "8px", 
              borderRadius: "5px", 
              fontSize: "16px", 
              cursor: "pointer",
              backgroundColor: "#222",
              color: "#fff",
              border: "1px solid #444"
            }}
          >
            <option value="mickey">Mickey Mouse</option>
            <option value="miraculous">Miraculous</option>
            <option value="beast_quest">Beast Quest</option>
            <option value="moana">Moana Ocean Adventure</option>
          </select>
        </div>
      </div>

      <GameBoard themeKey={selectedTheme} assignedRole={userRole} setAssignedRole={setUserRole} />
      
      <div style={{ 
        marginTop: "40px", 
        padding: "20px", 
        borderTop: "1px solid #333", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        gap: "10px" 
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
           <img src="/treasure_icon.png" style={{ width: "40px", height: "40px" }} alt="Coin" />
           <h3 style={{ margin: 0, color: "gold" }}>Score Tracker</h3>
        </div>
        <p style={{ color: "#888" }}>Win: +3 | Draw: +1 | Loss: -3</p>
      </div>
    </main>
  );
}
