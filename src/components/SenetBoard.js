"use client";
import React, { useState, useEffect } from "react";

export default function SenetBoard({ player1 }) {
  // --- 1. STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white");
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The journey begins. Throw the sticks.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameOver, setGameOver] = useState(false);

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", // Transparent to show board texture
  };

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
  }, []);

  // --- 3. ANIMATED CASTING STICKS ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    setMessage("The sticks are cast...");
    
    // Quick shuffle animation
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalScore = Math.floor(Math.random() * 5) + 1;
        setLastThrow(finalScore);
        setIsRolling(false);
        setMessage(`You threw a ${finalScore}!`);
      }
    }, 80);
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

  const executeMove = (from, to) => {
    let newBoard = [...board];
    if (to >= 30) {
      if (from < 20) return setMessage("Finish the rows first!");
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        setMessage(`${turn.toUpperCase()} HAS PASSED INTO ETERNITY!`);
        return;
      }
      finalizeTurn(newBoard);
      return;
    }

    if (from < 25 && to > 25) return setMessage("Stop at Square 26!");

    const occupant = newBoard[to];
    if (occupant === turn) return;

    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) return setMessage("Piece is protected!");
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    if (to === 26) {
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

  // --- 5. AI HOOKS ---
  useEffect(() => {
    if (turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1200);
      else {
        // AI Logic would go here (same as previous script)
        setTurn("white"); // Placeholder for demo
        setLastThrow(0);
      }
    }
  }, [turn, lastThrow, isRolling]);

  // --- 6. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');

    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : `1px solid rgba(139, 115, 85, 0.3)`,
          backgroundImage: `url(/themes/sq${paddedNum}.png)`,
          backgroundSize: "cover",
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          backgroundColor: colors.obsidian // Tint to unify images
        }}
      >
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  return (
    <div style={{ backgroundColor: "#000", minHeight: "100vh", color: "#fff", textAlign: "center", padding: "20px", fontFamily: "serif" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "10px" }}>SENET</h1>
      
      {/* Stick Display using 1.png - 5.png */}
      <div style={{ margin: "20px auto", height: "120px" }}>
        {lastThrow > 0 && (
          <img 
            src={`/themes/${lastThrow}.png`} 
            alt={`Throw ${lastThrow}`} 
            style={{ height: "100px", filter: isRolling ? "blur(2px)" : "none" }} 
          />
        )}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || turn === "black"} style={{
        padding: "10px 25px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "5px"
      }}>
        {isRolling ? "TOSSING..." : "THROW STICKS"}
      </button>

      {/* Main Board Container with boardtexture.png */}
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(10, 60px)", 
        margin: "30px auto", 
        width: "600px", 
        padding: "10px",
        backgroundImage: "url(/themes/boardtexture.png)",
        backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`,
        boxShadow: "0 0 50px rgba(0,0,0,0.9)"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <p style={{ color: colors.gold }}>{message}</p>
    </div>
  );
}
