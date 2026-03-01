"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * THE TREASURE CHESS CLUB: SENET MODULE
 * Integrated with Arcade page.tsx
 * Table: treasury | PK: id | Assets: /themes/
 */

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); // Human player
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The sticks await your command.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
  };

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // --- 3. CASTING STICKS ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    setMessage("Casting the cedar sticks...");
    
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      
      if (count > 12) {
        clearInterval(interval);
        // Senet Math: 4 sticks (0 flats = 5, else count flats)
        const sticks = Array.from({ length: 4 }, () => Math.round(Math.random()));
        const flats = sticks.reduce((a, b) => a + b, 0);
        const finalScore = flats === 0 ? 5 : flats;
        
        setLastThrow(finalScore);
        setIsRolling(false);
        setMessage(`You threw a ${finalScore}!`);
      }
    }, 70);
  };

  // --- 4. MOVEMENT LOGIC ---
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
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    // RULE: EXITING (BEARING OFF)
    if (to >= 30) {
      if (from < 20) {
        setMessage("Finish the first two rows first!");
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

    // RULE: HOUSE OF HAPPINESS (26)
    if (from < 25 && to > 25) {
      setMessage("Stop at Square 26 first!");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; 

    // RULE: PROTECTION & SWAPPING
    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) {
        setMessage("Piece is protected!");
        return;
      }
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // RULE: WATER TRAP (27)
    if (to === 26) {
      setMessage("Drowned! Back to Rebirth (15).");
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
      setMessage(`Extra turn!`);
    }
  };

  // --- 5. TREASURY PAYOUT ---
  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      const prize = difficulty === "Pharaoh" ? 20 : 5;
      setMessage(`VICTORY! You passed into eternity.`);

      const { error } = await supabase.rpc('increment_coins', { 
        row_id: player1.id, 
        x: prize 
      });

      if (error) setMessage("Victory! Treasury connection failed.");
      else setMessage(`Victory! ${prize} Gold added to your Treasury.`);
    } else {
      setMessage("The Pharaoh claims this round.");
    }
  };

  // --- 6. AI LOGIC ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1500);
      else {
        const move = getAiMove();
        setTimeout(() => {
          if (move) executeMove(move.from, move.to);
          else {
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
    return moves.sort((a, b) => b.to - a.to)[0]; // Basic aggressive AI
  };

  // --- 7. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    const ext = (num === 28) ? 'jpeg' : 'png';

    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.${ext})`,
          backgroundSize: "cover",
          backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
        }}
      >
        <span style={{ position: "absolute", bottom: "2px", right: "2px", fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{num}</span>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      
      {/* Controls */}
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", alignItems: "center" }}>
        <button onClick={() => setShowRules(true)} style={{ background: "none", color: colors.darkSand, border: `1px solid ${colors.darkSand}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>📜 RULES</button>
        {["Novice", "Pharaoh"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            padding: "5px 15px", borderRadius: "20px", cursor: "pointer", border: `1px solid ${colors.gold}`,
            background: difficulty === lvl ? colors.gold : "transparent", color: difficulty === lvl ? "#000" : "#fff", fontWeight: "bold", fontSize: "12px"
          }}>{lvl}</button>
        ))}
      </div>

      <p style={{ color: colors.gold, minHeight: "24px", fontSize: "1.1rem" }}>{message}</p>

      {/* Throw Display */}
      <div style={{ margin: "10px auto", height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} alt={`Throw ${lastThrow}`} style={{ height: "90px", filter: isRolling ? "blur(4px)" : "none" }} />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black" || gameOver} style={{
        padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", fontSize: "1rem", color: "#000"
      }}>{isRolling ? "TOSSING..." : "CAST STICKS"}</button>

      {/* Grid */}
      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "30px auto", width: "624px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 50px rgba(0,0,0,0.8)", borderRadius: "8px"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "50px", fontSize: "1.1rem", color: colors.gold }}>
        <div>WHITE: {borneOff.white}/5</div>
        <div>PHARAOH: {borneOff.black}/5</div>
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.9)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ backgroundColor: "#111", border: `2px solid ${colors.gold}`, padding: "30px", borderRadius: "15px", maxWidth: "450px", textAlign: "left" }}>
            <h2 style={{ color: colors.gold, textAlign: "center", marginTop: 0 }}>THE SACRED RULES</h2>
            <p>• Move in an 'S' shape. Two same-color pieces side-by-side are protected.</p>
            <p>• Square 26: Must land here exactly.</p>
            <p>• Square 27: Reset to Square 15.</p>
            <button onClick={() => setShowRules(false)} style={{ width: "100%", padding: "12px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", marginTop: "15px", borderRadius: "5px" }}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
