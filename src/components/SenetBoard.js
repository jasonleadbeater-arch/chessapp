"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [isJoined, setIsJoined] = useState(false);
  const [username, setUsername] = useState("");
  const [treasury, setTreasury] = useState([]);
  const [gameId, setGameId] = useState("default-room");
  
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The sticks await your command.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameMode, setGameMode] = useState("AI"); 
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

  // --- 2. INITIALIZATION & TREASURY FETCH ---
  useEffect(() => {
    async function fetchTreasury() {
      const { data } = await supabase.from("treasury").select("username");
      if (data) setTreasury(data);
    }
    fetchTreasury();
    initializeGame();
  }, []);

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

  // --- 3. LOBBY HANDLERS ---
  const handleStartGame = (e) => {
    e.preventDefault();
    if (!username) return alert("Identify yourself, Traveler.");
    setIsJoined(true);
    if (gameMode === "AI") initializeGame();
  };

  // --- 4. PvP SYNC LOGIC ---
  useEffect(() => {
    if (gameMode !== "PvP" || !isJoined) return;
    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', schema: 'public', table: 'senet_games', filter: `id=eq.${gameId}` 
      }, (payload) => {
        const data = payload.new;
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameMode, gameId, isJoined]);

  const updateRemoteGame = async (newBoard, nextTurn, score) => {
    if (gameMode !== "PvP") return;
    await supabase.from('senet_games').update({
      board_state: newBoard, turn: nextTurn, last_throw: score
    }).eq('id', gameId);
  };

  // --- 5. GAMEPLAY LOGIC (ORIGINAL & UNTOUCHED) ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    if (gameMode === "PvP" && turn === "black") return; 

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
        if (gameMode === "PvP") updateRemoteGame(board, turn, finalScore);
      }
    }, 70);
  };

  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling || gameOver) return;
    if (gameMode === "PvP" && turn === "black") return; 
    if (gameMode === "AI" && turn === "black") return;
    if (board[index] === turn) {
      setSelectedSquare(index);
    } else if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      if (index === targetIndex) executeMove(selectedSquare, targetIndex);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    if (to >= 30) {
      if (from < 20) { setMessage("Complete the first rows first!"); return; }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      if (newBorneOff[turn] === 5) { setGameOver(true); handleWin(turn); }
      else finalizeTurn(newBoard);
      return;
    }
    if (from < 25 && to > 25) { setMessage("Stop at Square 26 exactly!"); return; }
    const occupant = newBoard[to];
    if (occupant === turn) return; 
    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) { setMessage("Protected by a neighbor!"); return; }
      newBoard[from] = occupant; newBoard[to] = turn;
    } else {
      newBoard[from] = null; newBoard[to] = turn;
    }
    if (to === 26) {
      setMessage("Drowned! Reset to 15."); newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn; else newBoard[0] = turn;
    }
    finalizeTurn(newBoard);
  };

  const finalizeTurn = (newBoard) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    setBoard(newBoard); setSelectedSquare(null); setLastThrow(0); setTurn(nextTurn);
    if (extraTurn) setMessage("Extra turn granted!");
    if (gameMode === "PvP") updateRemoteGame(newBoard, nextTurn, 0);
  };

  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      let prize = difficulty === "Scribe" ? 5 : (difficulty === "Pharaoh" ? 20 : 50);
      setMessage(`VICTORY! You enter the afterlife.`);
      await supabase.rpc('increment_coins', { row_id: player1.id, x: prize });
    }
  };

  // --- 6. AI LOGIC ---
  useEffect(() => {
    if (gameMode === "AI" && turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1500);
      else {
        const moves = [];
        board.forEach((p, i) => {
          if (p === "black") {
            const target = i + lastThrow;
            if (target < 30 && board[target] !== "black") {
                const prot = (board[target+1] === "white") || (board[target-1] === "white");
                if (!(board[target] === "white" && prot && target < 25) && !(i < 25 && target > 25)) moves.push({ from: i, to: target });
            } else if (i >= 20 && target >= 30) moves.push({ from: i, to: 30 });
          }
        });
        const move = moves.sort((a, b) => b.to - a.to)[0];
        setTimeout(() => {
          if (move) {
            if (difficulty === "Ra") { setRaGlow(move.to); setTimeout(() => setRaGlow(null), 800); }
            executeMove(move.from, move.to);
          } else { setTurn("white"); setLastThrow(0); }
        }, 1200);
      }
    }
  }, [turn, lastThrow, isRolling, gameMode]);

  // --- 7. RENDERING ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const isRaActive = raGlow === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    const ext = (num === 28) ? 'jpeg' : 'png';

    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : isRaActive ? "3px solid #ff4500" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.${ext})`, backgroundSize: "cover",
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer",
          boxShadow: isRaActive ? "0 0 25px #ff4500" : "none", zIndex: isRaActive ? 10 : 1
        }}>
        <span style={{ position: "absolute", bottom: "2px", right: "2px", fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{num}</span>
        {board[idx] && <img src={`/themes/${board[idx]}_piece.png`} style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  // --- LOBBY VIEW ---
  if (!isJoined) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <img src="/iconBackgroundRemoved.png" alt="Logo" style={{ width: "120px", marginBottom: "10px" }} />
        <h1 style={{ fontSize: "3rem", color: colors.gold, letterSpacing: "4px", margin: "0" }}>THE TREASURE SENET CLUB</h1>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "40px", flexWrap: "wrap", margin: "40px 0" }}>
          <img src="/Sorcerer.png" alt="Sorcerer" style={{ width: "250px", height: "auto" }} />
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${colors.gold}`, width: "400px" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("AI")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "AI" ? colors.gold : "#333", fontWeight: "bold", border: "none", cursor: "pointer" }}>VS AI</button>
                <button onClick={() => setGameMode("PvP")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "PvP" ? colors.gold : "#333", fontWeight: "bold", border: "none", cursor: "pointer" }}>VS PLAYER</button>
              </div>
              <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input 
                  placeholder="Your Name" value={username} onChange={(e) => setUsername(e.target.value)} 
                  style={{ padding: "12px", borderRadius: "5px", border: "none" }} list="treasury-names" required 
                />
                <datalist id="treasury-names">
                  {treasury.map((user, idx) => ( <option key={idx} value={user.username} /> ))}
                </datalist>
                <button type="submit" style={{ padding: "15px", backgroundColor: colors.gold, fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "5px" }}>ENTER TOMB</button>
              </form>
          </div>
        </div>
      </div>
    );
  }

  // --- BOARD VIEW ---
  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", alignItems: "center" }}>
        <button onClick={() => setIsJoined(false)} style={{ background: colors.obsidian, color: colors.gold, border: `1px solid ${colors.gold}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>← LOBBY</button>
        <button onClick={() => setShowRules(true)} style={{ background: "none", color: colors.darkSand, border: `1px solid ${colors.darkSand}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>📜 SCROLLS</button>
        {gameMode === "AI" && ["Scribe", "Pharaoh", "Ra"].map(lvl => (
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
        <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || gameOver} style={{
          padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000"
        }}>{isRolling ? "TOSSING..." : "CAST STICKS"}</button>
        {(selectedSquare !== null && selectedSquare + lastThrow >= 30 && selectedSquare >= 20) && (
          <button onClick={() => executeMove(selectedSquare, 30)} style={{ padding: "12px 35px", background: "linear-gradient(to right, #ffcc00, #ff4500)", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000", boxShadow: "0 0 15px gold" }}>𓂀 AFTERLIFE</button>
        )}
      </div>

      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "624px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 50px rgba(0,0,0,0.8)", borderRadius: "8px"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "50px", color: colors.gold }}>
          <div>{username.toUpperCase()}: {borneOff.white}/5</div>
          <div>{gameMode === "AI" ? difficulty.toUpperCase() : "OPPONENT"}: {borneOff.black}/5</div>
        </div>
      </div>
    </div>
  );
}
