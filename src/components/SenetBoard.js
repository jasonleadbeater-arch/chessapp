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
  
  // Treasury User Selection
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("Traveler");

  const colors = { gold: "#ffcc00", darkSand: "#8b7355", obsidian: "rgba(0,0,0,0.8)" };

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    // Initial Board Setup: Restores the alternating starting pieces
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);

    // Fetch Usernames from Treasury for the dropdown
    const fetchUsers = async () => {
      const { data } = await supabase.from("treasury").select("username");
      if (data) setUsers(data);
    };
    fetchUsers();
  }, []);

  // Realtime Sync for PvP Matches
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

  // --- 3. PERSISTENCE & LOBBY ---
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

  const hostGame = async () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    const { error } = await supabase.from("senet_games").insert([{
      id: roomCode,
      player_white: username,
      board_state: board,
      status: "open",
      turn: "white",
      last_throw: 0 // Prevents check constraint error
    }]);
    if (!error) { setActiveGameId(roomCode); setGameMode("PvP"); setView("game"); }
  };

  const fetchOpenGames = async () => {
    const { data } = await supabase.from("senet_games").select("*").eq("status", "open");
    setAvailableGames(data || []);
  };

  // --- 4. GAMEPLAY LOGIC ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 12) {
        clearInterval(interval);
        const finalScore = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
        setLastThrow(finalScore);
        setIsRolling(false);
        if (gameMode === "PvP") updateRemote(board, turn, finalScore, borneOff);
      }
    }, 70);
  };

  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling) return;
    
    // Select piece if it belongs to current turn
    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } 
    // Execute move if a piece was already selected
    else if (selectedSquare !== null) {
      const target = selectedSquare + lastThrow;
      if (idx === target || (target >= 30 && idx === 29)) {
        executeMove(selectedSquare, target);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    // Bearing off (Exiting the board)
    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      await logMove(from, 30, piece);
      finalizeTurn(newBoard, newBorne);
      return;
    }

    // Standard Movement / Swapping
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
    if (!activeGameId) return;
    await supabase.from('senet_games').update({
      board_state: nb, turn: nt, last_throw: lt, borne_off: nbo
    }).eq('id', activeGameId);
  };

  // --- 5. RENDER HELPERS ---
  const renderSquare = (idx) => {
    // Egyptian Symbols for special squares
    const symbols = { 26: "𓈗", 27: "𓏪", 28: "𓁶", 29: "𓅃", 14: "𓋹" };

    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
        width: "60px", height: "60px", border: "1px solid #444",
        background: selectedSquare === idx ? "rgba(255,204,0,0.3)" : "transparent",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: "30px", color: colors.gold, cursor: "pointer", position: "relative"
      }}>
        {symbols[idx]}
        {/* Pyramid for White, Blue Figure for Black as per your original screens */}
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", position: "absolute" }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", position: "absolute" }} />}
      </div>
    );
  };

  // Lobby View
  if (view === "lobby") {
    return (
      <div style={{ padding: "100px", textAlign: "center", color: colors.gold, backgroundColor: "#000", minHeight: "100vh" }}>
        <h2>𓉐 SENET LOBBY</h2>
        
        <div style={{ marginBottom: "30px" }}>
          <p>SELECT YOUR IDENTITY</p>
          <select 
            value={username} 
            onChange={(e) => setUsername(e.target.value)}
            style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold", width: "200px" }}
          >
            <option value="Traveler">Select Username...</option>
            {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
          </select>
        </div>

        <button onClick={hostGame} style={{ padding: "15px 30px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer" }}>HOST PVP MATCH</button>
        
        <div style={{ marginTop: "40px" }}>
          <button onClick={fetchOpenGames} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Refresh Open Games</button>
          {availableGames.map(g => (
            <div key={g.id} style={{ border: "1px solid #333", padding: "10px", margin: "10px auto", maxWidth: "300px", display: "flex", justifyContent: "space-between" }}>
              <span>{g.player_white}'s Tomb</span>
              <button onClick={() => {setActiveGameId(g.id); setGameMode("PvP"); setView("game");}} style={{ color: colors.gold }}>JOIN</button>
            </div>
          ))}
        </div>
        <button onClick={() => setView("game")} style={{ marginTop: "20px", background: "none", color: "#666", border: "none" }}>Back to Board</button>
      </div>
    );
  }

  // Main Game View
  return (
    <div style={{ color: "#fff", textAlign: "center", backgroundColor: "#000", minHeight: "100vh", padding: "20px" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px" }}>TOMB OF SENET</h1>
      
      <button onClick={() => { setView("lobby"); fetchOpenGames(); }} style={{ background: "none", border: "1px solid gold", color: colors.gold, padding: "5px 15px", borderRadius: "20px", marginBottom: "20px", cursor: "pointer" }}>
        {gameMode === "PvP" ? `ROOM: ${activeGameId}` : "MULTIPLAYER LOBBY"}
      </button>

      {/* Throw Sticks Graphic Restored */}
      <div style={{ height: "120px", display: "flex", justifyContent: "center", alignItems: "center", margin: "10px 0" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "100px" }} alt="sticks" />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 50px", background: colors.gold, borderRadius: "50px", border: "none", fontWeight: "bold", cursor: "pointer" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      {/* Board Layout Restored */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(10, 60px)", 
        margin: "40px auto", 
        width: "600px", 
        border: `8px solid ${colors.darkSand}`,
        backgroundColor: "#111"
      }}>
        {board.map((_, i) => renderSquare(i))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "60px", color: colors.gold, fontWeight: "bold" }}>
        <div>{username.toUpperCase()}: {borneOff.white}/5</div>
        <div>OPPONENT: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
