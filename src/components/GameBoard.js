"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../lib/supabase";

export default function GameBoard({ themeKey }) {
  // --- STATE ---
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [gameMode, setGameMode] = useState("ai");
  const [inputs, setInputs] = useState({ p1: "", p2: "" });
  const [treasury, setTreasury] = useState([]);
  const [game, setGame] = useState(new Chess());
  const [moveSquares, setMoveSquares] = useState({}); // For Dots
  const [optionSquares, setOptionSquares] = useState({}); // For Highlighting
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  // --- CAPTURED PIECES LOGIC ---
  const getCapturedPieces = () => {
    const history = game.history({ verbose: true });
    const whiteCaptured = [];
    const blackCaptured = [];
    history.forEach((m) => {
      if (m.captured) {
        if (m.color === "w") blackCaptured.push(m.captured);
        else whiteCaptured.push(m.captured);
      }
    });
    return { whiteCaptured, blackCaptured };
  };

  // --- DOTS / LEGAL MOVES ---
  function getMoveOptions(square) {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) return false;

    const newSquares = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to) && game.get(move.to).color !== game.get(square).color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return move;
    });
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(newSquares);
    return true;
  }

  function onSquareClick(square) {
    const hasOptions = getMoveOptions(square);
    if (!hasOptions) setOptionSquares({});
  }

  // --- ACTIONS ---
  const handleUndo = () => {
    if (gameMode !== "ai") return; // Prevent undo in PvP for now
    game.undo();
    game.undo(); // Undo AI move and User move
    setGame(new Chess(game.fen()));
    setOptionSquares({});
  };

  const handleResign = async () => {
    const winner = player2?.username;
    const loser = player1?.username;
    await updateCoins(winner, 3);
    await updateCoins(loser, -3);
    setGameOverMessage(`${player1.username} resigned. ${winner} wins!`);
  };

  // --- STOCKFISH & SOUNDS (Existing Logic) ---
  const playSound = (f) => { if (audioUnlocked) new Audio(`${currentTheme.audioPath}${f}`).play().catch(() => {}); };
  
  const updateCoins = async (u, d) => {
    if (!u || u === "Stockfish AI") return;
    const { data } = await supabase.from('treasury').select('coins').eq('username', u).single();
    if (data) await supabase.from('treasury').update({ coins: Math.max(0, data.coins + d) }).eq('username', u);
  };

  async function onDrop(source, target) {
    try {
      const move = game.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setGame(new Chess(game.fen()));
      setOptionSquares({});
      playSound(move.captured ? "white_capture.mp3" : "move.mp3");
      // Add broadcast and game over checks here...
      return true;
    } catch (e) { return false; }
  }

  const { whiteCaptured, blackCaptured } = getCapturedPieces();

  if (!player1) { /* ... keep your existing Lobby UI here ... */ return <div>Lobby Logic</div>; }

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "20px", background: "#000", minHeight: "100vh", color: "#fff" }}>
      
      {/* LEFT: Captured by Black */}
      <div style={{ width: "60px", padding: "10px" }}>
        {blackCaptured.map((p, i) => (
          <img key={i} src={`${currentTheme.path}w${p.toLowerCase()}.png`} style={{ width: "30px", display: "block" }} alt="captured" />
        ))}
      </div>

      <div style={{ textAlign: "center", margin: "0 20px" }}>
        <h2>{player1.username} vs {player2?.username}</h2>
        
        <div style={{ width: "500px", border: `10px solid ${currentTheme.dark}`, position: "relative" }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            onSquareClick={onSquareClick}
            customSquareStyles={{ ...optionSquares }}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          {gameMode === "ai" && <button onClick={handleUndo} style={btnStyle}>Undo</button>}
          <button onClick={() => setGameOverMessage("Draw Offered (Feature coming soon)")} style={btnStyle}>Offer Draw</button>
          <button onClick={handleResign} style={{ ...btnStyle, backgroundColor: "#600" }}>Resign</button>
        </div>
      </div>

      {/* RIGHT: Captured by White */}
      <div style={{ width: "60px", padding: "10px" }}>
        {whiteCaptured.map((p, i) => (
          <img key={i} src={`${currentTheme.path}b${p.toLowerCase()}.png`} style={{ width: "30px", display: "block" }} alt="captured" />
        ))}
      </div>
    </div>
  );
}

const btnStyle = { padding: "10px 20px", background: "#333", color: "#fff", border: "1px solid #555", cursor: "pointer", borderRadius: "5px" };
