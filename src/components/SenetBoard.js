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
  const [gameMode, setGameMode] = useState("AI"); // Defaults to AI
  const [activeGameId, setActiveGameId] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [view, setView] = useState("game"); // "game" or "lobby"
  const [gameOver, setGameOver] = useState(false);
  const [username, setUsername] = useState("𓋴𓈖𓏏");

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 2. INITIALIZATION & SYNC ---
  useEffect(() => {
    async function fetchUser() {
      if (!player1?.id) return;
      const { data } = await supabase.from("treasury").select("username").eq("id", player1.id).single();
      if (data?.username) setUsername(data.username);
    }
    fetchUser();
    initializeGame();
  }, [player1]);

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
    setSelectedSquare(null);
  };

  // Realtime Lobby Sync
  useEffect(() => {
    if (view !== "lobby") return;
    const fetchGames = async () => {
      const { data } = await supabase.from("senet_games").select("*").eq("status", "open");
      setAvailableGames(data || []);
    };
    fetchGames();
    const channel = supabase.channel('lobby').on('postgres_changes', { event: '*', schema: 'public', table: 'senet_games' }, fetchGames).subscribe();
    return () => supabase.removeChannel(channel);
  }, [view]);

  // Realtime Game Sync
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

  // --- 3. PVP LOGIC ---
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

  const joinGame = async (gameId) => {
    const { error } = await supabase.from("senet_games").update({
      player_black: username,
      status: "active"
    }).eq("id", gameId);
    if (!error) {
      setActiveGameId(gameId);
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

  const updateRemote = async (newBoard, nextTurn, score, newBorne) => {
    if (gameMode !== "PvP" || !activeGameId) return;
    await supabase.from('senet_games').update({
      board_state: newBoard,
      turn: nextTurn,
      last_throw: score,
      borne_off: newBorne || borneOff
    }).eq('id', activeGameId);
  };

  // --- 4. CORE GAMEPLAY ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
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
        if (gameMode === "PvP") updateRemote(board, turn, finalScore);
      }
    }, 70);
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    if (to >= 30) {
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      await logMove(from, 30, piece);
      if (newBorne[turn] === 5) setGameOver(true);
      else finalizeTurn(newBoard, newBorne);
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return;
    newBoard[from] = occupant || null;
    newBoard[to] = turn;

    await logMove(from, to, piece);
    finalizeTurn(newBoard);
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

  // --- 5. RENDER ---
  if (view === "lobby") {
    return (
      <div style={{ padding: "50px", textAlign: "center", color: colors.gold }}>
        <h2>𓉐 PVP LOBBY</h2>
        <button onClick={hostGame} style={{ padding: "12px 24px", background: colors.gold, border: "none", cursor: "pointer", fontWeight: "bold" }}>HOST NEW MATCH</button>
        <div style={{ marginTop: "30px" }}>
          {availableGames.length > 0 ? availableGames.map(g => (
            <div key={g.id} style={{ border: "1px solid #444", padding: "10px", margin: "10px auto", maxWidth: "300px", display: "flex", justifyContent: "space-between" }}>
              <span>{g.player_white}'s Tomb</span>
              <button onClick={() => joinGame(g.id)} style={{ color: colors.gold, background: "none", border: "1px solid gold", cursor: "pointer" }}>JOIN</button>
            </div>
          )) : <p>No open tombs found...</p>}
        </div>
        <button onClick={() => setView("game")} style={{ marginTop: "20px", color: colors.darkSand, background: "none", border: "none", cursor: "pointer" }}>Back to Board</button>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      <div style={{ marginBottom: "15px" }}>
        <button onClick={() => setView("lobby")} style={{ background: colors.obsidian, color: colors.gold, border: `1px solid ${colors.gold}`, padding: "5px 15px", cursor: "pointer", borderRadius: "20px" }}>
          {gameMode === "PvP" ? `ROOM: ${activeGameId}` : "ENTER LOBBY"}
        </button>
        {gameMode === "PvP" && <button onClick={() => {setGameMode("AI"); setActiveGameId(null); initializeGame();}} style={{ marginLeft: "10px", color: "#888", background: "none", border: "none", cursor: "pointer" }}>Exit PvP</button>}
      </div>

      <p style={{ color: colors.gold, minHeight: "24px" }}>{gameMode} MODE: {turn.toUpperCase()}'S TURN</p>

      <div style={{ margin: "20px auto", height: "100px", display: "flex", justifyContent: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "90px" }} />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 40px", background: colors.gold, border: "none", fontWeight: "bold", borderRadius: "50px", cursor: "pointer", marginBottom: "20px" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "600px", border: `8px solid ${colors.darkSand}` }}>
        {board.map((_, i) => (
          <div key={i} onClick={() => {
            if (board[i] === turn) setSelectedSquare(i);
            else if (selectedSquare !== null && i === selectedSquare + lastThrow) executeMove(selectedSquare, i);
          }} style={{ width: "60px", height: "60px", border: selectedSquare === i ? "2px solid gold" : "1px solid #333", position: "relative", cursor: "pointer" }}>
            {board[i] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px" }} />}
            {board[i] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px" }} />}
          </div>
        ))}
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "50px", color: colors.gold }}>
        <div>{username}: {borneOff.white}/5</div>
        <div>{gameMode === "AI" ? "ANUBIS" : "OPPONENT"}: {borneOff.black}/5</div>
      </div>
    </div>
  );
}
