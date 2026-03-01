"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * THE TREASURE CHESS CLUB: SENET MODULE
 * Table: treasury | Primary Key: id | User: username
 */

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); // Human is White
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Welcome to the Treasury. Cast the sticks.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameOver, setGameOver] = useState(false);

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.5)", // Tint to blend with boardtexture.png
  };

  // --- 2. INITIALIZATION (Alternating Start) ---
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // --- 3. CASTING STICKS LOGIC ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    setMessage("Casting the cedar sticks...");
    
    let count = 0;
    const interval = setInterval(() => {
      // Visual shuffle of stick images
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      
      if (count > 12) {
        clearInterval(interval);
        // Senet Logic: 4 sticks (0 flats = 5, else 1-4)
        const sticks = Array.from({ length: 4 }, () => Math.round(Math.random()));
        const flats = sticks.reduce((a, b) => a + b, 0);
        const finalScore = flats === 0 ? 5 : flats;
        
        setLastThrow(finalScore);
        setIsRolling(false);
        setMessage(`You threw a ${finalScore}!`);
      }
    }, 80);
  };

  // --- 4. MOVEMENT RULES ---
  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling || turn === "black" || gameOver) return;

    if (board[index] === turn) {
      setSelectedSquare(index);
      return;
    }

    if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      // Handle normal move or bearing off (Square 30)
      if (index === targetIndex || (targetIndex >= 30 && index === 29)) {
        executeMove(selectedSquare, targetIndex);
      } else {
        setMessage(`Invalid move. Target is square ${targetIndex + 1}.`);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    // RULE: BEARING OFF
    if (to >= 30) {
      if (from < 20) {
        setMessage("You must reach the final row before exiting.");
        return;
      }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
        return;
      }
      finalizeTurn(newBoard);
      return;
    }

    // RULE: HOUSE OF HAPPINESS (Square 26) - Mandatory land
    if (from < 25 && to > 25) {
      setMessage("Souls must stop at the House of Happiness (26)!");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return;

    // RULE: PROTECTION & SWAPPING
    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      // Final 5 squares (26-30) have NO protection
      if (isProtected && to < 25) {
        setMessage("Opponent is protected by a teammate!");
        return;
      }
      // Swap (Attack)
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // RULE: HOUSE OF WATER (Square 27)
    if (to === 26) {
      setMessage("Drowned! Returning to Rebirth (Square 15).");
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn;
      else newBoard[0] = turn;
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
      setMessage(`A ${lastThrow} grants you another throw!`);
    }
  };

  // --- 5. TREASURY PAYOUT ---
  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      const prize = difficulty === "Pharaoh" ? 20 : 5;
      setMessage(`VICTORY! ${winner.toUpperCase()} has passed the test.`);

      const { error } = await supabase.rpc('increment_coins', { 
        row_id: player1.id, 
        x: prize 
      });

      if (error) {
        console.error("Treasury Error:", error);
        setMessage("Victory! But the Treasury is locked.");
      } else {
        setMessage(`Victory! ${prize} Gold added to your Treasury.`);
      }
    } else {
      setMessage("The Pharaoh has claimed your soul. Game Over.");
    }
  };

  // --- 6. PHARAOH AI ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) {
        setTimeout(throwSticks, 1500);
      } else {
        const move = getAiDecision();
        setTimeout(() => {
          if (move) executeMove(move.from, move.to);
          else {
            setMessage("Pharaoh passes. Your turn.");
            setTurn("white");
            setLastThrow(0);
          }
        }, 1200);
      }
    }
  }, [turn, lastThrow, isRolling]);

  const getAiDecision = () => {
    const moves = [];
    board.forEach((p, i) => {
      if (p === "black") {
        const target = i + lastThrow;
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

    return moves.sort((a, b) => {
      let sA = a.to, sB = b.to;
      if (a.to === 30) sA += 100; // Finish
      if (a.to === 25) sA += 50;  // Happy House
      if (a.to === 26) sA -= 60;  // Water Trap
      if (b.to === 30) sB += 100;
      if (b.to === 25) sB += 50;
      if (b.to === 26) sB -= 60;
      return sB - sA;
    })[0];
  };

  // --- 7. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');

    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid white" : `1px solid rgba(139, 115, 85, 0.4)`,
          backgroundImage: `url(/themes/sq${paddedNum}.png)`,
          backgroundSize: "cover",
          backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          transition: "0.2s"
        }}
      >
        <span style={{ position: "absolute", top: "2px", left: "2px", fontSize: "9px", color: "rgba(255,255,255,0.4)" }}>{num}</span>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#000", minHeight: "100vh", color: "#fff", textAlign: "center", padding: "20px" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px", fontSize: "2.5rem" }}>𓋹 SENET 𓋹</h1>
      
      {/* Opponent Selection */}
      <div style={{ marginBottom: "20px" }}>
        {["Novice", "Pharaoh"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            margin: "0 5px", padding: "5px 15px", borderRadius: "20px", cursor: "pointer", border: `1px solid ${colors.gold}`,
            background: difficulty === lvl ? colors.gold : "transparent", color: difficulty === lvl ? "#000" : "#fff"
          }}>
            {lvl}
          </button>
        ))}
      </div>

      <p style={{ color: colors.gold, minHeight: "24px" }}>{message}</p>

      {/* Result Image (1.png - 5.png) */}
      <div style={{ margin: "10px auto", height: "110px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && (
          <img src={`/themes/${lastThrow}.png`} alt={`Throw ${lastThrow}`} style={{ height: "100px", filter: isRolling ? "blur(3px)" : "none" }} />
        )}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black" || gameOver} style={{
        padding: "10px 30px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "5px", fontSize: "1rem"
      }}>
        {isRolling ? "TOSSING..." : "THROW STICKS"}
      </button>

      {/* Main Board Grid with boardtexture.png */}
      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "30px auto", width: "600px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 40px rgba(0,0,0,0.9)"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "40px", fontSize: "1.1rem" }}>
        <div style={{ opacity: turn === "white" ? 1 : 0.4 }}>WHITE EXIT: {borneOff.white}/5</div>
        <div style={{ opacity: turn === "black" ? 1 : 0.4, color: colors.gold }}>BLACK EXIT: {borneOff.black}/5</div>
      </div>

      <button onClick={() => window.location.reload()} style={{ marginTop: "40px", color: "#555", background: "none", border: "none", cursor: "pointer" }}>QUIT JOURNEY</button>
    </div>
  );
}
