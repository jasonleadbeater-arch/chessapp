"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import SenetBoard from "./SenetBoard";

export default function SenetLobby() {
  const [username, setUsername] = useState("");
  const [gameId, setGameId] = useState(null);
  const [inputRoom, setInputRoom] = useState("");
  const [myColor, setMyColor] = useState("white");
  const [isJoined, setIsJoined] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState(false);

  // --- 1. HOST GAME ---
  const hostGame = async () => {
    if (!username) return alert("Enter a name, traveler.");
    
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    
    // Initial board setup for the database
    const initialBoard = Array(30).fill(null).map((_, i) => 
      i < 10 ? (i % 2 === 0 ? "white" : "black") : null
    );

    const { error } = await supabase
      .from('senet_games')
      .insert([{ 
        id: newRoomId, 
        player_white: username,
        player_black: null, 
        board_state: initialBoard,
        turn: 'white',
        status: 'open',
        borne_off: { white: 0, black: 0 },
        last_throw: 0
      }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setIsJoined(true);
      listenForOpponent(newRoomId);
    } else {
      console.error("Error hosting game:", error);
    }
  };

  // --- 2. JOIN GAME ---
  const joinGame = async () => {
    if (!username) return alert("Enter a name, traveler.");
    if (!inputRoom) return alert("Enter a room code.");
    
    const roomId = inputRoom.toUpperCase();

    const { data, error } = await supabase
      .from('senet_games')
      .select('*')
      .eq('id', roomId)
      .single();

    if (data) {
      if (data.player_black && data.player_black !== username) {
        return alert("This tomb is full!");
      }
      
      // Update the row to include the second player
      const { error: updateError } = await supabase
        .from('senet_games')
        .update({ player_black: username, status: 'playing' })
        .eq('id', roomId);

      if (!updateError) {
        setGameId(roomId);
        setMyColor("black");
        setIsJoined(true);
        setOpponentJoined(true);
      }
    } else {
      alert("Room not found. Check the code, traveler.");
    }
  };

  // --- 3. REALTIME: WAIT FOR OPPONENT ---
  const listenForOpponent = (roomId) => {
    const channel = supabase.channel(`lobby:${roomId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'senet_games', 
        filter: `id=eq.${roomId}` 
      }, (payload) => {
        if (payload.new.player_black) {
          setOpponentJoined(true);
          supabase.removeChannel(channel);
        }
      }).subscribe();
  };

  // --- 4. RENDER LOGIC ---

  // If we are in the game
  if (isJoined) {
    if (myColor === "white" && !opponentJoined) {
      return (
        <div style={{ padding: "100px", textAlign: "center", color: "#ffcc00" }}>
          <h2>ROOM CODE: {gameId}</h2>
          <p>Waiting for an opponent to enter the tomb...</p>
          <div className="loader"></div> 
          <button onClick={() => window.location.reload()} style={{marginTop: '20px', background: 'none', color: '#666', border: 'none', cursor: 'pointer'}}>Cancel</button>
        </div>
      );
    }

    return (
      <SenetBoard 
        player1={{ username }} 
        gameId={gameId} 
        myColor={myColor} 
      />
    );
  }

  // If we are in the Lobby menu
  return (
    <div style={{ padding: "50px", textAlign: "center", color: "#ffcc00", fontFamily: "serif" }}>
      <h1 style={{ fontSize: "3rem", letterSpacing: "10px" }}>𓁹 SENET 𓁹</h1>
      <p style={{ marginBottom: "40px", color: "#8b7355" }}>The Ancient Egyptian Game of Passing</p>
      
      <div style={{ maxWidth: "400px", margin: "0 auto", backgroundColor: "rgba(0,0,0,0.5)", padding: "30px", borderRadius: "10px", border: "1px solid #333" }}>
        <input 
          type="text" 
          placeholder="YOUR NAME" 
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          style={{ 
            padding: "12px", marginBottom: "20px", width: "100%", 
            textAlign: "center", borderRadius: "5px", border: "1px solid #8b7355", 
            background: "#000", color: "#fff", fontSize: "1.1rem" 
          }}
        />

        <button onClick={hostGame} style={{ 
          width: "100%", padding: "15px", background: "#ffcc00", 
          color: "#000", fontWeight: "bold", cursor: "pointer", 
          border: "none", borderRadius: "5px", marginBottom: "20px" 
        }}>
          CREATE NEW MATCH
        </button>
        
        <div style={{ margin: "10px 0", color: "#8b7355" }}>— OR —</div>
        
        <input 
          type="text" 
          placeholder="ENTER ROOM CODE" 
          value={inputRoom}
          onChange={(e) => setInputRoom(e.target.value)}
          style={{ 
            padding: "12px", width: "100%", textAlign: "center", 
            borderRadius: "5px", border: "1px solid #444", 
            background: "#111", color: "#fff", marginBottom: "10px" 
          }}
        />
        <button onClick={joinGame} style={{ 
          width: "100%", padding: "15px", border: "2px solid #ffcc00", 
          color: "#ffcc00", background: "none", fontWeight: "bold", 
          cursor: "pointer", borderRadius: "5px" 
        }}>
          JOIN BY CODE
        </button>
      </div>
    </div>
  );
}
