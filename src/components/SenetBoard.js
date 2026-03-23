"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [gameMode, setGameMode] = useState("AI"); 
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [view, setView] = useState("game"); 
  const [users, setUsers] = useState([]);
  const [username, setUsername] = useState("Traveler");

  const colors = { gold: "#ffcc00", sand: "#c2b280", tombEdge: "#3d2b1f" };

  // --- INITIALIZATION ---
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

  // --- GAMEPLAY LOGIC ---
  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling || (gameMode === "AI" && turn === "black")) return;

    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } else if (selectedSquare !== null) {
      const target = selectedSquare + lastThrow;
      // Normal move or bearing off (last 3 squares)
      if (idx === target || (target >= 30 && idx === 29)) {
        executeMove(selectedSquare, target);
      }
    }
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    // 1. BEARING OFF (Winning pieces)
    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      finalizeTurn(newBoard, newBorne);
      return;
    }

    // 2. THE HOUSE OF WATER (Square 27 / Index 26) 
    // Note: Senet boards are 1-indexed in history, but 0-indexed in code.
    // If you land on Index 26 (The 27th Square), you drown.
    if (to === 26) {
      newBoard[from] = null;
      // Return to House of Rebirth (Index 14) or start (Index 0) if blocked
      const rebirthIndex = newBoard[14] === null ? 14 : 0;
      newBoard[rebirthIndex] = turn;
      finalizeTurn(newBoard, borneOff);
      return;
    }

    // 3. NORMAL MOVE / ATTACK (Swapping)
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

    if (gameMode === "AI" && nextTurn === "black") {
      const delay = difficulty === "Ra" ? 400 : 1200;
      setTimeout(aiTurn, delay);
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
      }
    }, 70);
  };

  // --- AI LOGIC (RA) ---
  const aiTurn = () => {
    const roll = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
    setLastThrow(roll);
    
    const moveDelay = difficulty === "Ra" ? 300 : 800;

    setTimeout(() => {
      const blackPieces = board.map((p, i) => p === "black" ? i : null).filter(v => v !== null);
      let chosenMove = null;

      if (difficulty === "Ra") {
        chosenMove = blackPieces.find(idx => idx + roll >= 30) ||
                     blackPieces.find(idx => idx + roll === 25) || // Try to land on "Good" House
                     blackPieces.reverse().find(idx => idx + roll < 30 && idx + roll !== 26); // Avoid water
      } else {
        chosenMove = blackPieces[Math.floor(Math.random() * blackPieces.length)];
      }

      if (chosenMove !== undefined) {
        executeMove(chosenMove, chosenMove + roll);
      } else {
        // Skip turn if no moves possible
        finalizeTurn(board, borneOff);
      }
    }, moveDelay);
  };

  // --- RENDER ---
  const renderSquare = (idx) => {
    // Mapping your files: sq15, sq26, sq27, sq28, sq29, sq30
    const themedSquares = [14, 25, 26, 27, 28, 29]; 
    const isThemed = themedSquares.includes(idx);
    const themeImg = `/themes/sq${idx + 1}.png`;

    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
        width: "60px", height: "60px", border: "1px solid #444",
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundImage: isThemed ? `url(${themeImg})` : `url('/themes/boardtexture.png')`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundColor: selectedSquare === idx ? "rgba(255, 204, 0, 0.4)" : "transparent",
        position: "relative", cursor: "pointer"
      }}>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} alt="White" />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "35px", zIndex: 2 }} alt="Black" />}
      </div>
    );
  };

  // Helper to handle S-Curve rendering
  const renderBoardRows = () => {
    const rows = [];
    for (let r = 0; r < 3; r++) {
      let rowIndices = Array.from({ length: 10 }, (_, i) => r * 10 + i);
      // Reverse middle row for S-Curve path
      if (r === 1) rowIndices.reverse();
      rows.push(...rowIndices.map(idx => renderSquare(idx)));
    }
    return rows;
  };

  if (view === "lobby") {
    return (
      <div style={{ textAlign: "center", color: colors.gold, paddingTop: "100px", background: "#000", minHeight: "100vh" }}>
        <h2 style={{ letterSpacing: "5px" }}>𓉐 SENET LOBBY</h2>
        <div style={{ margin: "20px" }}>
          <p style={{ fontSize: "12px", opacity: 0.7 }}>SELECT YOUR IDENTITY</p>
          <select value={username} onChange={(e) => setUsername(e.target.value)} style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold", borderRadius: "4px" }}>
            <option value="Traveler">Choose Username...</option>
            {users.map(u => <option key={u.username} value={u.username}>{u.username}</option>)}
          </select>
        </div>
        <div style={{ margin: "20px" }}>
          <p style={{ fontSize: "12px", opacity: 0.7 }}>CHALLENGE A DEITY</p>
          <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} style={{ padding: "10px", background: "#111", color: colors.gold, border: "1px solid gold", borderRadius: "4px" }}>
            <option value="Scribe">Scribe (Easy)</option>
            <option value="Pharaoh">Pharaoh (Normal)</option>
            <option value="Ra">Ra (Legendary)</option>
          </select>
        </div>
        <button onClick={() => setView("game")} style={{ padding: "15px 40px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "4px", marginTop: "20px" }}>
          ENTER THE TOMB
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: "#000", minHeight: "100vh", color: "#fff", textAlign: "center", padding: "20px" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px", textShadow: "0 0 10px rgba(255,204,0,0.5)" }}>TOMB OF SENET</h1>
      <button onClick={() => setView("lobby")} style={{ background: "none", border: `1px solid ${colors.gold}`, color: colors.gold, padding: "5px 15px", borderRadius: "20px", cursor: "pointer", marginBottom: "10px" }}>
        LOBBY
      </button>

      <div style={{ height: "140px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "110px", filter: "drop-shadow(0 0 5px gold)" }} alt="Throw sticks" />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 50px", background: colors.gold, borderRadius: "50px", border: "none", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 15px rgba(255,204,0,0.3)" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "40px auto", width: "600px", 
        border: `10px solid ${colors.tombEdge}`, backgroundColor: "#111", 
        boxShadow: "0 0 50px rgba(0,0,0,1)"
      }}>
        {renderBoardRows()}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "60px", color: colors.gold, fontWeight: "bold", fontSize: "18px" }}>
        <div>{username.toUpperCase()}: {borneOff.white}/5</div>
        <div>{difficulty.toUpperCase()}: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
