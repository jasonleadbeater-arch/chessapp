"use client";
import React, { useState, useEffect } from "react";

export default function SenetBoard({ player1 }) {
  // --- 1. GAME STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white");
  const [lastThrow, setLastThrow] = useState(0);
  const [sticks, setSticks] = useState([1, 1, 1, 1]); // 1 = flat (light), 0 = round (dark)
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Welcome to the afterlife. Throw the sticks!");

  const colors = {
    sand: "#c2a371",
    darkSand: "#8b7355",
    gold: "#ffcc00",
    obsidian: "#1a1a1a",
    water: "#23faf4",
    white: "#ffffff",
    black: "#333333"
  };

  // --- 2. INITIALIZATION ---
  // 5 pieces each, alternating on the first 10 squares
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // --- 3. CASTING STICKS LOGIC ---
  const throwSticks = () => {
    setIsRolling(true);
    setMessage("Tossing the sticks...");
    
    let intervals = 0;
    const timer = setInterval(() => {
      const randomSticks = Array.from({ length: 4 }, () => Math.round(Math.random()));
      setSticks(randomSticks);
      intervals++;

      if (intervals > 8) {
        clearInterval(timer);
        const flatSides = randomSticks.reduce((a, b) => a + b, 0);
        // Senet Rule: 0 flat sides = 5 points, otherwise = number of flat sides
        const score = flatSides === 0 ? 5 : flatSides;
        
        setLastThrow(score);
        setIsRolling(false);
        setMessage(`You threw a ${score}!`);
      }
    }, 80).toExponential;
  };

  // --- 4. MOVEMENT LOGIC ---
  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling) return;

    // Selection phase
    if (board[index] === turn) {
      setSelectedSquare(index);
      return;
    }

    // Move phase
    if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      
      // If user clicked the correct target, execute move
      if (index === targetIndex || (targetIndex >= 30 && index === 29)) {
        executeMove(selectedSquare, targetIndex);
      } else {
        setMessage(`You must move exactly ${lastThrow} spaces.`);
      }
    }
  };

  const executeMove = (from, to) => {
    let newBoard = [...board];

    // RULE: BEARING OFF (Winning pieces)
    if (to >= 30) {
      if (from < 20) {
        setMessage("You must reach the final row before exiting!");
        return;
      }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      
      if (newBorneOff[turn] === 5) {
        setMessage(`VICTORY! ${turn.toUpperCase()} has passed the test of Osiris.`);
        alert(`${turn.toUpperCase()} WINS!`);
        window.location.reload();
        return;
      }
      finalizeTurn(newBoard);
      return;
    }

    // RULE: HOUSE OF HAPPINESS (Square 26 / Index 25)
    // All pieces must land here and cannot jump over it.
    if (from < 25 && to > 25) {
      setMessage("Stop at the House of Happiness (Square 26)!");
      return;
    }

    const targetPiece = newBoard[to];

    // Cannot land on your own piece
    if (targetPiece === turn) {
      setMessage("Square is blocked by your own piece.");
      return;
    }

    // RULE: PROTECTION & SWAPPING
    if (targetPiece && targetPiece !== turn) {
      // Check for protection: 2+ pieces of the same color in a row
      const isProtected = (newBoard[to + 1] === targetPiece) || (newBoard[to - 1] === targetPiece);
      
      // Protection does NOT exist in the final 5 squares
      if (isProtected && to < 25) {
        setMessage("That piece is protected by a brother!");
        return;
      }
      
      // SWAP: Kicking the opponent back to your starting square
      newBoard[from] = targetPiece;
      newBoard[to] = turn;
    } else {
      // Simple Move
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // RULE: HOUSE OF WATER (Square 27 / Index 26)
    if (to === 26) {
      setMessage("Drowned! Returning to the House of Rebirth (Square 15).");
      newBoard[26] = null;
      if (!newBoard[14]) {
        newBoard[14] = turn;
      } else {
        // If 15 is blocked, start over
        newBoard[0] = turn;
      }
    }

    finalizeTurn(newBoard);
  };

  const finalizeTurn = (newBoard) => {
    setBoard(newBoard);
    setSelectedSquare(null);
    
    // Ancient Rule: Throwing 1, 4, or 5 gives an extra turn
    const extraTurn = [1, 4, 5].includes(lastThrow);
    setLastThrow(0);

    if (extraTurn) {
      setMessage(`A ${lastThrow} grants another throw!`);
    } else {
      setTurn(turn === "white" ? "black" : "white");
      setMessage(`${turn === "white" ? "Black" : "White"}'s turn.`);
    }
  };

  // --- 5. RENDER COMPONENTS ---
  const SticksDisplay = () => (
    <div style={{ display: "flex", gap: "10px", justifyContent: "center", margin: "15px 0" }}>
      {sticks.map((isFlat, i) => (
        <div key={i} style={{
          width: "12px", height: "70px",
          backgroundColor: isFlat ? "#f5f5dc" : "#3d2b1f",
          borderRadius: "8px", border: "2px solid #000",
          boxShadow: "2px 2px 5px rgba(0,0,0,0.4)",
          transition: "transform 0.1s",
          transform: isRolling ? `rotate(${Math.random() * 20 - 10}deg)` : "none"
        }} />
      ))}
    </div>
  );

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
          border: isSelected ? "3px solid gold" : `1px solid ${colors.darkSand}`,
          backgroundColor: isWater ? colors.water : colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          boxShadow: isSelected ? "0 0 15px gold" : "none"
        }}
      >
        <span style={{ position: "absolute", top: "2px", left: "2px", fontSize: "9px", color: colors.darkSand }}>{sqNum}</span>
        
        {board[idx] === "white" && <div style={{ width: "28px", height: "28px", borderRadius: "50% 50% 0 0", background: "#fff", border: "2px solid gold" }} />}
        {board[idx] === "black" && <div style={{ width: "30px", height: "18px", background: "#555", border: "2px solid #fff", borderRadius: "3px" }} />}
        
        {sqNum === 15 && <span style={{ fontSize: "8px", color: colors.gold, position: "absolute", bottom: "2px" }}>REBIRTH</span>}
        {sqNum === 26 && <span style={{ fontSize: "8px", color: colors.gold, position: "absolute", bottom: "2px" }}>HAPPY</span>}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#000", minHeight: "100vh", color: "#fff", padding: "20px", textAlign: "center", fontFamily: "Georgia, serif" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px", fontSize: "3.5rem", margin: "10px 0" }}>SENET</h1>
      <p style={{ color: "#aaa", fontSize: "1.2rem" }}>{message}</p>

      {/* Progress Tracker */}
      <div style={{ display: "flex", justifyContent: "center", gap: "60px", margin: "15px" }}>
        <div style={{ borderBottom: turn === "white" ? `4px solid white` : "none", padding: "5px" }}>
          WHITE SUCCESS: {borneOff.white} / 5
        </div>
        <div style={{ borderBottom: turn === "black" ? `4px solid ${colors.gold}` : "none", padding: "5px" }}>
          BLACK SUCCESS: {borneOff.black} / 5
        </div>
      </div>

      {/* Control Panel */}
      <div style={{ margin: "20px auto", padding: "15px", width: "280px", background: "#111", border: `2px solid ${colors.gold}`, borderRadius: "10px" }}>
        <SticksDisplay />
        <button 
          onClick={throwSticks} 
          disabled={isRolling || lastThrow > 0}
          style={{ 
            padding: "10px 25px", fontSize: "1rem", backgroundColor: lastThrow > 0 ? "#333" : colors.gold, 
            color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "4px" 
          }}
        >
          {isRolling ? "TOSSING..." : lastThrow > 0 ? `RESULT: ${lastThrow}` : "THROW STICKS"}
        </button>
      </div>

      {/* The S-Curve Grid Layout */}
      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "600px", 
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 40px rgba(0,0,0,0.8)" 
      }}>
        {/* Row 1 (Indices 0-9) */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {/* Row 2 (Indices 10-19 reversed visually) */}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {/* Row 3 (Indices 20-29) */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "30px" }}>
        <button onClick={() => window.location.reload()} style={{ background: "none", color: "#666", border: "1px solid #333", cursor: "pointer", padding: "5px 10px" }}>
          RESET GAME
        </button>
      </div>
    </div>
  );
}
