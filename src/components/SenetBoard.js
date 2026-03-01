"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

/**
 * THE TREASURE CHESS CLUB: SENET MODULE - RA EDITION
 * Difficulty: Scribe, Pharaoh, Ra (God-Mode)
 * Features: Solar Flare Effect, Treasury Integration, Exit Logic
 */

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
  const [raGlow, setRaGlow] = useState(null); // Divine effect state

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500"
  };

  // --- 2. INITIALIZATION / RESET ---
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
      return;
    }

    if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      // Allow clicking the piece itself on square 30 to exit if throw is 1
      const isExiting = targetIndex >= 30 && index === selectedSquare;
      
      if (index === targetIndex || isExiting) {
        executeMove(selectedSquare, targetIndex);
      } else {
        setMessage(`Move exactly ${lastThrow} spaces.`);
      }
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    // EXIT LOGIC
    if (to >= 30) {
      if (from < 20) {
        setMessage("Complete the second row first!");
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

    // HOUSE OF HAPPINESS (26)
    if (from < 25 && to > 25) {
      setMessage("Land on Square 26 exactly first.");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; 

    // ATTACK / PROTECTION
    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) {
        setMessage("Piece is protected by a neighbor!");
        return;
      }
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // WATER TRAP (27)
    if (to === 26) {
      setMessage("Drowned! Returning to Square 15.");
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
      setMessage(`A sacred throw! Extra turn.`);
    }
  };

  // --- 5. TREASURY PAYOUT ---
  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      let prize = 5;
      if (difficulty === "Pharaoh") prize = 20;
      if (difficulty === "Ra") prize = 50;

      const { error } = await supabase.rpc('increment_coins', { 
        row_id: player1.id, 
        x: prize 
      });

      if (error) setMessage("Victory! Treasury failed.");
      else setMessage(`Victory! ${prize} Gold awarded by the gods.`);
    } else {
      setMessage(`${difficulty} has claimed your soul.`);
    }
  };

  // --- 6. AI LOGIC (SCRIBE, PHARAOH, RA) ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) {
        setTimeout(throwSticks, 1500);
      } else {
        const move = getAiMove();
        setTimeout(() => {
          if (move) {
            if (difficulty === "Ra") {
              setRaGlow(move.to);
              setTimeout(() => setRaGlow(null), 800);
            }
            executeMove(move.from, move.to);
          } else {
            setTurn("white");
            setLastThrow(0);
            setMessage(`${difficulty} is blocked.`);
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

    if (difficulty === "Scribe") return moves[Math.floor(Math.random() * moves.length)];
    
    return moves.sort((a, b) => {
      let scoreA = a.to;
      let scoreB = b.to;
      if (difficulty === "Ra") {
        if (board[a.to] === "white") scoreA += 100;
        if (board[b.to] === "white") scoreB += 100;
      }
      if (a.to === 30) scoreA += 200;
      if (b.to === 30) scoreB += 200;
      return scoreB - scoreA;
    })[0];
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
          transition: "all 0.3s ease",
          zIndex: isRaActive ? 10 : 1
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
      
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", alignItems: "center" }}>
        <button onClick={() => setShowRules(true)} style={{ background: "none", color: colors.darkSand, border: `1px solid ${colors.darkSand}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>📜 SCROLLS</button>
        {["Scribe", "Pharaoh", "Ra"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            padding: "5px 15px", borderRadius: "20px", cursor: "pointer", border: `1px solid ${lvl === "Ra" ? colors.raOrange : colors.gold}`,
            background: difficulty === lvl ? (lvl === "Ra" ? colors.raOrange : colors.gold) : "transparent", color: difficulty === lvl ? "#000" : "#fff", fontWeight: "bold", fontSize: "12px"
          }}>{lvl}</button>
        ))}
      </div>

      <p style={{ color: difficulty === "Ra" ? colors.raOrange : colors.gold, minHeight: "24px", fontSize: "1.1rem" }}>{message}</p>

      <div style={{ margin: "10px auto", height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} alt={`Throw ${lastThrow}`} style={{ height: "90px", filter: isRolling ? "blur(4px)" : "none" }} />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black" || gameOver} style={{
        padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", fontSize: "1rem", color: "#000", boxShadow: "0 4px 15px rgba(255,204,0,0.3)"
      }}>{isRolling ? "TOSSING..." : "CAST STICKS"}</button>

      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "30px auto", width: "624px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 50px rgba(0,0,0,0.8)", borderRadius: "8px"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "15px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "50px", fontSize: "1.1rem", color: colors.gold }}>
          <div>WHITE: {borneOff.white}/5</div>
          <div>{difficulty.toUpperCase()}: {borneOff.black}/5</div>
        </div>
        
        <button onClick={initializeGame} style={{ color: colors.darkSand, background: "none", border: `1px dotted ${colors.darkSand}`, padding: "5px 15px", cursor: "pointer", borderRadius: "4px", fontSize: "12px" }}>
          RESET JOURNEY
        </button>
      </div>

      {showRules && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.9)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "center" }}>
          <div style={{ backgroundColor: "#111", border: `2px solid ${colors.gold}`, padding: "30px", borderRadius: "15px", maxWidth: "450px", textAlign: "left" }}>
            <h2 style={{ color: colors.gold, textAlign: "center", marginTop: 0 }}>THE SACRED RULES</h2>
            <p>• <strong>The Path:</strong> Move in an 'S' shape. To exit, reach square 30 and throw a 1.</p>
            <p>• <strong>Bearing Off:</strong> When on Square 30, click the piece again with a roll of 1 to finish.</p>
            <p>• <strong>Protection:</strong> Two pieces in a row cannot be attacked (swapped).</p>
            <p>• <strong>Ra Mode:</strong> The divine AI prioritized attacks and solar flares upon moving.</p>
            <button onClick={() => setShowRules(false)} style={{ width: "100%", padding: "12px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", marginTop: "15px", borderRadius: "5px" }}>CLOSE</button>
          </div>
        </div>
      )}
    </div>
  );
}
