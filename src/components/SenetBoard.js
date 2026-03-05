"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [gameMode, setGameMode] = useState("AI"); 
  const [activeGameId, setActiveGameId] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [view, setView] = useState("game"); 
  const [gameOver, setGameOver] = useState(false);
  
  // USERNAME SELECTION
  const [username, setUsername] = useState(player1?.username || "Traveler");

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.8)"
  };

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    // FORCE INITIAL BOARD LOAD
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // Sync for PvP
  useEffect(() => {
    if (gameMode !== "PvP" || !activeGameId) return;
    const channel = supabase.channel(`game:${activeGameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'senet_games', filter: `id=eq.${activeGameId}` }, 
      (payload) => {
        const data = payload.new;
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
        setBorneOff(data.borne_off);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeGameId, gameMode]);

  // --- 3. LOBBY & PERSISTENCE ---
  const fetchOpenGames = async () => {
    const { data } = await supabase.from("senet_games").select("*").eq("status", "open");
    setAvailableGames(data || []);
  };

  const hostGame = async () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    const { error } = await supabase.from("senet_games").insert([{
      id: roomCode,
      player_white: username,
      board_state: board,
      status: "open",
      turn: "white"
    }]);
    if (!error) {
      setActiveGameId(roomCode);
      setGameMode("PvP");
      setView("game");
    }
  };

  const logMove = async (from, to, piece) => {
    if (!activeGameId || gameMode !== "PvP") return;
    await supabase.from("senet_moves").insert([{
      game_id: activeGameId,
      player_id: username,
      move_from: from,
      move_to: to,
      piece_type: piece,
      throw_value: lastThrow
    }]);
  };

  // --- 4. GAMEPLAY LOGIC ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalScore = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
        setLastThrow(finalScore);
        setIsRolling(false);
        if (gameMode === "PvP") updateRemote(board, turn, finalScore, borneOff);
      }
    }, 80);
  };

  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling) return;
    
    // Select your piece
    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } 
    // Execute move if piece is selected
    else if (selectedSquare !== null) {
      const targetIdx = selectedSquare + lastThrow;
      if (idx === targetIdx || (targetIdx >= 30 && idx === 29)) {
        executeMove(selectedSquare, targetIdx);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    // Bearing off (Winning)
    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      await logMove(from, 30, piece);
      finalizeTurn(newBoard, newBorne);
      return;
    }

    // Capture / Move
    const occupant = newBoard[to];
    newBoard[from] = occupant || null;
    newBoard[to] = turn;

    await logMove(from, to, piece);
    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (newBoard, newBorne) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    setBoard(newBoard);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextTurn);
    if (gameMode === "PvP") updateRemote(newBoard, nextTurn, 0, newBorne);
  };

  const updateRemote = async (nb, nt, lt, nbo) => {
    await supabase.from('senet_games').update({
      board_state: nb, turn: nt, last_throw: lt, borne_off: nbo
    }).eq('id', activeGameId);
  };

  // --- 5. RENDER ---
  if (view === "lobby") {
    return (
      <div style={{ padding: "80px", textAlign: "center", color: colors.gold, backgroundColor: "#000", minHeight: "100vh" }}>
        <h2 style={{ letterSpacing: "5px" }}>𓉐 SENET LOBBY</h2>
        
        <div style={{ marginBottom: "30px" }}>
          <p style={{ fontSize: "12px" }}>YOUR IDENTITY</p>
          <input 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: "10px", textAlign: "center", background: "#111", color: colors.gold, border: `1px solid ${colors.gold}`, borderRadius: "4px" }}
          />
        </div>

        <button onClick={hostGame} style={{ padding: "15px 30px", background: colors.gold, border: "none", cursor: "pointer", fontWeight: "bold", borderRadius: "4px" }}>HOST PVP MATCH</button>
        
        <div style={{ margin: "40px auto", maxWidth: "400px" }}>
          <button onClick={fetchOpenGames} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Refresh Open Games</button>
          {availableGames.map(g => (
            <div key={g.id} style={{ border: "1px solid #333", padding: "15px", margin: "10px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{g.player_white}'s Tomb</span>
              <button onClick={() => {setActiveGameId(g.id); setGameMode("PvP"); setView("game");}} style={{ background: colors.gold, border: "none", padding: "5px 15px", cursor: "pointer" }}>JOIN</button>
            </div>
          ))}
        </div>
        <button onClick={() => setView("game")} style={{ background: "none", color: "#666", border: "none", cursor: "pointer" }}>Back to Board</button>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", padding: "20px", backgroundColor: "#000", minHeight: "100vh" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px", margin: "0" }}>TOMB OF SENET</h1>
      
      <div style={{ margin: "20px 0" }}>
        <button onClick={() => { setView("lobby"); fetchOpenGames(); }} style={{ background: "none", border: `1px solid ${colors.gold}`, color: colors.gold, padding: "8px 20px", borderRadius: "20px", cursor: "pointer" }}>
          {gameMode === "PvP" ? `ROOM: ${activeGameId}` : "MULTIPLAYER LOBBY"}
        </button>
      </div>

      <div style={{ height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 ? (
           <div style={{ color: colors.gold, fontSize: "24px", fontWeight: "bold" }}>CAST: {lastThrow}</div>
        ) : (
          <p style={{ color: "#444" }}>Roll the sticks to move.</p>
        )}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 50px", background: colors.gold, borderRadius: "50px", border: "none", fontWeight: "bold", cursor: "pointer", fontSize: "16px" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(10, 60px)", 
        margin: "40px auto", 
        width: "600px", 
        border: `10px solid ${colors.darkSand}`,
        backgroundColor: "#111",
        boxShadow: "0 0 50px rgba(0,0,0,1)"
      }}>
        {board.map((cell, i) => (
          <div key={i} onClick={() => handleSquareClick(i)} style={{
            width: "60px", 
            height: "60px", 
            border: "1px solid #222", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            background: selectedSquare === i ? "rgba(255,204,0,0.2)" : "transparent",
            cursor: "pointer",
            transition: "0.2s"
          }}>
            {cell === "white" && <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#eee", boxShadow: "0 4px #999" }} />}
            {cell === "black" && <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: "#333", boxShadow: "0 4px #000" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "60px", color: colors.gold, fontWeight: "bold" }}>
        <div>{username.toUpperCase()}: {borneOff.white}/5</div>
        <div>OPPONENT: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
