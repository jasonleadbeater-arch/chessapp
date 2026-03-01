"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1, onGameEnd }) {
  // Game State
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white");
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Throw the sticks to begin!");

  const colors = {
    sand: "#c2a371",
    darkSand: "#8b7355",
    gold: "#ffcc00",
    obsidian: "#1a1a1a",
    water: "#23faf4",
    white: "#ffffff",
    black: "#444444"
  };

  // Initialize: 5 pieces each, alternating on the first 10 squares
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // 1. Casting Sticks Logic (The "Dice")
  const throwSticks = () => {
    setIsRolling(true);
    setMessage("Tossing the sticks...");
    setTimeout(() => {
      const results = Array.from({ length: 4 }, () => Math.round(Math.random()));
      const flatSides = results.reduce((a, b) => a + b, 0);
      const score = flatSides === 0 ? 5 : flatSides;
      
      setLastThrow(score);
      setIsRolling(false);
      setMessage(`You threw a ${score}! Move a piece.`);
    }, 600);
  };

  // 2. Movement Logic
  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling) return;

    // Select a piece
    if (board[index] === turn) {
      setSelectedSquare(index);
      return;
    }

    // If already selected, try to move to this target
    if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      
      // Check if user clicked the correct target index
      if (index === targetIndex || (targetIndex >= 30 && index === 29)) {
        executeMove(selectedSquare, targetIndex);
      }
    }
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];
    const piece = turn;

    // RULE: Bearing Off (Winning pieces)
    if (to >= 30) {
      if (from < 20) {
        setMessage("Reach the final row before exiting!");
        return;
      }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      checkWin(newBorneOff);
      finalizeTurn(newBoard);
      return;
    }

    // RULE: House of Happiness (Square 26 / Index 25)
    // You MUST land here and cannot jump over it.
    if (from < 25 && to > 25) {
      setMessage("Stop at the House of Happiness first!");
      return;
    }

    // RULE: Protection & Swapping
    const occupant = newBoard[to];
    if (occupant === turn) {
      setMessage("Square occupied by your own piece!");
      return;
    }

    if (occupant && occupant !== turn) {
      // Check for protection (2+ pieces in a row)
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      // Final 5 squares (26-30) offer NO protection
      if (isProtected && to < 25) {
        setMessage("Opponent is protected by a brother!");
        return;
      }
      // SWAP: Senet's unique attack
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      // Normal move
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // RULE: House of Water (Square 27 / Index 26)
    if (to === 26) {
      setMessage("Drowned! Returning to Rebirth (Square 15).");
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn;
      else newBoard[0] = turn; // Fallback to start if 15 is blocked
    }

    finalizeTurn(newBoard);
  };

  const finalizeTurn = (newBoard) => {
    setBoard(newBoard);
    setSelectedSquare(null);
    
    // Ancient Rule: Throwing 1, 4, or 5 grants an extra turn
    const extraTurn = [1, 4, 5].includes(lastThrow);
    setLastThrow(0);

    if (extraTurn) {
      setMessage(`Extra turn! Throw again.`);
    } else {
      setTurn(turn === "white" ? "black" : "white");
      setMessage(`${turn === "white" ? "Black" : "White"}'s turn.`);
    }
  };

  const checkWin = (scores) => {
    if (scores.white === 5 || scores.black === 5) {
      const winner = scores.white === 5 ? "White" : "Black";
      alert(`${winner} has entered the Fields of Iaru! Victory!`);
      window.location.reload(); 
    }
  };

  // 3. Render Helpers (S-Curve Path)
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const sqNum = idx + 1;
    const isWater = sqNum === 27;

    return (
      <div 
        key={idx}
        onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid #fff" : `1px solid ${colors.darkSand}`,
          backgroundColor: isWater ? colors.water : colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          boxShadow: isSelected ? "inset 0 0 15px #fff" : "none"
        }}
      >
        <span style={{ position: "absolute", top: "2px", left: "2px", fontSize: "10px", color: colors.darkSand }}>{sqNum}</span>
        
        {board[idx] === "white" && <div style={{ width: "30px", height: "30px", borderRadius: "50% 50% 0 0", background: "#fff", border: "2px solid gold" }} />}
        {board[idx] === "black" && <div style={{ width: "32px", height: "20px", background: colors.black, border: "2px solid #fff", borderRadius: "4px" }} />}
        
        {sqNum === 15 && <span style={{ fontSize: "9px", color: colors.gold, position: "absolute", bottom: "2px" }}>REBIRTH</span>}
        {sqNum === 26 && <span style={{ fontSize: "9px", color: colors.gold, position: "absolute", bottom: "2px" }}>HAPPY</span>}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#000", minHeight: "100vh", color: "#fff", padding: "40px", textAlign: "center", fontFamily: "serif" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "5px", fontSize: "3rem" }}>SENET</h1>
      <p style={{ color: colors.gold }}>{message}</p>

      {/* Progress Tracker */}
      <div style={{ display: "flex", justifyContent: "center", gap: "50px", margin: "20px" }}>
        <div style={{ borderBottom: turn === "white" ? `3px solid #fff` : "none", padding: "10px" }}>
          WHITE SUCCESS: {borneOff.white} / 5
        </div>
        <div style={{ borderBottom: turn === "black" ? `3px solid ${colors.gold}` : "none", padding: "10px" }}>
          BLACK SUCCESS: {borneOff.black} / 5
        </div>
      </div>

      {/* Casting Sticks UI */}
      <div style={{ marginBottom: "30px" }}>
        <button 
          onClick={throwSticks} 
          disabled={isRolling || lastThrow > 0}
          style={{ 
            padding: "15px 30px", fontSize: "1.2rem", backgroundColor: lastThrow > 0 ? "#333" : colors.gold, 
            color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "5px" 
          }}
        >
          {isRolling ? "TOSSING..." : lastThrow > 0 ? `MOVES: ${lastThrow}` : "THROW STICKS"}
        </button>
      </div>

      {/* The 3x10 S-Curve Board */}
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "600px", border: `10px solid ${colors.darkSand}`, boxShadow: "0 0 30px rgba(194, 163, 113, 0.3)" }}>
        {/* Row 1: 1-10 */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {/* Row 2: 11-20 (Reversed for S-curve) */}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {/* Row 3: 21-30 */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <button onClick={() => window.location.reload()} style={{ marginTop: "40px", background: "none", border: "1px solid #444", color: "#444", cursor: "pointer" }}>QUIT TO LOBBY</button>
    </div>
  );
}
