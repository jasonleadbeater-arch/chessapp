"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ treasury, player1 }) {
  // Game State
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white");
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [gameOver, setGameOver] = useState(null);

  // Theme Colors (Ancient Egyptian Gold & Obsidian)
  const colors = {
    sand: "#c2a371",
    darkSand: "#8b7355",
    gold: "#ffcc00",
    obsidian: "#1a1a1a",
    water: "#23faf4" // Matching your Moana cyan for the "Trap"
  };

  // Initialize board with 5 pieces each in alternating start positions
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // The "Casting Sticks" Logic
  const throwSticks = () => {
    setIsRolling(true);
    setTimeout(() => {
      // 4 sticks: each has 50% chance of being "flat" (1) or "round" (0)
      const results = Array.from({ length: 4 }, () => Math.round(Math.random()));
      const flatSides = results.reduce((a, b) => a + b, 0);
      
      // Senet Rules: 0 flats = 5, others = number of flats
      const score = flatSides === 0 ? 5 : flatSides;
      
      setLastThrow(score);
      setIsRolling(false);
    }, 600);
  };

  // Helper to render squares in the "S" pattern
  const renderSquare = (index) => {
    const squareNum = index + 1;
    let displayNum = squareNum;
    
    // Logic to visually reverse the middle row (11-20)
    if (squareNum > 10 && squareNum <= 20) {
      displayNum = 31 - squareNum; // This flips the visual order for the S-curve
    }

    const isSpecial = [15, 26, 27, 28, 29].includes(squareNum);

    return (
      <div 
        key={index}
        style={{
          width: "60px",
          height: "60px",
          border: `2px solid ${colors.darkSand}`,
          backgroundColor: squareNum === 27 ? colors.water : colors.obsidian,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          cursor: "pointer"
        }}
      >
        <span style={{ fontSize: "10px", color: colors.darkSand, position: "absolute", top: "2px", left: "2px" }}>
          {squareNum}
        </span>
        
        {/* Piece Rendering */}
        {board[index] === "white" && (
            <div style={{ width: "30px", height: "30px", borderRadius: "50% 50% 0 0", background: "white", border: "2px solid gold" }} />
        )}
        {board[index] === "black" && (
            <div style={{ width: "30px", height: "30px", borderRadius: "5px", background: "#444", border: "2px solid white" }} />
        )}

        {/* Special Square Labels */}
        {isSpecial && <span style={{ fontSize: "10px", color: colors.gold, fontWeight: "bold" }}>
            {squareNum === 15 ? "ANKH" : squareNum === 27 ? "TRAP" : "SAFE"}
        </span>}
      </div>
    );
  };

  return (
    <div style={{ padding: "20px", textAlign: "center", backgroundColor: "#000", color: "#fff", borderRadius: "20px", border: `4px solid ${colors.gold}` }}>
      <h2 style={{ color: colors.gold, letterSpacing: "2px" }}>ANCIENT SENET</h2>
      
      {/* Casting Sticks Area */}
      <div style={{ margin: "20px auto", padding: "15px", width: "200px", background: "#111", borderRadius: "10px", border: "1px solid #333" }}>
        <div style={{ fontSize: "24px", marginBottom: "10px" }}>
            {isRolling ? "???" : `THROW: ${lastThrow}`}
        </div>
        <button 
          onClick={throwSticks} 
          disabled={isRolling || lastThrow > 0}
          style={{ padding: "10px 20px", backgroundColor: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer" }}
        >
          THROW STICKS
        </button>
      </div>

      {/* The 3x10 Board Grid */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(10, 1fr)", 
        gridTemplateRows: "repeat(3, 1fr)",
        gap: "5px",
        margin: "0 auto",
        width: "650px",
        padding: "10px",
        background: colors.darkSand,
        borderRadius: "5px"
      }}>
        {/* Row 1 (1-10) */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {/* Row 2 (11-20) - We render 19 down to 10 to keep the S-curve visual */}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map((i) => renderSquare(i))}
        {/* Row 3 (21-30) */}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "20px", color: colors.gold }}>
        {turn.toUpperCase()}'S TURN TO MOVE
      </div>
    </div>
  );
}
