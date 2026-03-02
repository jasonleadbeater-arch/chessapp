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
  const [username, setUsername] = useState("Traveler");

  // --- 2. CORE GAME STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The sticks await your command.");
  const [difficulty, setDifficulty] = useState("Pharaoh"); 
  const [gameMode, setGameMode] = useState("AI"); 
  const [gameOver, setGameOver] = useState(false);

  const borneOffRef = useRef({ white: 0, black: 0 });

  // --- 3. IDENTITY FETCH (Linking to Treasury) ---
  useEffect(() => {
    async function getProfile() {
      if (!player1?.id) return;
      const { data } = await supabase.from("treasury").select("username").eq("id", player1.id).single();
      if (data?.username) setUsername(data.username);
      else setUsername(player1.email?.split('@')[0] || "Traveler");
    }
    getProfile();
  }, [player1]);

  // --- 4. MATCHMAKING ---
  const hostGame = async () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null);
    
    // We send 1 instead of 0 for last_throw to bypass any remaining database constraints
    const { error } = await supabase.from('senet_games').insert([{ 
      id: newRoomId, 
      player_white: username,
      board_state: initialBoard,
      turn: 'white',
      borne_off: { white: 0, black: 0 },
      last_throw: 1 
    }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setGameMode("PvP");
      setIsJoined(true);
    } else {
      alert("Host Error: " + error.message);
    }
  };

  const joinGame = async () => {
    if (!inputRoom) return alert("Enter a room code.");
    const { data } = await supabase.from('senet_games').select('*').eq('id', inputRoom.toUpperCase()).single();
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

  // --- 5. GAMEPLAY LOGIC (Non-Streamlined) ---
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

  const throwSticks = () => {
    if (isRolling || lastThrow > 0) return;
    setIsRolling(true);
    setMessage("Casting the sticks...");
    
    // Animated roll effect
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 12) {
        clearInterval(interval);
        const final = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
        setLastThrow(final);
        setIsRolling(false);
        setMessage(`You threw a ${final}!`);
        if (gameMode === "PvP") updateRemoteGame(board, turn, final, borneOff);
      }
    }, 70);
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];
    
    // Afterlife Exit (Winning a piece)
    if (to >= 30) {
      if (from < 20) { setMessage("Complete the rows first!"); return; }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
      } else finalizeTurn(newBoard, newBorneOff);
      return;
    }

    // Standard Movement
    const occupant = newBoard[to];
    if (occupant === turn) return; // Can't land on own piece

    newBoard[from] = (occupant && occupant !== turn) ? occupant : null;
    newBoard[to] = turn;

    // Square 26: The House of Water (Drowning)
    if (to === 26) {
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn;
      else newBoard[0] = turn;
      setMessage("Drowned! Returning to the Nile.");
    }

    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (nb, cbo) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    setBoard(nb);
    setLastThrow(0);
    setTurn(nextTurn);
    setSelectedSquare(null);
    if (gameMode === "PvP") updateRemoteGame(nb, nextTurn, 0, cbo);
  };

  const updateRemoteGame = async (nb, nt, lt, cbo) => {
    await supabase.from('senet_games').update({ 
        board_state: nb, turn: nt, last_throw: lt, borne_off: cbo 
    }).eq('id', gameId);
  };

  const handleWin = async (winner) => {
    const rewards = { Scribe: 5, Pharaoh: 20, Ra: 50 };
    const prize = rewards[difficulty] || 20;
    setMessage(`VICTORY! ${winner.toUpperCase()} wins ${prize} coins.`);
    if (winner === "white" && player1?.id) {
      await supabase.rpc('increment_coins', { row_id: player1.id, x: prize });
    }
  };

  // --- 6. RENDER HELPERS (Restored Visuals) ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    
    return (
      <div key={idx} onClick={() => {
        if (board[idx] === turn) setSelectedSquare(idx);
        else if (selectedSquare !== null && idx === selectedSquare + lastThrow) executeMove(selectedSquare, idx);
      }} style={{
        width: "60px", height: "60px",
        border: isSelected ? "2px solid #ffcc00" : "1px solid rgba(255,255,255,0.1)",
        backgroundImage: `url(/themes/sq${paddedNum}.${num === 28 ? 'jpeg' : 'png'})`,
        backgroundSize: "cover", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative"
      }}>
        {board[idx] && <img src={`/themes/${board[idx]}_piece.png`} style={{ width: "45px", zIndex: 2 }} alt="piece" />}
        <span style={{ position: "absolute", bottom: 2, right: 2, fontSize: "9px", color: "rgba(255,255,255,0.3)" }}>{num}</span>
      </div>
    );
  };

  if (!isJoined) {
    return (
      <div style={{ padding: "40px", background: "#000", border: "1px solid #ffcc00", borderRadius: "10px", maxWidth: "450px", margin: "40px auto", textAlign: "center", boxShadow: "0 0 20px rgba(255,204,0,0.2)" }}>
        <h2 style={{ color: "#ffcc00", fontFamily: "serif", letterSpacing: "2px" }}>SENET LOBBY</h2>
        <p style={{ color: "#888" }}>Welcome, <span style={{ color: "#ffcc00" }}>{username}</span></p>

        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ width: "100%", padding: "12px", background: "#111", color: "#fff", border: "1px solid #444", margin: "20px 0" }}>
          <option value="Scribe">Scribe (5 Coins)</option>
          <option value="Pharaoh">Pharaoh (20 Coins)</option>
          <option value="Ra">Ra (50 Coins)</option>
        </select>

        <button onClick={initializeAiGame} style={{ width: "100%", padding: "15px", background: "#ffcc00", fontWeight: "bold", border: "none", cursor: "pointer", marginBottom: "15px" }}>PLAY VS AI</button>
        <div style={{ height: "1px", background: "#333", margin: "20px 0" }} />
        <button onClick={hostGame} style={{ width: "100%", padding: "12px", background: "none", color: "#ffcc00", border: "1px solid #ffcc00", cursor: "pointer", marginBottom: "10px" }}>HOST PvP MATCH</button>
        <input type="text" placeholder="ENTER ROOM CODE" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)} style={{ width: "100%", padding: "12px", background: "#000", color: "#fff", border: "1px solid #333", textAlign: "center", marginBottom: "10px" }} />
        <button onClick={joinGame} style={{ width: "100%", padding: "12px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>JOIN PvP MATCH</button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", color: "#fff", padding: "20px" }}>
      <p style={{ color: "#ffcc00", fontSize: "1.2rem", minHeight: "30px" }}>{message}</p>
      
      {/* Stick Display */}
      <div style={{ height: "100px", display: "flex", justifyContent: "center", alignItems: "center", margin: "10px 0" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "80px" }} alt="sticks" />}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginBottom: "20px" }}>
        <button onClick={throwSticks} disabled={lastThrow > 0 || isRolling} style={{ padding: "12px 30px", background: "#ffcc00", fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "5px" }}>
          {isRolling ? "CASTING..." : "THROW STICKS"}
        </button>
        {selectedSquare !== null && selectedSquare + lastThrow >= 30 && (
          <button onClick={() => executeMove(selectedSquare, 30)} style={{ padding: "12px 30px", background: "orange", fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "5px" }}>ENTER AFTERLIFE</button>
        )}
      </div>

      {/* The Board Grid with S-Path Logic */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", width: "612px", margin: "0 auto", border: "6px solid #8b7355", background: "#000", padding: "2px" }}>
        {/* Row 1: 1-10 (Left to Right) */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {/* Row 2: 20-11 (Right to Left) */}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {/* Row 3: 21-30 (Left to Right) */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "20px", color: "#ffcc00", fontWeight: "bold" }}>
        WHITE: {borneOff.white}/5 | BLACK: {borneOff.black}/5
      </div>
    </div>
  );
}
