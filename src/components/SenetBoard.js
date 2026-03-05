"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [gameMode, setGameMode] = useState("AI"); 
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [activeGameId, setActiveGameId] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [view, setView] = useState("game"); 
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("Traveler");

  const colors = { gold: "#ffcc00", sand: "#c2b280" };

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);

    const fetchUsers = async () => {
      const { data } = await supabase.from("treasury").select("username");
      if (data) setUsers(data);
    };
    fetchUsers();
  }, []);

  // PvP Realtime Sync
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

  // --- 3. MOVEMENT LOGIC (FIXED) ---
  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling) return;

    // First Click: Select a piece of your color
    if (board[idx] === turn) {
      setSelectedSquare(idx);
      return;
    }

    // Second Click: Move to target if one is selected
    if (selectedSquare !== null) {
      const target = selectedSquare + lastThrow;
      
      // Validation: Clicked square must be the valid move target
      if (idx === target || (target >= 30 && idx === 29)) {
        executeMove(selectedSquare, target);
      } else {
        // If they click a non-target, deselect unless it's another of their pieces
        if (board[idx] !== turn) setSelectedSquare(null);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    // Win/Bear off condition
    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      finalizeTurn(newBoard, newBorne);
      return;
    }

    // Capture/Swap logic
    const occupant = newBoard[to];
    newBoard[from] = occupant || null;
    newBoard[to] = turn;

    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (newBoard, newBorne) => {
    // 1, 4, and 5 grant an extra throw in Senet
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    
    setBoard(newBoard);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextTurn);

    if (gameMode === "PvP") updateRemote(newBoard, nextTurn, 0, newBorne);
    
    // Trigger AI if it's black's turn and AI mode is on
    if (gameMode === "AI" && nextTurn === "black") {
        setTimeout(handleAIMove, 1000);
    }
  };

  const handleAIMove = () => {
      // Basic AI logic: Throws and moves first available piece
      const roll = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
      setLastThrow(roll);
      // ... AI specific move logic based on difficulty ...
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
        if (gameMode === "PvP") updateRemote(board, turn, final, borneOff);
      }
    }, 70);
  };

  const updateRemote = async (nb, nt, lt, nbo) => {
    if (!activeGameId) return;
    await supabase.from('senet_games').update({
      board_state: nb, turn: nt, last_throw: lt, borne_off: nbo
    }).eq('id', activeGameId);
  };

  // --- 4. RENDER ---
  const renderSquare = (idx) => {
    const symbols = { 
        14: "𓋹", // Ankh
        26: "𓈗", // House of Water
        27: "𓏪", // Three Dots
        28: "𓁶", // Head
        29: "𓅃"  // Horus
    };

    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
        width: "60px", height: "60px", border: "1px solid #555",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: selectedSquare === idx ? "rgba(255, 204, 0, 0.4)" : "transparent",
        position: "relative", cursor: "pointer", transition: "0.2s"
      }}>
        {symbols[idx] && <span style={{ fontSize: "28px", color: colors.gold, opacity: 0.7 }}>{symbols[idx]}</span>}
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} alt="Pyramid" />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "35px", zIndex: 2 }} alt="Figure" />}
      </div>
    );
  };

  if (view === "lobby") {
    return (
      <div style={{ padding: "100px", textAlign: "center", color: colors.gold, background: "#000", minHeight: "100vh" }}>
        <h2 style={{ letterSpacing: "5px" }}>𓉐 SENET LOBBY</h2>
        
        <div style={{ margin: "20px" }}>
          <p>IDENTITY</p>
          <select value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold" }}>
            <option value="Traveler">Select Username...</option>
            {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
          </select>
        </div>

        <div style={{ margin: "20px" }}>
          <p>OPPONENT DEITY</p>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold" }}>
            <option value="Scribe">Scribe (Easy)</option>
            <option value="Pharaoh">Pharaoh (Normal)</option>
            <option value="Ra">Ra (Legendary)</option>
          </select>
        </div>

        <button onClick={() => { setGameMode("AI"); setView("game"); }} style={{ padding: "15px 30px", background: colors.gold, fontWeight: "bold", border: "none", cursor: "pointer", marginRight: "10px" }}>PLAY VS AI</button>
        <button onClick={async () => { setGameMode("PvP"); setView("game"); }} style={{ padding: "15px 30px", background: "none", color: colors.gold, border: "1px solid gold", cursor: "pointer" }}>HOST PvP MATCH</button>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", padding: "20px", background: "#000", minHeight: "100vh" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px" }}>TOMB OF SENET</h1>
      
      <button onClick={() => setView("lobby")} style={{ background: "none", border: `1px solid ${colors.gold}`, color: colors.gold, padding: "5px 20px", borderRadius: "20px", cursor: "pointer", marginBottom: "20px" }}>
        LOBBY / MODE
      </button>

      <div style={{ height: "140px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "110px", boxShadow: "0 0 20px rgba(255,204,0,0.2)" }} alt="Throw sticks" />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 60px", background: colors.gold, border: "none", fontWeight: "bold", borderRadius: "50px", cursor: "pointer", fontSize: "16px", marginBottom: "30px" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      {/* RESTORED RICH BOARD THEME */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(10, 60px)", 
        margin: "0 auto", 
        width: "600px", 
        border: `12px solid #3d2b1f`, 
        backgroundColor: "#111",
        backgroundImage: "url('https://www.transparenttextures.com/patterns/dark-matter.png')", // Stone/Leather feel
        boxShadow: "0 20px 50px rgba(0,0,0,0.9)"
      }}>
        {board.map((_, i) => renderSquare(i))}
      </div>

      <div style={{ marginTop: "30px", display: "flex", justifyContent: "center", gap: "60px", color: colors.gold, fontWeight: "bold", fontSize: "18px" }}>
        <div>{username.toUpperCase()}: {borneOff.white}/5</div>
        <div>{gameMode === "AI" ? difficulty.toUpperCase() : "OPPONENT"}: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
