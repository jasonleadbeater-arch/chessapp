"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. LOBBY & IDENTITY STATE ---
  const [gameId, setGameId] = useState(null);
  const [myColor, setMyColor] = useState("white"); 
  const [isJoined, setIsJoined] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [inputRoom, setInputRoom] = useState("");
  
  // Username logic: defaults to email prefix, or user can type one in
  const [username, setUsername] = useState(player1?.email?.split('@')[0] || "");
  const [isEditingName, setIsEditingName] = useState(!player1?.email);

  // --- 2. CORE GAME STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Choose your path, Traveler.");
  const [difficulty, setDifficulty] = useState("Pharaoh"); 
  const [gameMode, setGameMode] = useState("AI"); 
  const [gameOver, setGameOver] = useState(false);

  const borneOffRef = useRef({ white: 0, black: 0 });

  // --- 3. MATCHMAKING ---
  const hostGame = async () => {
    if (!username) return alert("Please enter a username first.");
    
    // Generates short code like 'WYQN5'
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null);
    
    const { error } = await supabase.from('senet_games').insert([{ 
      id: newRoomId, 
      player_white: username,
      board_state: initialBoard,
      turn: 'white',
      borne_off: { white: 0, black: 0 },
      last_throw: 0
    }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setGameMode("PvP");
      setIsJoined(true);
      setMessage("Waiting for an opponent to join...");
    } else {
      console.error(error);
      alert("Error: " + error.message);
    }
  };

  const joinGame = async () => {
    if (!username) return alert("Please enter a username first.");
    if (!inputRoom) return alert("Enter a room code.");

    const { data, error } = await supabase.from('senet_games').select('*').eq('id', inputRoom.toUpperCase()).single();
    
    if (data) {
      await supabase.from('senet_games').update({ player_black: username }).eq('id', data.id);
      setGameId(data.id);
      setMyColor("black");
      setGameMode("PvP");
      setIsJoined(true);
      setOpponentJoined(true);
    } else {
      alert("Room not found.");
    }
  };

  // --- 4. AI & GAMEPLAY LOGIC ---
  const initializeAiGame = () => {
    const initialBoard = Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null);
    setBoard(initialBoard);
    setTurn("white");
    setLastThrow(0);
    setBorneOff({ white: 0, black: 0 });
    setGameOver(false);
    setGameMode("AI");
    setIsJoined(true);
  };

  useEffect(() => {
    if (gameMode === "AI" && turn === "black" && !gameOver && !isRolling) {
      const delay = difficulty === "Ra" ? 600 : 1500;
      if (lastThrow === 0) setTimeout(throwSticks, delay);
      else {
        const moves = [];
        board.forEach((p, i) => {
          if (p === "black") {
            const target = i + lastThrow;
            if (target < 30 && board[target] !== "black") moves.push({ from: i, to: target });
            else if (i >= 20 && target >= 30) moves.push({ from: i, to: 30 });
          }
        });
        const move = difficulty === "Scribe" ? moves[Math.floor(Math.random() * moves.length)] : moves.sort((a,b) => b.to - a.to)[0];
        setTimeout(() => move ? executeMove(move.from, move.to) : setTurn("white"), delay);
      }
    }
  }, [turn, lastThrow, isRolling]);

  const throwSticks = () => {
    setIsRolling(true);
    setTimeout(() => {
      const res = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
      setLastThrow(res);
      setIsRolling(false);
      if (gameMode === "PvP") updateRemoteGame(board, turn, res, borneOff);
    }, 800);
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    if (to >= 30) {
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      if (newBorneOff[turn] === 5) setGameOver(true);
      else finalizeTurn(newBoard, newBorneOff);
      return;
    }
    newBoard[from] = null;
    newBoard[to] = turn;
    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (nb, cbo) => {
    const nextTurn = [1, 4, 5].includes(lastThrow) ? turn : (turn === "white" ? "black" : "white");
    setBoard(nb);
    setLastThrow(0);
    setTurn(nextTurn);
    if (gameMode === "PvP") updateRemoteGame(nb, nextTurn, 0, cbo);
  };

  const updateRemoteGame = async (nb, nt, lt, cbo) => {
    await supabase.from('senet_games').update({ board_state: nb, turn: nt, last_throw: lt, borne_off: cbo }).eq('id', gameId);
  };

  // --- 5. RENDER HELPERS ---
  const renderSquare = (idx) => (
    <div key={idx} onClick={() => board[idx] === turn && executeMove(idx, idx + lastThrow)} style={{
      width: "55px", height: "55px", border: "1px solid #444",
      backgroundImage: `url(/themes/sq${(idx+1).toString().padStart(2, '0')}.png)`,
      backgroundSize: "cover", display: "flex", alignItems: "center", justifyContent: "center"
    }}>
      {board[idx] && <img src={`/themes/${board[idx]}_piece.png`} style={{ width: "40px" }} />}
    </div>
  );

  // --- LOBBY VIEW ---
  if (!isJoined) {
    return (
      <div style={{ padding: "40px", background: "#111", border: "1px solid #ffcc00", borderRadius: "10px", maxWidth: "400px", margin: "0 auto" }}>
        <h2 style={{ color: "#ffcc00", textAlign: "center" }}>SENET LOBBY</h2>
        
        {/* Username Input */}
        <div style={{ marginBottom: "20px" }}>
          <label style={{ color: "#888", fontSize: "12px" }}>YOUR IDENTITY</label>
          <input 
            type="text" 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter Username"
            style={{ width: "100%", padding: "10px", background: "#222", color: "#fff", border: "1px solid #444", marginTop: "5px" }}
          />
        </div>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ color: "#888", fontSize: "12px" }}>DIFFICULTY (AI ONLY)</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ width: "100%", padding: "10px", background: "#222", color: "#fff", border: "1px solid #444" }}>
            <option value="Scribe">Scribe (Easy)</option>
            <option value="Pharaoh">Pharaoh (Normal)</option>
            <option value="Ra">Ra (Expert)</option>
          </select>
        </div>

        <button onClick={initializeAiGame} style={{ width: "100%", padding: "15px", background: "#ffcc00", fontWeight: "bold", cursor: "pointer", border: "none", marginBottom: "15px" }}>PLAY VS AI</button>
        <hr style={{ borderColor: "#333", margin: "20px 0" }} />
        <button onClick={hostGame} style={{ width: "100%", padding: "12px", background: "none", color: "#ffcc00", border: "1px solid #ffcc00", cursor: "pointer", marginBottom: "10px" }}>HOST PvP MATCH</button>
        <input type="text" placeholder="ROOM CODE" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)} style={{ width: "100%", padding: "12px", background: "#000", color: "#fff", border: "1px solid #333", textAlign: "center", marginBottom: "10px" }} />
        <button onClick={joinGame} style={{ width: "100%", padding: "12px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>JOIN PvP MATCH</button>
      </div>
    );
  }

  // --- WAITING ROOM ---
  if (gameMode === "PvP" && !opponentJoined && myColor === "white") {
    return (
      <div style={{ textAlign: "center", padding: "50px", background: "#111", border: "2px dashed #ffcc00" }}>
        <h2 style={{ color: "#ffcc00" }}>ROOM CREATED</h2>
        <p style={{ color: "#888" }}>Share this code with your rival:</p>
        <div style={{ fontSize: "40px", color: "#fff", fontWeight: "bold", margin: "20px" }}>{gameId}</div>
        <p style={{ color: "#555" }}>The game will start automatically when they join.</p>
      </div>
    );
  }

  // --- GAME BOARD ---
  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <p style={{ color: "#ffcc00" }}>{message}</p>
      <button onClick={throwSticks} disabled={lastThrow > 0} style={{ padding: "10px 20px", background: "#ffcc00", fontWeight: "bold", margin: "10px" }}>THROW STICKS</button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 55px)", width: "550px", margin: "20px auto", border: "5px solid #8b7355" }}>
        {board.map((_, i) => renderSquare(i))}
      </div>
    </div>
  );
}
