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
  const [message, setMessage] = useState("Enter the Tomb of Senet.");
  const [gameMode, setGameMode] = useState("AI"); 
  const [activeGameId, setActiveGameId] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [view, setView] = useState("game"); 
  const [gameOver, setGameOver] = useState(false);
  const [username, setUsername] = useState("Traveler");

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500"
  };

  // --- 2. INITIALIZATION ---
  useEffect(() => {
    // Ensure board has pieces on first mount
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);

    async function fetchUser() {
      if (!player1?.id) return;
      const { data } = await supabase.from("treasury").select("username").eq("id", player1.id).single();
      if (data?.username) setUsername(data.username);
    }
    fetchUser();
  }, [player1]);

  // Realtime Sync for PvP
  useEffect(() => {
    if (gameMode !== "PvP" || !activeGameId) return;
    const channel = supabase.channel(`game:${activeGameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'senet_games', filter: `id=eq.${activeGameId}` }, 
      (payload) => {
        const data = payload.new;
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
        setBorneOff(data.borne_off);
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeGameId, gameMode]);

  // --- 3. LOBBY & LOGGING ---
  const fetchOpenGames = async () => {
    const { data } = await supabase.from("senet_games").select("*").eq("status", "open");
    setAvailableGames(data || []);
  };

  const hostGame = async () => {
    const roomCode = Math.random().toString(36).substring(2, 7).toUpperCase();
    const { error } = await supabase.from("senet_games").insert([{
      id: roomCode,
      player_white: username,
      board_state: board,
      status: "open",
      turn: "white"
    }]);
    if (!error) {
      setActiveGameId(roomCode);
      setGameMode("PvP");
      setView("game");
    }
  };

  const logMove = async (from, to, piece) => {
    if (!activeGameId || gameMode !== "PvP") return;
    await supabase.from("senet_moves").insert([{
      game_id: activeGameId,
      player_id: player1?.id || username,
      move_from: from,
      move_to: to,
      piece_type: piece,
      throw_value: lastThrow
    }]);
  };

  // --- 4. GAMEPLAY LOGIC ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 10) {
        clearInterval(interval);
        const finalScore = [1, 2, 3, 4, 5][Math.floor(Math.random() * 5)];
        setLastThrow(finalScore);
        setIsRolling(false);
        if (gameMode === "PvP") updateRemote(board, turn, finalScore, borneOff);
      }
    }, 80);
  };

  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling) return;
    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } else if (selectedSquare !== null && idx === selectedSquare + lastThrow) {
      executeMove(selectedSquare, idx);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    // Bearing off (30+)
    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      await logMove(from, 30, piece);
      finalizeTurn(newBoard, newBorne);
      return;
    }

    // Capture/Swap
    const occupant = newBoard[to];
    newBoard[from] = occupant || null;
    newBoard[to] = turn;

    await logMove(from, to, piece);
    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (newBoard, newBorne) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    setBoard(newBoard);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextTurn);
    if (gameMode === "PvP") updateRemote(newBoard, nextTurn, 0, newBorne);
  };

  const updateRemote = async (nb, nt, lt, nbo) => {
    await supabase.from('senet_games').update({
      board_state: nb, turn: nt, last_throw: lt, borne_off: nbo
    }).eq('id', activeGameId);
  };

  // --- 5. RENDER ---
  if (view === "lobby") {
    return (
      <div style={{ padding: "100px", textAlign: "center", color: colors.gold }}>
        <h2>𓉐 SENET LOBBY</h2>
        <button onClick={hostGame} style={{ padding: "15px", background: colors.gold, border: "none", cursor: "pointer", fontWeight: "bold" }}>HOST PVP MATCH</button>
        <div style={{ margin: "20px" }}>
          <button onClick={fetchOpenGames} style={{ color: "#aaa", background: "none", border: "none", cursor: "pointer" }}>Refresh Open Games</button>
          {availableGames.map(g => (
            <div key={g.id} style={{ border: "1px solid #444", padding: "10px", margin: "10px auto", maxWidth: "300px" }}>
              <span>{g.player_white}'s Game</span>
              <button onClick={() => {setActiveGameId(g.id); setGameMode("PvP"); setView("game");}} style={{ marginLeft: "10px", color: colors.gold }}>JOIN</button>
            </div>
          ))}
        </div>
        <button onClick={() => setView("game")} style={{ background: "none", color: "#666", border: "none", cursor: "pointer" }}>Back to Board</button>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", padding: "20px" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "5px" }}>TOMB OF SENET</h1>
      <button onClick={() => { setView("lobby"); fetchOpenGames(); }} style={{ background: "none", border: `1px solid ${colors.gold}`, color: colors.gold, padding: "5px 15px", borderRadius: "20px", cursor: "pointer", marginBottom: "20px" }}>
        {gameMode === "PvP" ? `ROOM: ${activeGameId}` : "MULTIPLAYER LOBBY"}
      </button>

      <p style={{ color: colors.gold }}>{message}</p>
      
      <div style={{ height: "100px", display: "flex", justifyContent: "center", margin: "10px" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "80px" }} />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 40px", background: colors.gold, borderRadius: "50px", border: "none", fontWeight: "bold", cursor: "pointer" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "30px auto", width: "600px", border: `5px solid ${colors.darkSand}`, backgroundColor: "#000" }}>
        {board.map((cell, i) => (
          <div key={i} onClick={() => handleSquareClick(i)} style={{
            width: "60px", height: "60px", border: "1px solid #222", 
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: selectedSquare === i ? "inset 0 0 10px gold" : "none", cursor: "pointer"
          }}>
            {cell === "white" && <img src="/themes/white_piece.png" style={{ width: "40px" }} />}
            {cell === "black" && <img src="/themes/black_piece.png" style={{ width: "40px" }} />}
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "50px", color: colors.gold }}>
        <div>WHITE: {borneOff.white}/5</div>
        <div>BLACK: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
