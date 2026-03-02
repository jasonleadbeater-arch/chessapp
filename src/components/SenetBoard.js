"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. LOBBY & IDENTITY STATE (Linked to Treasury) ---
  const [gameId, setGameId] = useState(null);
  const [myColor, setMyColor] = useState("white"); 
  const [isJoined, setIsJoined] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [inputRoom, setInputRoom] = useState("");
  
  // Treasury/Profile Data
  const [username, setUsername] = useState("Traveler");
  const [loadingProfile, setLoadingProfile] = useState(true);

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

  // --- 3. IDENTITY FETCH (Mirroring GameBoard.js) ---
  useEffect(() => {
    async function getProfile() {
      if (!player1?.id) return;
      
      const { data, error } = await supabase
        .from("treasury") // Change to "profiles" if that is your table name
        .select("username")
        .eq("id", player1.id)
        .single();

      if (data?.username) {
        setUsername(data.username);
      } else {
        // Fallback to email prefix if no username in treasury
        setUsername(player1.email?.split('@')[0] || "Traveler");
      }
      setLoadingProfile(false);
    }
    getProfile();
  }, [player1]);

  // --- 4. MATCHMAKING LOGIC ---
  const hostGame = async () => {
    // Generates short 5-char code
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null);
    
    const { error } = await supabase.from('senet_games').insert([{ 
      id: newRoomId, 
      player_white: username,
      board_state: initialBoard,
      turn: 'white',
      borne_off: { white: 0, black: 0 },
      last_throw: 0 // This will now pass the database check
    }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setGameMode("PvP");
      setIsJoined(true);
    } else {
      console.error(error);
      alert("Host Error: " + error.message);
    }
  };

  const joinGame = async () => {
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

  // --- 5. AI & GAMEPLAY (Restored Levels) ---
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
    setIsRolling(true);
    setTimeout(() => {
      const res = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
      setLastThrow(res);
      setIsRolling(false);
      if (gameMode === "PvP") updateRemoteGame(board, turn, res, borneOff);
    }, 800);
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];
    if (to >= 30) {
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
      } else {
        finalizeTurn(newBoard, newBorneOff);
      }
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

  const handleWin = async (winner) => {
    const rewards = { Scribe: 5, Pharaoh: 20, Ra: 50 };
    const prize = rewards[difficulty] || 20;
    setMessage(`Victory! ${winner.toUpperCase()} wins ${prize} coins.`);
    if (winner === "white" && player1?.id) {
      await supabase.rpc('increment_coins', { row_id: player1.id, x: prize });
    }
  };

  // --- 6. RENDERING ---
  const renderSquare = (idx) => (
    <div key={idx} onClick={() => board[idx] === turn && lastThrow > 0 && executeMove(idx, idx + lastThrow)} style={{
      width: "55px", height: "55px", border: "1px solid #444",
      backgroundImage: `url(/themes/sq${(idx+1).toString().padStart(2, '0')}.png)`,
      backgroundSize: "cover", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer"
    }}>
      {board[idx] && <img src={`/themes/${board[idx]}_piece.png`} style={{ width: "40px" }} />}
    </div>
  );

  if (!isJoined) {
    return (
      <div style={{ padding: "40px", background: "#111", border: "1px solid #ffcc00", borderRadius: "10px", maxWidth: "450px", margin: "0 auto", textAlign: "center" }}>
        <h2 style={{ color: "#ffcc00" }}>SENET LOBBY</h2>
        <p style={{ color: "#888", marginBottom: "20px" }}>Welcome, <span style={{ color: "#ffcc00" }}>{username}</span></p>

        <div style={{ marginBottom: "20px" }}>
          <label style={{ color: "#888", fontSize: "12px", display: "block", marginBottom: "5px" }}>AI DIFFICULTY</label>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ width: "100%", padding: "10px", background: "#222", color: "#fff", border: "1px solid #444" }}>
            <option value="Scribe">Scribe (5 Coins)</option>
            <option value="Pharaoh">Pharaoh (20 Coins)</option>
            <option value="Ra">Ra (50 Coins)</option>
          </select>
        </div>

        <button onClick={initializeAiGame} style={{ width: "100%", padding: "15px", background: "#ffcc00", fontWeight: "bold", border: "none", cursor: "pointer", marginBottom: "20px" }}>PLAY VS AI</button>
        <hr style={{ borderColor: "#333", margin: "20px 0" }} />
        
        <button onClick={hostGame} style={{ width: "100%", padding: "12px", background: "none", color: "#ffcc00", border: "1px solid #ffcc00", cursor: "pointer", marginBottom: "10px" }}>HOST PvP MATCH</button>
        <input type="text" placeholder="ENTER ROOM CODE" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)} style={{ width: "100%", padding: "12px", background: "#000", color: "#fff", border: "1px solid #333", textAlign: "center", marginBottom: "10px" }} />
        <button onClick={joinGame} style={{ width: "100%", padding: "12px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>JOIN PvP MATCH</button>
      </div>
    );
  }

  if (gameMode === "PvP" && !opponentJoined && myColor === "white") {
    return (
      <div style={{ textAlign: "center", padding: "50px", background: "#111", border: "2px dashed #ffcc00", color: "#fff" }}>
        <h2 style={{ color: "#ffcc00" }}>CHAMBER CREATED</h2>
        <p>Invite your opponent with this code:</p>
        <div style={{ fontSize: "40px", fontWeight: "bold", margin: "20px", letterSpacing: "5px" }}>{gameId}</div>
        <p style={{ color: "#555" }}>Standing by for rival connection...</p>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <p style={{ color: "#ffcc00" }}>{message}</p>
      <button onClick={throwSticks} disabled={lastThrow > 0 || isRolling} style={{ padding: "10px 20px", background: "#ffcc00", fontWeight: "bold", margin: "10px", border: "none", cursor: "pointer" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 55px)", width: "550px", margin: "20px auto", border: "5px solid #8b7355" }}>
        {board.map((_, i) => renderSquare(i))}
      </div>
      <div style={{ color: "#888" }}>
        White: {borneOff.white}/5 | Black: {borneOff.black}/5
      </div>
    </div>
  );
}
