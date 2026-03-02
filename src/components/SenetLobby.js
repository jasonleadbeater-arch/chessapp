"use client";
import React, { useState } from "react";
import { supabase } from "../lib/supabase";
import SenetBoard from "./SenetBoard";

export default function SenetLobby() {
  const [username, setUsername] = useState("");
  const [gameId, setGameId] = useState(null);
  const [inputRoom, setInputRoom] = useState("");
  const [myColor, setMyColor] = useState("white");
  const [isJoined, setIsJoined] = useState(false);

  // 1. Create Game (Host)
  const hostGame = async () => {
    if (!username) return alert("Enter a name, traveler.");
    
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    const { error } = await supabase
      .from('senet_games')
      .insert([{ 
        id: newRoomId, 
        player_white: username,
        player_black: null, // Waiting...
        board_state: Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null),
        turn: 'white',
        borne_off: { white: 0, black: 0 }
      }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setIsJoined(true);
    }
  };

  // 2. Join Game (Opponent)
  const joinGame = async () => {
    if (!username) return alert("Enter a name, traveler.");
    
    const { data, error } = await supabase
      .from('senet_games')
      .select('*')
      .eq('id', inputRoom.toUpperCase())
      .single();

    if (data) {
      if (data.player_black) return alert("This tomb is full!");
      
      await supabase
        .from('senet_games')
        .update({ player_black: username })
        .eq('id', data.id);

      setGameId(data.id);
      setMyColor("black");
      setIsJoined(true);
    } else {
      alert("Room not found.");
    }
  };

  if (isJoined) {
    return <SenetBoard player1={{ username }} gameId={gameId} myColor={myColor} />;
  }

  return (
    <div style={{ padding: "50px", textAlign: "center", color: "#ffcc00", fontFamily: "serif" }}>
      <h2>𓁹 SENET ONLINE 𓁹</h2>
      
      <input 
        type="text" 
        placeholder="YOUR USERNAME" 
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={{ padding: "12px", marginBottom: "20px", width: "250px", textAlign: "center", borderRadius: "5px", border: "1px solid #8b7355", background: "#000", color: "#fff" }}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
        <button onClick={hostGame} style={{ width: "250px", padding: "12px", background: "#ffcc00", fontWeight: "bold", cursor: "pointer" }}>
          CREATE NEW MATCH
        </button>
        
        <p>— OR —</p>
        
        <input 
          type="text" 
          placeholder="ROOM CODE" 
          value={inputRoom}
          onChange={(e) => setInputRoom(e.target.value)}
          style={{ padding: "10px", width: "250px", textAlign: "center", borderRadius: "5px", border: "1px solid #8b7355", background: "#111", color: "#fff" }}
        />
        <button onClick={joinGame} style={{ width: "250px", padding: "12px", border: "1px solid #ffcc00", color: "#ffcc00", background: "none", cursor: "pointer" }}>
          JOIN BY CODE
        </button>
      </div>
    </div>
  );
}
