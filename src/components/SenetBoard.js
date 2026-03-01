"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The sticks await your command.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [raGlow, setRaGlow] = useState(null);

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 2. INITIALIZATION ---
  const initializeGame = () => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
    setTurn("white");
    setLastThrow(0);
    setBorneOff({ white: 0, black: 0 });
    setGameOver(false);
    setMessage("Board reset. May the gods be with you.");
    setSelectedSquare(null);
    setRaGlow(null);
  };

  useEffect(() => {
    initializeGame();
  }, []);

  // --- 3. CASTING STICKS ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    setMessage("Casting the sticks...");
    
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      
      if (count > 12) {
        clearInterval(interval);
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
    } else if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      if (index === targetIndex) {
        executeMove(selectedSquare, targetIndex);
      }
    }
  };

  const handleAfterlifeExit = () => {
    if (selectedSquare === null || lastThrow === 0) return;
    const targetIndex = selectedSquare + lastThrow;
    if (targetIndex >= 30) {
      executeMove(selectedSquare, targetIndex);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    if (to >= 30) {
      if (from < 20) {
        setMessage("Complete the first rows first!");
        return;
      }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
      } else {
        finalizeTurn(newBoard);
      }
      return;
    }

    if (from < 25 && to > 25) {
      setMessage("Stop at Square 26 exactly!");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; 

    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) {
        setMessage("Protected by a neighbor!");
        return;
      }
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    if (to === 26) {
      setMessage("Drowned! Reset to 15.");
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
    if (!extraTurn) setTurn(turn === "white" ? "black" : "white");
    else setMessage("Extra turn granted!");
  };

  // --- 5. TREASURY PAYOUT ---
  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      let prize = difficulty === "Scribe" ? 5 : (difficulty === "Pharaoh" ? 20 : 50);
      setMessage(`VICTORY! You enter the afterlife.`);
      await supabase.rpc('increment_coins', { row_id: player1.id, x: prize });
    } else {
      setMessage(`${difficulty} has triumphed.`);
    }
  };

  // --- 6. AI LOGIC ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1500);
      else {
        const move = getAiMove();
        setTimeout(() => {
          if (move) {
            if (difficulty === "Ra") { setRaGlow(move.to); setTimeout(() => setRaGlow(null), 800); }
            executeMove(move.from, move.to);
          } else { setTurn("white"); setLastThrow(0); }
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
    return moves.sort((a, b) => b.to - a.to)[0];
  };

  // --- 7. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const isRaActive = raGlow === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    const ext = (num === 28) ? 'jpeg' : 'png';

    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : isRaActive ? "3px solid #ff4500" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.${ext})`,
          backgroundSize: "cover",
          backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          boxShadow: isRaActive ? "0 0 25px #ff4500" : "none",
          zIndex: isRaActive ? 10 : 1
        }}
      >
        <span style={{ position: "absolute", bottom: "2px", right: "2px", fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{num}</span>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  const canExit = selectedSquare !== null && (selectedSquare + lastThrow >= 30) && selectedSquare >= 20;

  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      
      {/* Top Controls */}
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", alignItems: "center" }}>
        <button onClick={() => setShowRules(true)} style={{ background: "none", color: colors.darkSand, border: `1px solid ${colors.darkSand}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>
          📜 SCROLLS
        </button>
        {["Scribe", "Pharaoh", "Ra"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            padding: "5px 15px", borderRadius: "20px", cursor: "pointer", border: `1px solid ${lvl === "Ra" ? colors.raOrange : colors.gold}`,
            background: difficulty === lvl ? (lvl === "Ra" ? colors.raOrange : colors.gold) : "transparent", color: difficulty === lvl ? "#000" : "#fff", fontWeight: "bold", fontSize: "12px"
          }}>{lvl}</button>
        ))}
      </div>

      <p style={{ color: difficulty === "Ra" ? colors.raOrange : colors.gold, minHeight: "24px" }}>{message}</p>

      <div style={{ margin: "10px auto", height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} alt="Throw" style={{ height: "90px" }} />}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginBottom: "20px", height: "50px" }}>
        <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black" || gameOver} style={{
          padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000"
        }}>
          {isRolling ? "TOSSING..." : "CAST STICKS"}
        </button>

        {canExit && (
          <button onClick={handleAfterlifeExit} style={{
            padding: "12px 35px", background: "linear-gradient(to right, #ffcc00, #ff4500)", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000", boxShadow: "0 0 15px gold"
          }}>
            𓂀 AFTERLIFE
          </button>
        )}
      </div>

      {/* Grid */}
      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "624px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 50px rgba(0,0,0,0.8)", borderRadius: "8px"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      {/* Status Footer */}
      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "50px", color: colors.gold }}>
          <div>WHITE: {borneOff.white}/5</div>
          <div>{difficulty.toUpperCase()}: {borneOff.black}/5</div>
        </div>
        <button onClick={initializeGame} style={{ color: colors.darkSand, background: "none", border: "1px dotted #8b7355", padding: "5px 15px", cursor: "pointer", marginTop: "15px", borderRadius: "4px", fontSize: "11px" }}>RESET JOURNEY</button>
      </div>

      {/* --- PAPYRUS RULES MODAL --- */}
      {showRules && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ 
            backgroundColor: colors.papyrus, 
            backgroundImage: "url('https://www.transparenttextures.com/patterns/papyros.png')", // Papyrus texture
            color: "#4a3b2a", 
            padding: "35px", 
            borderRadius: "5px", 
            maxWidth: "500px", 
            textAlign: "left", 
            boxShadow: "0 0 40px rgba(0,0,0,0.5)",
            border: "2px solid #8b7355",
            fontFamily: "'Courier New', Courier, monospace"
          }}>
            <h2 style={{ textAlign: "center", borderBottom: "1px solid #8b7355", paddingBottom: "10px", marginTop: 0 }}>𓁹 THE SCROLLS OF SENET 𓁹</h2>
            <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
              <p><strong>1. THE PATH:</strong> Move your pieces in an 'S' shape from Square 1 to 30.</p>
              <p><strong>2. PROTECTION:</strong> Two pieces of the same color side-by-side cannot be attacked/swapped by the opponent.</p>
              <p><strong>3. THE TRAPS:</strong> 
                <br/>• <strong>Sq 26 (Happiness):</strong> You must land here before moving forward.
                <br/>• <strong>Sq 27 (Water):</strong> Landing here resets you to Square 15 (Rebirth).
              </p>
              <p><strong>4. THE AFTERLIFE:</strong> To win, all 5 pieces must exit the board. From Square 30, you need a roll of 1. When eligible, use the 𓂀 <strong>AFTERLIFE</strong> button.</p>
              <p><strong>5. EXTRA TURNS:</strong> Throws of 1, 4, or 5 grant another cast of the sticks.</p>
            </div>
            <button onClick={() => setShowRules(false)} style={{ width: "100%", padding: "12px", background: "#8b7355", color: "#fff", border: "none", fontWeight: "bold", cursor: "pointer", marginTop: "20px" }}>RETURN TO TOMB</button>
          </div>
        </div>
      )}
    </div>
  );
}
