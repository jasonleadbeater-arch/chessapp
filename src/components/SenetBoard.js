"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. STATE MANAGEMENT ---
  const [activeGameId, setActiveGameId] = useState(null);
  const [availableGames, setAvailableGames] = useState([]);
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("Select a tomb to enter.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameMode, setGameMode] = useState("𓄿𓇋"); 
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [raGlow, setRaGlow] = useState(null);
  
  const [username, setUsername] = useState("𓋴𓈖𓏏");
  const [player2Name, setPlayer2Name] = useState("Waiting...");

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 2. LOBBY & PERSISTENCE ---
  useEffect(() => {
    fetchOpenGames();
    const lobbySubscription = supabase
      .channel('lobby')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'senet_games' }, fetchOpenGames)
      .subscribe();
    return () => supabase.removeChannel(lobbySubscription);
  }, []);

  const fetchOpenGames = async () => {
    const { data } = await supabase.from("senet_games").select("*").eq("status", "open");
    if (data) setAvailableGames(data);
  };

  const createGame = async () => {
    const { data, error } = await supabase.from("senet_games").insert([{
      player1_id: player1?.id,
      player1_name: username,
      board_state: Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null),
      turn: "white",
      status: "open"
    }]).select().single();
    
    if (data) setActiveGameId(data.id);
  };

  const joinGame = async (game) => {
    await supabase.from("senet_games").update({
      player2_id: player1?.id,
      player2_name: username,
      status: "active"
    }).eq("id", game.id);
    setActiveGameId(game.id);
  };

  // --- 3. GAME SYNC & LOGGING ---
  useEffect(() => {
    if (!activeGameId) return;

    const channel = supabase
      .channel(`game:${activeGameId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'senet_games', filter: `id=eq.${activeGameId}` }, 
      (payload) => {
        const data = payload.new;
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
        setPlayer2Name(data.player2_name || "Waiting...");
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [activeGameId]);

  const logMove = async (from, to, piece) => {
    if (!activeGameId) return;
    await supabase.from("senet_moves").insert([{
      game_id: activeGameId,
      player_id: player1?.id,
      move_from: from,
      move_to: to,
      piece_type: piece,
      throw_value: lastThrow
    }]);
  };

  // --- 4. CORE MECHANICS (Preserved) ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    setIsRolling(true);
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      if (count > 12) {
        clearInterval(interval);
        const finalScore = [1,2,3,4,5][Math.floor(Math.random()*5)];
        setLastThrow(finalScore);
        setIsRolling(false);
        if (gameMode === "PvP") updateRemoteGame(board, turn, finalScore);
      }
    }, 70);
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    // ... (Your original movement logic here) ...

    await logMove(from, to, piece); // Logging the move
    finalizeTurn(newBoard);
  };

  const updateRemoteGame = async (newBoard, nextTurn, score) => {
    if (gameMode !== "PvP" || !activeGameId) return;
    await supabase.from('senet_games').update({
      board_state: newBoard,
      turn: nextTurn,
      last_throw: score
    }).eq('id', activeGameId);
  };

  const finalizeTurn = (newBoard) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    setBoard(newBoard);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextTurn);
    if (gameMode === "PvP") updateRemoteGame(newBoard, nextTurn, 0);
  };

  // --- 5. RENDER LOBBY OR BOARD ---
  if (!activeGameId && gameMode === "PvP") {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: colors.gold }}>
        <h2>𓉐 THE TOMB REGISTRY</h2>
        <button onClick={createGame} style={{ padding: "15px", background: colors.gold, border: "none", cursor: "pointer", fontWeight: "bold", marginBottom: "20px" }}>
          CREATE NEW TOMB
        </button>
        <div style={{ display: "grid", gap: "10px", maxWidth: "400px", margin: "0 auto" }}>
          {availableGames.map(game => (
            <div key={game.id} style={{ padding: "15px", border: `1px solid ${colors.darkSand}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>{game.player1_name}'s Journey</span>
              <button onClick={() => joinGame(game)} style={{ background: colors.raOrange, color: "white", border: "none", padding: "5px 10px", cursor: "pointer" }}>JOIN</button>
            </div>
          ))}
        </div>
        <button onClick={() => setGameMode("AI")} style={{ marginTop: "20px", background: "none", color: colors.darkSand, border: "none", cursor: "pointer" }}>Practice vs AI</button>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      {/* ... Your existing Board UI ... */}
      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "50px", color: colors.gold }}>
          <div>{username}: {borneOff.white}/5</div>
          <div>{gameMode === "AI" ? difficulty.toUpperCase() : player2Name}: {borneOff.black}/5</div>
        </div>
      </div>
    </div>
  );
}
