
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
  const [message, setMessage] = useState("Enter the Tomb of Senet.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameMode, setGameMode] = useState("AI"); 
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [raGlow, setRaGlow] = useState(null);
  const [username, setUsername] = useState("𓋴𓈖𓏏");
  const [roomCodeInput, setRoomCodeInput] = useState("");

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 2. INITIALIZATION & SYNC ---
  useEffect(() => {
    async function getTreasuryName() {
      if (!player1?.id) return;
      const { data } = await supabase.from("treasury").select("username").eq("id", player1.id).single();
      if (data?.username) setUsername(data.username);
    }
    getTreasuryName();
    fetchOpenGames();
  }, [player1]);

  const fetchOpenGames = async () => {
    const { data } = await supabase.from("senet_games").select("*").eq("status", "open");
    if (data) setAvailableGames(data);
  };

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
  };

  // Realtime Sync
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
        setBorneOff(data.borne_off);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [activeGameId]);

  // --- 3. PERSISTENCE LOGIC ---
  const hostPvpMatch = async () => {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null).map((_, i) => i < 10 ? (i % 2 === 0 ? "white" : "black") : null);
    
    const { error } = await supabase.from("senet_games").insert([{
      id: code,
      player_white: username,
      board_state: initialBoard,
      turn: "white",
      last_throw: 0,
      status: "open"
    }]);

    if (!error) {
      setActiveGameId(code);
      setGameMode("PvP");
    } else {
      alert(error.message);
    }
  };

  const joinPvpMatch = async () => {
    if (!roomCodeInput) return;
    const { error } = await supabase.from("senet_games").update({
      player_black: username,
      status: "active"
    }).eq("id", roomCodeInput);

    if (!error) {
      setActiveGameId(roomCodeInput);
      setGameMode("PvP");
    } else {
      alert("Tomb not found or access denied.");
    }
  };

  const updateRemoteGame = async (newBoard, nextTurn, score, newBorne) => {
    if (gameMode !== "PvP" || !activeGameId) return;
    await supabase.from('senet_games').update({
      board_state: newBoard,
      turn: nextTurn,
      last_throw: score,
      borne_off: newBorne || borneOff
    }).eq('id', activeGameId);
  };

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

  // --- 4. GAMEPLAY ---
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
        if (gameMode === "PvP") updateRemoteGame(board, turn, finalScore);
      }
    }, 70);
  };

  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling || gameOver) return;
    if (board[index] === turn) setSelectedSquare(index);
    else if (selectedSquare !== null && index === selectedSquare + lastThrow) {
      executeMove(selectedSquare, index);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];
    const piece = newBoard[from];

    if (to >= 30) {
      if (from < 20) return setMessage("Finish the rows first!");
      newBoard[from] = null;
      const newBorne = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorne);
      await logMove(from, 30, piece);
      if (newBorne[turn] === 5) setGameOver(true);
      else finalizeTurn(newBoard, newBorne);
      return;
    }

    // Protection/Swap Logic
    const occupant = newBoard[to];
    if (occupant === turn) return;
    if (occupant && to < 25) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected) return setMessage("Piece is protected!");
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    // Trap Square 26 (Water)
    if (to === 26) {
      newBoard[26] = null;
      const resetPos = !newBoard[14] ? 14 : 0;
      newBoard[resetPos] = turn;
    }

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
    if (gameMode === "PvP") updateRemoteGame(newBoard, nextTurn, 0, newBorne);
  };

  // --- 5. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    return (
      <div key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px", border: isSelected ? "3px solid gold" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.${num === 28 ? 'jpeg' : 'png'})`,
          backgroundSize: "cover", backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center", position: "relative", cursor: "pointer"
        }}>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px" }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px" }} />}
      </div>
    );
  };

  // --- 6. MAIN RENDER ---
  if (!activeGameId && gameMode === "PvP") {
    return (
      <div style={{ padding: "100px", textAlign: "center", color: colors.gold }}>
        <h2 style={{ letterSpacing: "4px" }}>SENET LOBBY</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "300px", margin: "0 auto" }}>
          <button onClick={hostPvpMatch} style={{ padding: "15px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer" }}>HOST PvP MATCH</button>
          <div style={{ borderBottom: "1px solid #333", margin: "10px 0" }}></div>
          <input placeholder="ROOM CODE" value={roomCodeInput} onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())} style={{ padding: "12px", textAlign: "center", borderRadius: "4px" }} />
          <button onClick={joinPvpMatch} style={{ padding: "15px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>JOIN PvP MATCH</button>
          <button onClick={() => {setGameMode("AI"); initializeGame(); setActiveGameId("AI-MODE");}} style={{ background: "none", color: colors.darkSand, border: "none", cursor: "pointer" }}>Play Offline</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif", padding: "20px" }}>
      <h1 style={{ color: colors.gold, letterSpacing: "8px" }}>TOMB OF SENET</h1>
      <p style={{ color: colors.gold }}>{message}</p>

      <div style={{ margin: "20px auto", height: "100px" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} style={{ height: "90px" }} />}
      </div>

      <button onClick={throwSticks} disabled={isRolling || lastThrow > 0} style={{ padding: "12px 40px", background: colors.gold, fontWeight: "bold", borderRadius: "50px", cursor: "pointer", marginBottom: "20px" }}>
        {isRolling ? "CASTING..." : "THROW STICKS"}
      </button>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "600px", border: `8px solid ${colors.darkSand}` }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "20px", display: "flex", justifyContent: "center", gap: "40px" }}>
        <div style={{ color: colors.gold }}>WHITE: {borneOff.white}/5</div>
        <div style={{ color: colors.gold }}>BLACK: {borneOff.black}/5</div>
      </div>
      
      {activeGameId && <div style={{ marginTop: "10px", fontSize: "12px", color: colors.darkSand }}>ROOM: {activeGameId}</div>}
    </div>
  );
}
