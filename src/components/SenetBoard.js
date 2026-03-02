"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. LOBBY & IDENTITY ---
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
  const [message, setMessage] = useState("The tomb is open. Choose your path.");
  const [difficulty, setDifficulty] = useState("Pharaoh"); 
  const [gameMode, setGameMode] = useState("AI"); 
  const [gameOver, setGameOver] = useState(false);

  // --- 3. FETCH USERNAME FROM TREASURY ---
  useEffect(() => {
    async function getProfile() {
      if (!player1?.id) return;
      const { data } = await supabase.from("treasury").select("username").eq("id", player1.id).single();
      if (data?.username) setUsername(data.username);
    }
    getProfile();
  }, [player1]);

  // --- 4. MATCHMAKING ---
  const hostGame = async () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    
    const { error } = await supabase.from('senet_games').insert([{ 
      id: newRoomId, 
      player_white: username,
      board_state: initialBoard,
      turn: 'white',
      borne_off: { white: 0, black: 0 },
      last_throw: 1 // Sent as 1 to avoid strict DB checks
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

  // --- 5. GAME LOGIC (FULL S-CURVE & SPECIAL RULES) ---
  const initializeAiGame = () => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
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
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 12) {
        clearInterval(interval);
        const final = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
        setLastThrow(final);
        setIsRolling(false);
        if (gameMode === "PvP") updateRemoteGame(board, turn, final, borneOff);
      }
    }, 70);
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];
    
    if (to >= 30) {
      if (from < 20) { setMessage("Finish rows 1 and 2 first!"); return; }
      newBoard[from] = null;
      const nbo = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(nbo);
      if (nbo[turn] === 5) { setGameOver(true); handleWin(turn); }
      else finalizeTurn(newBoard, nbo);
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; 

    // Swap pieces
    newBoard[from] = (occupant && occupant !== turn) ? occupant : null;
    newBoard[to] = turn;

    // House of Water (Sq 26)
    if (to === 26) {
      newBoard[26] = null;
      const restartIdx = !newBoard[14] ? 14 : 0;
      newBoard[restartIdx] = turn;
      setMessage("The Nile claims you! Back to Sq 15.");
    }

    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (nb, cbo) => {
    const extra = [1, 4, 5].includes(lastThrow);
    const next = extra ? turn : (turn === "white" ? "black" : "white");
    setBoard(nb);
    setLastThrow(0);
    setTurn(next);
    setSelectedSquare(null);
    if (gameMode === "PvP") updateRemoteGame(nb, next, 0, cbo);
  };

  const updateRemoteGame = async (nb, nt, lt, cbo) => {
    await supabase.from('senet_games').update({ board_state: nb, turn: nt, last_throw: lt, borne_off: cbo }).eq('id', gameId);
  };

  const handleWin = async (winner) => {
    const prizes = { Scribe: 5, Pharaoh: 20, Ra: 50 };
    const amt = prizes[difficulty] || 20;
    setMessage(`VICTORY! ${winner.toUpperCase()} gains ${amt} coins.`);
    if (winner === "white" && player1?.id) {
      await supabase.rpc('increment_coins', { row_id: player1.id, x: amt });
    }
  };

  // --- 6. VISUALS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const n = idx + 1;
    const imgPath = `/themes/sq${n.toString().padStart(2, '0')}.${n === 28 ? 'jpeg' : 'png'}`;
    
    return (
      <div key={idx} onClick={() => {
        if (board[idx] === turn) setSelectedSquare(idx);
        else if (selectedSquare !== null && idx === selectedSquare + lastThrow) executeMove(selectedSquare, idx);
      }} style={{
        width: "60px", height: "60px", border: isSelected ? "2px solid gold" : "1px solid #333",
        backgroundImage: `url(${imgPath})`, backgroundSize: "cover",
        display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", position: "relative"
      }}>
        {board[idx] && <img src={`/themes/${board[idx]}_piece.png`} style={{ width: "45px" }} />}
        <span style={{ position: "absolute", top: 2, left: 2, fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{n}</span>
      </div>
    );
  };

  if (!isJoined) {
    return (
      <div style={{ padding: "40px", background: "#111", border: "1px solid gold", borderRadius: "10px", maxWidth: "450px", margin: "40px auto", textAlign: "center" }}>
        <h2 style={{ color: "gold", fontFamily: "serif" }}>TOMB OF SENET</h2>
        <p style={{ color: "#888" }}>Welcome, <span style={{ color: "gold" }}>{username}</span></p>
        
        <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ width: "100%", padding: "10px", margin: "20px 0", background: "#222", color: "#fff" }}>
          <option value="Scribe">Scribe (5 Coins)</option>
          <option value="Pharaoh">Pharaoh (20 Coins)</option>
          <option value="Ra">Ra (50 Coins)</option>
        </select>

        <button onClick={initializeAiGame} style={{ width: "100%", padding: "15px", background: "gold", fontWeight: "bold", border: "none", cursor: "pointer", marginBottom: "15px" }}>PLAY VS AI</button>
        <hr style={{ borderColor: "#333" }} />
        <button onClick={hostGame} style={{ width: "100%", padding: "12px", background: "none", color: "gold", border: "1px solid gold", cursor: "pointer", marginTop: "15px" }}>HOST PvP MATCH</button>
        <input type="text" placeholder="ENTER CODE" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)} style={{ width: "100%", padding: "12px", margin: "10px 0", background: "#000", color: "#fff", textAlign: "center" }} />
        <button onClick={joinGame} style={{ width: "100%", padding: "12px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>JOIN PvP MATCH</button>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <p style={{ color: "gold", fontSize: "1.2em" }}>{message}</p>
      
      <div style={{ height: "100px", display: "flex", justifyContent: "center", margin: "10px" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "90px" }} />}
      </div>

      <button onClick={throwSticks} disabled={lastThrow > 0 || isRolling} style={{ padding: "12px 30px", background: "gold", fontWeight: "bold", border: "none", cursor: "pointer", marginBottom: "20px" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      {/* S-CURVE GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", width: "600px", margin: "0 auto", border: "5px solid #8b7355" }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>
      
      <div style={{ marginTop: "20px", color: "gold" }}>
        WHITE: {borneOff.white}/5 | BLACK: {borneOff.black}/5
      </div>
    </div>
  );
}
