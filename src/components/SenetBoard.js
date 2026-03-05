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

  const colors = { gold: "#ffcc00", sand: "#c2b280", tombEdge: "#4d3a26" };

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
        setLast_throw(data.last_throw);
        setBorneOff(data.borne_off);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeGameId, gameMode]);

  // --- 3. MOVEMENT LOGIC ---
  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling) return;
    if (gameMode === "AI" && turn === "black") return; // Prevent clicking during AI turn

    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } else if (selectedSquare !== null) {
      const target = selectedSquare + lastThrow;
      if (idx === target || (target >= 30 && idx === 29)) {
        executeMove(selectedSquare, target);
      } else {
        setSelectedSquare(null);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    
    // A. Win condition / Bearing off
    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      finalizeTurn(newBoard, newBorne);
      return;
    }

    // B. HOUSE OF WATER (Square 27 / Index 26)
    if (to === 26) {
      newBoard[from] = null;
      // Drown: Return to Square 15 (Index 14) or Square 1 (Index 0)
      const rebirthIdx = newBoard[14] === null ? 14 : 0;
      newBoard[rebirthIdx] = turn;
      finalizeTurn(newBoard, borneOff);
      return;
    }

    // C. Traditional Capture Swap
    const occupant = newBoard[to];
    newBoard[from] = occupant || null;
    newBoard[to] = turn;

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
    
    // Trigger AI
    if (gameMode === "AI" && nextTurn === "black") {
      setTimeout(aiTurn, difficulty === "Ra" ? 600 : 1200);
    }
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

  const aiTurn = () => {
    const roll = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
    setLastThrow(roll);

    setTimeout(() => {
      const blackPieces = board.map((p, i) => p === "black" ? i : null).filter(v => v !== null);
      let chosenMove = null;

      if (difficulty === "Ra") {
        // High IQ: Win > Safe House > Lead Piece > Avoid Water
        chosenMove = blackPieces.find(idx => idx + roll >= 30) ||
                     blackPieces.find(idx => idx + roll === 25) || 
                     blackPieces.reverse().find(idx => idx + roll < 30 && idx + roll !== 26);
      } else {
        chosenMove = blackPieces[Math.floor(Math.random() * blackPieces.length)];
      }

      if (chosenMove !== undefined && chosenMove !== null) {
        executeMove(chosenMove, chosenMove + roll);
      } else {
        finalizeTurn(board, borneOff);
      }
    }, 800);
  };

  const updateRemote = async (nb, nt, lt, nbo) => {
    if (!activeGameId) return;
    await supabase.from('senet_games').update({
      board_state: nb, turn: nt, last_throw: lt, borne_off: nbo
    }).eq('id', activeGameId);
  };

  // --- 4. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const specialIndices = [14, 25, 26, 27, 28, 29];
    const isSpecial = specialIndices.includes(idx);

    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
        width: "60px", height: "60px", border: "1px solid #555",
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundImage: isSpecial ? `url('/themes/sq${idx + 1}.png')` : `url('/themes/boardtexture.png')`,
        backgroundSize: "cover",
        backgroundColor: selectedSquare === idx ? "rgba(255, 204, 0, 0.5)" : "transparent",
        position: "relative", cursor: "pointer", transition: "0.2s"
      }}>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "48px", zIndex: 2 }} alt="Pyramid" />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "40px", zIndex: 2 }} alt="Figure" />}
      </div>
    );
  };

  const renderBoardGrid = () => {
    const rows = [];
    for (let r = 0; r < 3; r++) {
      let rowIndices = Array.from({ length: 10 }, (_, i) => r * 10 + i);
      if (r === 1) rowIndices.reverse(); // The S-Curve
      rows.push(...rowIndices.map(idx => renderSquare(idx)));
    }
    return rows;
  };

  // --- LOBBY VIEW ---
  if (view === "lobby") {
    return (
      <div style={{ padding: "80px", textAlign: "center", color: colors.gold, background: "#000", minHeight: "100vh" }}>
        <h2 style={{ letterSpacing: "5px" }}>𓉐 SENET LOBBY</h2>
        <div style={{ margin: "20px" }}>
          <p>YOUR IDENTITY</p>
          <select value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold" }}>
            <option value="Traveler">Choose Username...</option>
            {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
          </select>
        </div>
        <div style={{ margin: "20px" }}>
          <p>AI DIFFICULTY</p>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold" }}>
            <option value="Scribe">Scribe (Easy)</option>
            <option value="Pharaoh">Pharaoh (Normal)</option>
            <option value="Ra">Ra (Legendary)</option>
          </select>
        </div>
        <button onClick={() => { setGameMode("AI"); setView("game"); }} style={{ padding: "15px 30px", margin: "10px", background: colors.gold, fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "4px" }}>PLAY VS AI</button>
      </div>
    );
  }

  // --- GAME VIEW ---
  return (
    <div style={{ color: "#fff", textAlign: "center", padding: "20px", background: "#000", minHeight: "100vh" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px", textShadow: "0 0 10px gold" }}>TOMB OF SENET</h1>
      
      <div style={{ marginBottom: "20px" }}>
        <button onClick={() => setView("lobby")} style={{ background: "none", border: `1px solid ${colors.gold}`, color: colors.gold, padding: "5px 20px", borderRadius: "20px", cursor: "pointer" }}>
          {gameMode === "PvP" ? `ROOM: ${activeGameId}` : "BACK TO LOBBY"}
        </button>
      </div>

      <div style={{ height: "130px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "110px", filter: "drop-shadow(0 0 8px gold)" }} alt="Throw sticks" />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || (gameMode === "AI" && turn === "black")} style={{ padding: "12px 60px", background: colors.gold, border: "none", fontWeight: "bold", borderRadius: "50px", cursor: "pointer", fontSize: "16px", boxShadow: "0 0 15px rgba(255,204,0,0.4)" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "40px auto", width: "600px", 
        border: `10px solid ${colors.tombEdge}`, backgroundColor: "#1a1a1a",
        boxShadow: "0 0 50px rgba(0,0,0,1)"
      }}>
        {renderBoardGrid()}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "50px", color: colors.gold, fontWeight: "bold", fontSize: "18px" }}>
        <div>{username.toUpperCase()}: {borneOff.white}/5</div>
        <div>{gameMode === "AI" ? difficulty.toUpperCase() : "OPPONENT"}: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
