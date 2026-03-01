"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * THE TREASURE CHESS CLUB: SENET MODULE
 * Database Table: treasury | Primary Key: id | Piece Assets: /themes/
 */

export default function SenetBoard({ player1 }) {
  // --- 1. GAME STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); // Human starts as White (Cones)
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Welcome to the afterlife. Cast the sticks.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", // Transparent tint for the square images
  };

  // --- 2. INITIALIZATION (Alternating Start 1-10) ---
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
    setMessage("The sticks are tumbling...");
    
    let count = 0;
    const interval = setInterval(() => {
      // Visual shuffle for animation
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      
      if (count > 12) {
        clearInterval(interval);
        // Actual Senet Math: 4 sticks (0 flats = 5 points)
        const sticks = Array.from({ length: 4 }, () => Math.round(Math.random()));
        const flats = sticks.reduce((a, b) => a + b, 0);
        const finalScore = flats === 0 ? 5 : flats;
        
        setLastThrow(finalScore);
        setIsRolling(false);
        setMessage(`A throw of ${finalScore}!`);
      }
    }, 70);
  };

  // --- 4. MOVEMENT CORE ---
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
        setMessage(`Must move exactly ${lastThrow} steps.`);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    // RULE: BEARING OFF (Winning Pieces)
    if (to >= 30) {
      if (from < 20) {
        setMessage("Reach the final row before exiting!");
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

    // RULE: HOUSE OF HAPPINESS (Square 26) - Mandatory Stop
    if (from < 25 && to > 25) {
      setMessage("Stop! Land exactly on Square 26 first.");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; // Blocked by self

    // RULE: PROTECTION & ATTACK (Swapping)
    if (occupant && occupant !== turn) {
      // Pieces are protected if they have a neighbor of the same color
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      
      // Protection disabled in the final 5 squares
      if (isProtected && to < 25) {
        setMessage("That piece is protected!");
        return;
      }
      // SWAP Positions (The Attack)
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      // Standard Move
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // RULE: HOUSE OF WATER (Square 27) - The Trap
    if (to === 26) {
      setMessage("Drowned! Returning to Square 15 (Rebirth).");
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn;
      else newBoard[0] = turn; // If 15 is blocked, go back to start
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
      setMessage(`Extra turn! Throw again.`);
    }
  };

  // --- 5. TREASURY WIN HANDLER ---
  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      const prize = difficulty === "Pharaoh" ? 20 : 5;
      setMessage(`VICTORY! You passed into eternity.`);

      const { error } = await supabase.rpc('increment_coins', { 
        row_id: player1.id, 
        x: prize 
      });

      if (error) {
        console.error("RPC Error:", error.message);
        setMessage("Victory! But the Treasury is unreachable.");
      } else {
        setMessage(`Victory! ${prize} Gold added to your Treasury.`);
      }
    } else {
      setMessage("The Pharaoh claims this round. Try again.");
    }
  };

  // --- 6. PHARAOH AI HOOKS ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) {
        setTimeout(throwSticks, 1500);
      } else {
        const move = getAiMove();
        setTimeout(() => {
          if (move) executeMove(move.from, move.to);
          else {
            setMessage("Pharaoh is blocked. Your turn.");
            setTurn("white");
            setLastThrow(0);
          }
        }, 1200);
      }
    }
  }, [turn, lastThrow, isRolling]);

  const getAiMove = () => {
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
      if (a.to === 30) sA += 100;
      if (a.to === 25) sA += 50;
      if (a.to === 26) sA -= 60;
      if (b.to === 30) sB += 100;
      if (b.to === 25) sB += 50;
      if (b.to === 26) sB -= 60;
      return sB - sA;
    })[0];
  };

  // --- 7. UI RENDERERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');

    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.png)`,
          backgroundSize: "cover",
          backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          transition: "transform 0.2s"
        }}
      >
        <span style={{ position: "absolute", bottom: "2px", right: "2px", fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{num}</span>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#000", minHeight: "100vh", color: "#fff", textAlign: "center", padding: "20px", fontFamily: "serif" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px", fontSize: "3rem", margin: "10px 0" }}>𓋹 SENET 𓋹</h1>
      
      <div style={{ marginBottom: "20px" }}>
        {["Novice", "Pharaoh"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            margin: "0 5px", padding: "5px 15px", borderRadius: "20px", cursor: "pointer", border: `1px solid ${colors.gold}`,
            background: difficulty === lvl ? colors.gold : "transparent", color: difficulty === lvl ? "#000" : "#fff", fontWeight: "bold"
          }}>
            {lvl}
          </button>
        ))}
      </div>

      <button onClick={() => setShowRules(true)} style={{ background: "none", color: colors.darkSand, border: `1px solid ${colors.darkSand}`, padding: "5px 10px", borderRadius: "4px", cursor: "pointer", marginBottom: "15px" }}>📜 SCROLL OF RULES</button>

      <p style={{ color: colors.gold, minHeight: "24px", fontSize: "1.2rem" }}>{message}</p>

      {/* Result Image */}
      <div style={{ margin: "10px auto", height: "120px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && (
          <img src={`/themes/${lastThrow}.png`} alt={`Throw ${lastThrow}`} style={{ height: "100px", filter: isRolling ? "blur(4px)" : "none" }} />
        )}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black" || gameOver} style={{
        padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "5px", fontSize: "1.1rem", color: "#000"
      }}>
        {isRolling ? "TOSSING..." : "CAST STICKS"}
      </button>

      {/* Grid Container */}
      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "30px auto", width: "600px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 50px rgba(0,0,0,0.9)"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "50px", fontSize: "1.2rem", color: colors.gold }}>
        <div style={{ opacity: turn === "white" ? 1 : 0.3 }}>WHITE: {borneOff.white}/5</div>
        <div style={{ opacity: turn === "black" ? 1 : 0.3 }}>BLACK: {borneOff.black}/5</div>
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.95)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ backgroundColor: "#111", border: `2px solid ${colors.gold}`, padding: "40px", borderRadius: "10px", maxWidth: "500px", textAlign: "left" }}>
            <h2 style={{ color: colors.gold, textAlign: "center" }}>THE SACRED RULES</h2>
            <p><strong>Goal:</strong> First player to move all 5 pieces off the board wins.</p>
            <p><strong>Extra Turn:</strong> Throwing a 1, 4, or 5 grants another throw.</p>
            <p><strong>Swapping:</strong> Land on an opponent to swap positions, unless they are protected (2 pieces in a row).</p>
            <p><strong>Square 26 (Happiness):</strong> Mandatory stop for all souls.</p>
            <p><strong>Square 27 (Water):</strong> Landing here resets you to Square 15.</p>
            <button onClick={() => setShowRules(false)} style={{ width: "100%", padding: "10px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", marginTop: "20px" }}>RETURN TO GAME</button>
          </div>
        </div>
      )}

      <button onClick={() => window.location.reload()} style={{ marginTop: "50px", color: "#333", background: "none", border: "none", cursor: "pointer" }}>RESET BOARD</button>
    </div>
  );
}
