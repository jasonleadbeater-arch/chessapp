"use client";
import React, { useState, useEffect } from "react";

/**
 * THE TREASURE CHESS CLUB: SENET MODULE
 * Logic: Ancient Egyptian Race Game (3500 BC)
 * Features: S-Curve Grid, Animated Sticks, Swapping, Bearing Off, and Pharaoh AI.
 */

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); // White (Cones) starts traditionally
  const [lastThrow, setLastThrow] = useState(0);
  const [sticks, setSticks] = useState([1, 1, 1, 1]); // 1 = light side, 0 = dark side
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Throw the sticks to begin your journey.");
  const [difficulty, setDifficulty] = useState("Pharaoh"); // Novice or Pharaoh
  const [gameOver, setGameOver] = useState(false);

  const colors = {
    sand: "#c2a371",
    darkSand: "#8b7355",
    gold: "#ffcc00",
    obsidian: "#111111",
    water: "#23faf4",
    white: "#ffffff",
    black: "#333333"
  };

  // --- 2. INITIALIZATION (The First 10 Squares) ---
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // --- 3. CASTING STICKS ANIMATION ---
  const throwSticks = () => {
    if (gameOver) return;
    setIsRolling(true);
    setMessage("Tossing the cedar sticks...");
    
    let intervals = 0;
    const timer = setInterval(() => {
      const randomSticks = Array.from({ length: 4 }, () => Math.round(Math.random()));
      setSticks(randomSticks);
      intervals++;

      if (intervals > 10) {
        clearInterval(timer);
        const flatSides = randomSticks.reduce((a, b) => a + b, 0);
        // Rule: 0 flat sides = 5 points, otherwise = number of flat sides
        const score = flatSides === 0 ? 5 : flatSides;
        
        setLastThrow(score);
        setIsRolling(false);
        setMessage(`Throw Result: ${score}`);
      }
    }, 70);
  };

  // --- 4. MOVEMENT LOGIC & RULES ---
  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling || turn === "black" || gameOver) return;

    if (board[index] === turn) {
      setSelectedSquare(index);
      return;
    }

    if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      if (index === targetIndex || (targetIndex >= 30 && index === 29)) {
        executeMove(selectedSquare, targetIndex);
      } else {
        setMessage(`Invalid move. You threw a ${lastThrow}.`);
      }
    }
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];

    // RULE: BEARING OFF (Exiting Square 30)
    if (to >= 30) {
      if (from < 20) {
        setMessage("You must reach the final row before exiting!");
        return;
      }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        setMessage(`${turn.toUpperCase()} WINS! They have reached the Fields of Iaru.`);
        return;
      }
      finalizeTurn(newBoard);
      return;
    }

    // RULE: HOUSE OF HAPPINESS (Square 26 / Index 25)
    // Mandatory stop. Cannot jump over Square 26.
    if (from < 25 && to > 25) {
      setMessage("Stop! All pieces must land on Square 26.");
      return;
    }

    const occupant = newBoard[to];

    // Cannot land on own piece
    if (occupant === turn) {
      setMessage("Your own piece blocks the way.");
      return;
    }

    // RULE: PROTECTION & SWAPPING (Attack)
    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      // Final 5 squares (26-30) have NO protection
      if (isProtected && to < 25) {
        setMessage("That piece is protected by a brother!");
        return;
      }
      // SWAP POSITIONS
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      // Normal movement
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // RULE: HOUSE OF WATER (Square 27 / Index 26)
    if (to === 26) {
      setMessage("Drowned! Returning to the House of Rebirth (15).");
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn;
      else newBoard[0] = turn; // Fallback to start
    }

    finalizeTurn(newBoard);
  };

  const finalizeTurn = (newBoard) => {
    setBoard(newBoard);
    setSelectedSquare(null);
    const extraTurn = [1, 4, 5].includes(lastThrow);
    setLastThrow(0);

    if (!extraTurn) {
      setTurn(turn === "white" ? "black" : "white");
    } else {
      setMessage(`A throw of ${lastThrow} grants another turn!`);
    }
  };

  // --- 5. PHARAOH AI LOGIC ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) {
        setTimeout(throwSticks, 1200);
      } else {
        const move = getAiDecision();
        setTimeout(() => {
          if (move) {
            executeMove(move.from, move.to);
          } else {
            setMessage("Pharaoh has no legal moves.");
            setTurn("white");
            setLastThrow(0);
          }
        }, 1000);
      }
    }
  }, [turn, lastThrow, isRolling]);

  const getAiDecision = () => {
    const moves = [];
    board.forEach((p, i) => {
      if (p === "black") {
        const target = i + lastThrow;
        // Basic Validity check for AI
        if (target < 30) {
          const occ = board[target];
          const prot = (board[target+1] === "white") || (board[target-1] === "white");
          if (occ !== "black" && !(occ === "white" && prot && target < 25)) {
            if (!(i < 25 && target > 25)) moves.push({ from: i, to: target });
          }
        } else if (i >= 20) moves.push({ from: i, to: 30 });
      }
    });

    if (moves.length === 0) return null;
    if (difficulty === "Novice") return moves[Math.floor(Math.random() * moves.length)];

    // Pharaoh (Strategic) logic
    return moves.sort((a, b) => {
      let sA = a.to, sB = b.to;
      if (a.to === 30) sA += 100;
      if (a.to === 25) sA += 50;
      if (a.to === 26) sA -= 60; // Penalty for water
      if (b.to === 30) sB += 100;
      if (b.to === 25) sB += 50;
      if (b.to === 26) sB -= 60;
      return sB - sA;
    })[0];
  };

  // --- 6. RENDER COMPONENTS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid white" : `1px solid ${colors.darkSand}`,
          backgroundColor: num === 27 ? colors.water : colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer"
        }}
      >
        <span style={{ position: "absolute", top: "2px", left: "2px", fontSize: "9px", color: colors.darkSand }}>{num}</span>
        {board[idx] === "white" && <div style={{ width: "26px", height: "30px", background: "#fff", clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)", border: "1px solid gold" }} />}
        {board[idx] === "black" && <div style={{ width: "26px", height: "20px", background: "#444", borderRadius: "3px", border: "1px solid white" }} />}
        {num === 15 && <span style={{ fontSize: "8px", color: colors.gold, position: "absolute", bottom: "2px" }}>REBIRTH</span>}
        {num === 26 && <span style={{ fontSize: "8px", color: colors.gold, position: "absolute", bottom: "2px" }}>HAPPY</span>}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#000", minHeight: "100vh", color: "#fff", textAlign: "center", padding: "20px" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "10px", margin: "10px" }}>𓋹 SENET 𓋹</h1>
      
      {/* Difficulty Selector */}
      <div style={{ marginBottom: "20px" }}>
        {["Novice", "Pharaoh"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            margin: "0 5px", padding: "5px 15px", borderRadius: "20px", cursor: "pointer",
            background: difficulty === lvl ? colors.gold : "#222", color: difficulty === lvl ? "#000" : "#fff"
          }}>
            {lvl}
          </button>
        ))}
      </div>

      <p style={{ color: colors.gold }}>{message}</p>

      {/* Progress */}
      <div style={{ display: "flex", justifyContent: "center", gap: "40px", marginBottom: "20px" }}>
        <div style={{ opacity: turn === "white" ? 1 : 0.4 }}>WHITE EXITED: {borneOff.white}/5</div>
        <div style={{ opacity: turn === "black" ? 1 : 0.4, color: colors.gold }}>BLACK EXITED: {borneOff.black}/5</div>
      </div>

      {/* Sticks UI */}
      <div style={{ display: "flex", gap: "10px", justifyContent: "center", margin: "20px" }}>
        {sticks.map((s, i) => (
          <div key={i} style={{ 
            width: "12px", height: "60px", background: s ? "#eee" : "#333", border: "1px solid #555",
            borderRadius: "4px", transform: isRolling ? `translateY(${Math.random()*10}px)` : "none"
          }} />
        ))}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black"} style={{
        padding: "10px 25px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer"
      }}>
        {isRolling ? "TOSSING..." : lastThrow > 0 ? `MOVE: ${lastThrow}` : "THROW STICKS"}
      </button>

      {/* Board */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "30px auto", width: "600px", border: `5px solid ${colors.darkSand}` }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <button onClick={() => window.location.reload()} style={{ color: "#444", background: "none", border: "none", cursor: "pointer" }}>RESET GAME</button>
    </div>
  );
}
