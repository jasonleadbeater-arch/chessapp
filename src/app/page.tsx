"use client";
import React, { useState, useEffect } from "react";
import GameBoard from "../components/GameBoard"; 
import SenetBoard from "../components/SenetBoard"; 
import { supabase } from "../lib/supabase";

export default function ArcadeApp() {
  const [selectedGame, setSelectedGame] = useState("chess");
  const [selectedTheme, setSelectedTheme] = useState("mickey");
  const [userRole, setUserRole] = useState("w");
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    async function getActiveUser() {
      const { data: { user: activeUser } } = await supabase.auth.getUser();
      setUser(activeUser);
    }
    getActiveUser();
  }, []);

  const gameIcon = selectedGame === "chess" ? "/treasure_icon.png" : "/themes/sq26.png"; 

  return (
    <main style={{ padding: "20px", textAlign: "center", minHeight: "100vh", backgroundColor: "#000", color: "#fff", fontFamily: "serif" }}>
      
      <div style={{ marginBottom: "20px", display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
        <div style={{ 
          height: "150px", width: "150px", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: "50%",
          backgroundColor: selectedGame === "senet" ? "rgba(255, 204, 0, 0.05)" : "transparent",
          boxShadow: selectedGame === "senet" ? "0 0 30px rgba(255, 204, 0, 0.2)" : "none",
          transition: "all 0.5s ease"
        }}>
          <img src={gameIcon} style={{ maxHeight: "80%", width: "auto", filter: selectedGame === "senet" ? "drop-shadow(0px 0px 15px gold)" : "none" }} alt="Icon" />
        </div>

        <h1 style={{ color: selectedGame === "senet" ? "#ffcc00" : "#fff", letterSpacing: "4px", textTransform: "uppercase" }}>
            {selectedGame === "chess" ? "Arcade Treasury" : "Tomb of Senet"}
        </h1>

        <div style={{ 
            backgroundColor: "#111", padding: "15px 25px", borderRadius: "50px", 
            border: `1px solid ${selectedGame === "senet" ? "#ffcc00" : "#333"}`, 
            display: "flex", gap: "25px"
        }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ fontWeight: "bold", marginRight: "10px", color: "#888", fontSize: "14px" }}>GAME</label>
            <select value={selectedGame} onChange={(e) => setSelectedGame(e.target.value)} style={{ padding: "6px 12px", borderRadius: "20px", backgroundColor: "#222", color: "#fff", border: "1px solid #444" }}>
              <option value="chess">Chess</option>
              <option value="senet">Senet</option>
            </select>
          </div>
          {selectedGame === "chess" && (
            <div style={{ display: "flex", alignItems: "center", borderLeft: "1px solid #333", paddingLeft: "20px" }}>
              <label style={{ fontWeight: "bold", marginRight: "10px", color: "#888", fontSize: "14px" }}>THEME</label>
              <select value={selectedTheme} onChange={(e) => setSelectedTheme(e.target.value)} style={{ padding: "6px 12px", borderRadius: "20px", backgroundColor: "#222", color: "#fff", border: "1px solid #444" }}>
                <option value="mickey">Mickey</option>
                <option value="miraculous">Miraculous</option>
                <option value="beast_quest">Beast Quest</option>
                <option value="moana">Moana</option>
              </select>
            </div>
          )}
        </div>
      </div>

      <div style={{ marginTop: "20px" }}>
        {selectedGame === "chess" ? (
            <GameBoard themeKey={selectedTheme} assignedRole={userRole} setAssignedRole={setUserRole} />
        ) : (
            <SenetBoard player1={user} />
        )}
      </div>
      
      <div style={{ marginTop: "50px", padding: "30px", borderTop: "1px solid #222", color: "#555" }}>
        <p style={{ fontSize: "12px", letterSpacing: "2px" }}>
            {selectedGame === "chess" ? "CHESS REWARDS ACTIVE" : "ANCIENT TREASURY MULTIPLIER ACTIVE"}
        </p>
      </div>
    </main>
  );
}
