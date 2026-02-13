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
  const [optionSquares, setOptionSquares] = useState({});
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState(null);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  // --- ENGINE SETUP (RESCUE VERSION) ---
  useEffect(() => {
    try {
      stockfish.current = new Worker('/stockfish.js');
      stockfish.current.onmessage = (e) => {
        if (e.data.startsWith("bestmove")) {
          const moveStr = e.data.split(" ")[1];
          makeAMove({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
        }
      };
    } catch (e) {
      console.error("Worker failed to start. Check if public/stockfish.js exists.");
    }
    return () => stockfish.current?.terminate();
  }, []);

  function makeAMove(move) {
    const gameCopy = new Chess(game.fen());
    try {
      const result = gameCopy.move(move);
      if (result) {
        setGame(gameCopy);
        playSound(result.captured ? "white_capture.mp3" : "move.mp3");
        checkGameOver(gameCopy);
        return result;
      }
    } catch (e) { return null; }
  }

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver()) {
      stockfish.current?.postMessage(`position fen ${game.fen()}`);
      stockfish.current?.postMessage(`go depth 10`);
    }
  }, [game]);

  // --- AUDIO ---
  const playSound = (f) => { 
    if (!audioUnlocked) return;
    new Audio(`${currentTheme.audioPath}${f}`).play().catch(() => {});
  };

  useEffect(() => {
    if (!audioUnlocked) return;
    if (bgMusic.current) bgMusic.current.pause();
    bgMusic.current = new Audio(`${currentTheme.audioPath}theme.mp3`);
    bgMusic.current.loop = true;
    bgMusic.current.volume = 0.2;
    bgMusic.current.play().catch(() => {});
    return () => bgMusic.current?.pause();
  }, [themeKey, audioUnlocked]);

  // --- UI HANDLERS ---
  const onDrop = (source, target) => {
    const move = makeAMove({ from: source, to: target, promotion: "q" });
    if (move === null) return false;
    return true;
  };

  const handleStartGame = async (e) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true);
    const p1 = inputs.p1.toLowerCase().trim();
    if (!p1) return;
    
    let { data: u1 } = await supabase.from('treasury').select('*').eq('username', p1).maybeSingle();
    if (!u1) {
      const { data: n1 } = await supabase.from('treasury').insert([{ username: p1, coins: 50 }]).select().single();
      u1 = n1;
    }
    setPlayer1(u1);
    setPlayer2({ username: gameMode === "ai" ? "Stockfish AI" : "Player 2" });
  };

  const checkGameOver = (instance) => {
    if (instance.isGameOver()) setGameOverMessage("Game Over!");
  };

  const customPieces = useMemo(() => {
    const pieces = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"];
    const pieceMap = {};
    pieces.forEach((p) => {
      pieceMap[p] = ({ squareWidth }) => (
        <img src={`${currentTheme.path}${p.toLowerCase()}.png`} style={{ width: squareWidth }} alt={p} />
      );
    });
    return pieceMap;
  }, [currentTheme]);

  // --- RENDER ---
  if (!player1) {
    return (
      <div onClick={() => setAudioUnlocked(true)} style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", textAlign: "center", padding: "50px" }}>
        <h1 style={{ color: currentTheme.light }}>TREASURE CHESS CLUB</h1>
        <div style={{ margin: "40px auto", width: "300px", padding: "20px", border: `2px solid ${currentTheme.light}` }}>
          <button onClick={() => setGameMode("ai")} style={{ background: gameMode === "ai" ? currentTheme.light : "#333", width: "50%" }}>AI</button>
          <button onClick={() => setGameMode("pvp")} style={{ background: gameMode === "pvp" ? currentTheme.light : "#333", width: "50%" }}>PVP</button>
          <form onSubmit={handleStartGame} style={{ marginTop: "20px" }}>
            <input placeholder="Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} required style={{ width: "100%", marginBottom: "10px" }} />
            <button type="submit" style={{ width: "100%", background: currentTheme.light, color: "#000" }}>START</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "50px", textAlign: "center" }}>
      <h2>{player1.username} vs {player2.username}</h2>
      <div style={{ width: "500px", margin: "0 auto", border: `10px solid ${currentTheme.dark}` }}>
        <Chessboard position={game.fen()} onPieceDrop={onDrop} customPieces={customPieces} customDarkSquareStyle={{ backgroundColor: currentTheme.dark }} customLightSquareStyle={{ backgroundColor: currentTheme.light }} />
      </div>
      {gameOverMessage && <h1 style={{ color: currentTheme.light }}>{gameOverMessage}</h1>}
      <button onClick={() => window.location.reload()} style={{ marginTop: "20px" }}>EXIT</button>
    </div>
  );
}
