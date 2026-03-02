"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. LOBBY & PLAYER STATE ---
  const [gameId, setGameId] = useState(null);
  const [myColor, setMyColor] = useState("white"); // 'white' or 'black'
  const [isJoined, setIsJoined] = useState(false);
  const [inputRoom, setInputRoom] = useState("");
  const [username, setUsername] = useState(player1?.email?.split('@')[0] || "Traveler");

  // --- 2. GAME STATE ---
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

  const borneOffRef = useRef({ white: 0, black: 0 });

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 3. LOBBY LOGIC ---
  const hostGame = async () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null);
    
    const { error } = await supabase.from('senet_games').insert([{ 
      id: newRoomId, 
      player_white: username,
      board_state: initialBoard,
      turn: 'white',
      borne_off: { white: 0, black: 0 }
    }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setGameMode("PvP");
      setIsJoined(true);
    }
  };

  const joinGame = async () => {
    const { data, error } = await supabase.from('senet_games').select('*').eq('id', inputRoom.toUpperCase()).single();
    if (data) {
      await supabase.from('senet_games').update({ player_black: username }).eq('id', data.id);
      setGameId(data.id);
      setMyColor("black");
      setGameMode("PvP");
      setIsJoined(true);
    } else {
      alert("Room not found.");
    }
  };

  // --- 4. CORE GAME LOGIC ---
  const initializeGame = () => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) initialBoard[i] = i % 2 === 0 ? "white" : "black";
    setBoard(initialBoard);
    setTurn("white");
    setLastThrow(0);
    setBorneOff({ white: 0, black: 0 });
    borneOffRef.current = { white: 0, black: 0 };
    setGameOver(false);
    setMessage("Board reset. May the gods be with you.");
  };

  useEffect(() => {
    if (gameMode === "AI") initializeGame();
  }, [gameMode]);

  // Realtime Sync
  useEffect(() => {
    if (!isJoined || gameMode !== "PvP") return;
    const channel = supabase.channel(`game:${gameId}`).on('postgres_changes', 
      { event: 'UPDATE', schema: 'public', table: 'senet_games', filter: `id=eq.${gameId}` }, 
      (payload) => {
        const data = payload.new;
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
        if (data.borne_off) {
          setBorneOff(data.borne_off);
          borneOffRef.current = data.borne_off;
        }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isJoined, gameMode, gameId]);

  const updateRemoteGame = async (newBoard, nextTurn, score, currentBorneOff) => {
    if (gameMode !== "PvP") return;
    await supabase.from('senet_games').update({
      board_state: newBoard, turn: nextTurn, last_throw: score, borne_off: currentBorneOff
    }).eq('id', gameId);
  };

  const throwSticks = () => {
    if (gameOver || isRolling) return;
    if (gameMode === "PvP" && turn !== myColor) return; 

    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 12) {
        clearInterval(interval);
        const finalScore = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
        setLastThrow(finalScore);
        setIsRolling(false);
        if (gameMode === "PvP") updateRemoteGame(board, turn, finalScore, borneOff);
      }
    }, 70);
  };

  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling || gameOver) return;
    if (gameMode === "PvP" && turn !== myColor) return;
    if (gameMode === "AI" && turn === "black") return;

    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } else if (selectedSquare !== null) {
      const target = selectedSquare + lastThrow;
      if (idx === target) executeMove(selectedSquare, target);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    if (to >= 30) {
      if (from < 20) { setMessage("Finish the first rows!"); return; }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      borneOffRef.current = newBorneOff;
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
        if (gameMode === "PvP") updateRemoteGame(newBoard, turn, 0, newBorneOff);
      } else finalizeTurn(newBoard, newBorneOff);
      return;
    }

    if (from < 25 && to > 25 && to !== 26) { setMessage("Stop at Square 26!"); return; }

    const occupant = newBoard[to];
    if (occupant === turn) return; 
    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to+1] === occupant) || (newBoard[to-1] === occupant);
      if (isProtected && to < 25) { setMessage("Protected!"); return; }
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    if (to === 26) {
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn; else newBoard[0] = turn;
    }
    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (nb, cbo) => {
    const extra = [1, 4, 5].includes(lastThrow);
    const nextT = extra ? turn : (turn === "white" ? "black" : "white");
    setBoard(nb);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextT);
    if (gameMode === "PvP") updateRemoteGame(nb, nextT, 0, cbo);
  };

  const handleWin = async (winner) => {
    setMessage(`VICTORY! ${winner.toUpperCase()} enters the Afterlife.`);
    if (winner === "white" && player1?.id) {
      await supabase.rpc('increment_coins', { row_id: player1.id, x: 20 });
    }
  };

  // AI Logic
  useEffect(() => {
    if (gameMode === "AI" && turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1200);
      else {
        const moves = [];
        board.forEach((p, i) => {
          if (p === "black") {
            const target = i + lastThrow;
            if (target < 30 && board[target] !== "black") moves.push({ from: i, to: target });
            else if (i >= 20 && target >= 30) moves.push({ from: i, to: 30 });
          }
        });
        const move = moves.sort((a,b) => b.to - a.to)[0];
        setTimeout(() => move ? executeMove(move.from, move.to) : setTurn("white"), 1000);
      }
    }
  }, [turn, lastThrow, isRolling, gameMode]);

  // --- 5. RENDERING ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const padded = num.toString().padStart(2, '0');
    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
        width: "60px", height: "60px", border: isSelected ? "3px solid gold" : "1px solid rgba(255,255,255,0.1)",
        backgroundImage: `url(/themes/sq${padded}.${num === 28 ? 'jpeg' : 'png'})`,
        backgroundSize: "cover", backgroundColor: colors.obsidian, display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer"
      }}>
        {board[idx] && <img src={`/themes/${board[idx]}_piece.png`} style={{ width: "45px" }} />}
      </div>
    );
  };

  if (!isJoined) {
    return (
      <div style={{ padding: "40px", background: "#111", borderRadius: "15px", border: "1px solid #ffcc00", maxWidth: "400px", margin: "0 auto" }}>
        <h3 style={{ color: "#ffcc00" }}>USER: {username}</h3>
        <button onClick={() => { setGameMode("AI"); setIsJoined(true); }} style={{ width: "100%", padding: "10px", marginBottom: "10px", background: "#ffcc00", color: "#000", fontWeight: "bold" }}>PLAY VS PHARAOH (AI)</button>
        <div style={{ borderTop: "1px solid #333", margin: "20px 0", paddingTop: "20px" }}>
          <button onClick={hostGame} style={{ width: "100%", padding: "10px", marginBottom: "10px", background: "none", color: "#ffcc00", border: "1px solid #ffcc00" }}>HOST PvP MATCH</button>
          <input type="text" placeholder="ROOM CODE" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)} style={{ width: "100%", padding: "10px", background: "#000", color: "#fff", border: "1px solid #333", marginBottom: "10px" }} />
          <button onClick={joinGame} style={{ width: "100%", padding: "10px", background: "#333", color: "#fff" }}>JOIN PvP MATCH</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ textAlign: "center", color: "#fff" }}>
      <p style={{ color: colors.gold }}>{message} {gameMode === "PvP" && `(ROOM: ${gameId})`}</p>
      <div style={{ display: "flex", justifyContent: "center", gap: "20px", margin: "20px" }}>
        <button onClick={throwSticks} disabled={lastThrow > 0 || (gameMode === "PvP" && turn !== myColor)} style={{ padding: "10px 30px", background: colors.gold, fontWeight: "bold" }}>CAST STICKS</button>
        {selectedSquare !== null && selectedSquare + lastThrow >= 30 && <button onClick={handleAfterlifeExit} style={{ padding: "10px 30px", background: "orange" }}>𓂀 AFTERLIFE</button>}
      </div>
      <div style={{ margin: "20px auto", height: "80px" }}>{lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "100%" }} />}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "600px", border: "8px solid #8b7355" }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>
      <div style={{ marginTop: "20px", color: colors.gold }}>
        WHITE: {borneOff.white}/5 | BLACK: {borneOff.black}/5
      </div>
    </div>
  );
}
