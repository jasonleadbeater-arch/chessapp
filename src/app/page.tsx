"use client";
import React, { useState, useEffect } from "react";
import GameBoard from "../components/GameBoard"; // Your Chess Engine
import SenetBoard from "../components/SenetBoard"; // Your New Senet Engine
import { supabase } from "../lib/supabase";

export default function ArcadeApp() {
  const [selectedGame, setSelectedGame] = useState("chess"); // New state to toggle games
  const [selectedTheme, setSelectedTheme] = useState("mickey");
  const [userRole, setUserRole] = useState("w");
  const [user, setUser] = useState<any>(null);

  // Fetch the user once so Senet can pay out to the treasury
  useEffect(() => {
    async function getActiveUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    }
    getActiveUser();
  }, []);

  return (
    <main style={{ 
      padding: "20px", 
      textAlign: "center", 
      minHeight: "100vh", 
      backgroundColor: "#000", 
      color: "#fff" 
    }}>
      
      {/* Header / Logo Section */}
      <div style={{ 
        marginBottom: "20px", 
        display: "flex", 
        flexDirection: "column", 
        alignItems: "center", 
        gap: "10px" 
      }}>
        <div style={{ height: "140px", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <img 
            src="/treasure_icon.png" 
            style={{ maxHeight: "100%", width: "auto", filter: "drop-shadow(0px 0px 10px rgba(255,255,255,0.1))" }} 
            alt="Treasure Icon" 
          />
        </div>

        {/* --- GAME & THEME SELECTOR --- */}
        <div style={{ backgroundColor: "#111", padding: "15px", borderRadius: "10px", border: "1px solid #333", display: "flex", gap: "20px" }}>
          
          {/* Toggle between Chess and Senet */}
          <div>
            <label style={{ fontWeight: "bold", marginRight: "10px", color: "gold" }}>Game: </label>
            <select 
              value={selectedGame} 
              onChange={(e) => setSelectedGame(e.target.value)}
              style={{ padding: "8px", borderRadius: "5px", backgroundColor: "#222", color: "#fff", border: "1px solid #444" }}
            >
              <option value="chess">Chess</option>
              <option value="senet">Ancient Senet</option>
            </select>
          </div>

          {/* Theme Selector (Only visible if Chess is selected) */}
          {selectedGame === "chess" && (
            <div>
              <label style={{ fontWeight: "bold", marginRight: "10px", color: "#ccc" }}>Theme: </label>
              <select 
                value={selectedTheme} 
                onChange={(e) => setSelectedTheme(e.target.value)}
                style={{ padding: "8px", borderRadius: "5px", backgroundColor: "#222", color: "#fff", border: "1px solid #444" }}
              >
                <option value="mickey">Mickey Mouse</option>
                <option value="miraculous">Miraculous</option>
                <option value="beast_quest">Beast Quest</option>
                <option value="moana">Moana Ocean Adventure</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* --- CONDITIONAL GAME RENDERING --- */}
      {selectedGame === "chess" ? (
        <GameBoard themeKey={selectedTheme} assignedRole={userRole} setAssignedRole={setUserRole} />
      ) : (
        <SenetBoard player1={user} />
      )}
      
      {/* Footer Info */}
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
           <h3 style={{ margin: 0, color: "gold" }}>Clubhouse Treasury</h3>
        </div>
        <p style={{ color: "#888" }}>
          {selectedGame === "chess" ? "Chess Rewards: Win: +3 | Draw: +1 | Loss: -3" : "Senet Rewards: Pharaoh: +20 | Novice: +5"}
        </p>
      </div>
    </main>
  );
}
