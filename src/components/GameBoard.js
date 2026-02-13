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
  const [aiLevel, setAiLevel] = useState(1);
  const [inputs, setInputs] = useState({ p1: "", p2: "" });
  const [treasury, setTreasury] = useState([]);
  const [game, setGame] = useState(new Chess());
  const [optionSquares, setOptionSquares] = useState({});
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

  // --- CAPTURED PIECES ---
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

  // --- MOVE OPTIONS ---
  function getMoveOptions(square) {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) return false;
    const newSquares = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background: game.get(move.to) 
          ? "radial-gradient(circle, rgba(0,0,0,.2) 85%, transparent 85%)" 
          : "radial-gradient(circle, rgba(0,0,0,.2) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return move;
    });
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(newSquares);
    return true;
  }

  // --- DATABASE & ENGINE ---
  const fetchData = async () => {
    const { data: m } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (m) setTreasury(m);
  };
  useEffect(() => { fetchData(); }, []);

  const updateCoins = async (u, d) => {
    if (!u || u === "Stockfish AI") return;
    const { data } = await supabase.from('treasury').select('coins').eq('username', u).single();
    if (data) await supabase.from('treasury').update({ coins: Math.max(0, data.coins + d) }).eq('username', u);
    fetchData();
  };

  const playSound = (f) => { 
    if (!audioUnlocked) return;
    const audio = new Audio(`${currentTheme.audioPath}${f}`);
    audio.play().catch(e => console.log("Sound error:", e));
  };

  // --- STOCKFISH INITIALIZATION ---
  useEffect(() => {
    if (typeof window !== "undefined") {
      stockfish.current = new Worker('/stockfish.js');
      
      stockfish.current.onmessage = (e) => {
        console.log("Stockfish Says:", e.data); // DEBUG LOG
        if (e.data.startsWith("bestmove") && gameMode === "ai") {
          const moveStr = e.data.split(" ")[1];
          if (!moveStr || moveStr === "(none)") return;

          const next = new Chess(game.fen());
          try {
            const m = next.move({ 
              from: moveStr.substring(0, 2), 
              to: moveStr.substring(2, 4), 
              promotion: "q" 
            });
            if (m) {
              setGame(next);
              playSound(m.captured ? "black_capture.mp3" : "move.mp3");
              checkGameOver(next);
            }
          } catch (err) { console.error("AI Move Logic Error:", err); }
        }
      };

      stockfish.current.postMessage("uci");
      stockfish.current.postMessage(`setoption name Skill Level value ${aiLevel}`);
      stockfish.current.postMessage("isready");
    }
    return () => stockfish.current?.terminate();
  }, [gameMode, player1, aiLevel]);

  // --- TRIGGER AI MOVE ---
  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver() && player1) {
      const timer = setTimeout(() => {
        // The Reset Sequence
        stockfish.current?.postMessage("ucinewgame");
        stockfish.current?.postMessage("isready");
        stockfish.current?.postMessage(`position fen ${game.fen()}`);
        
        // Dynamic Depth
        const depth = aiLevel < 5 ? 2 : aiLevel < 12 ? 8 : 14;
        stockfish.current?.postMessage(`go depth ${depth}`);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [game]);

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = gameInstance.isCheckmate() 
      ? `${gameInstance.turn() === 'w' ? player2?.username : player1?.username} Wins! (+3 🪙)`
      : "Draw! (+1 🪙)";
    
    setGameOverMessage(msg);
    if (gameInstance.isCheckmate()) {
      const winner = gameInstance.turn() === 'w' ? player2?.username : player1?.username;
      const loser = gameInstance.turn() === 'w' ? player1?.username : player2?.username;
      await updateCoins(winner, 3); await updateCoins(loser, -3);
    }
  };

  // --- HANDLERS ---
  async function onDrop(source, target) {
    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setGame(gameCopy);
      setOptionSquares({});
      playSound(move.captured ? "white_capture.mp3" : "move.mp3");
      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  const handleStartGame = async (e) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true); 
    const p1 = inputs.p1.toLowerCase().trim();
    if (!p1) return;
    setIsJoining(true);
    let { data: u1 } = await supabase.from('treasury').select('*').eq('username', p1).maybeSingle();
    if (!u1) {
      const { data: n1 } = await supabase.from('treasury').insert([{ username: p1, coins: 50 }]).select().single();
      u1 = n1;
    }
    setPlayer1(u1);
    setPlayer2({ username: gameMode === "ai" ? "Stockfish AI" : inputs.p2 || "Player 2" });
    setIsJoining(false);
  };

  useEffect(() => {
    if (!audioUnlocked) return;
    const musicPath = `${currentTheme.audioPath}theme.mp3`;
    if (bgMusic.current) bgMusic.current.pause();
    bgMusic.current = new Audio(musicPath);
    bgMusic.current.loop = true;
    bgMusic.current.volume = 0.2;
    bgMusic.current.play().catch(() => {});
    return () => bgMusic.current?.pause();
  }, [themeKey, audioUnlocked]);

  const customPieces = useMemo(() => {
    const pieces = ["wP", "wN", "wB", "wR", "wQ", "wK", "bP", "bN", "bB", "bR", "bQ", "bK"];
    const pieceMap = {};
    pieces.forEach((p) => {
      pieceMap[p] = ({ squareWidth }) => (
        <img src={`${currentTheme.path}${p.toLowerCase()}.png`} style={{ width: squareWidth, height: squareWidth }} alt={p} />
      );
    });
    return pieceMap;
  }, [currentTheme]);

  const { whiteCaptured, blackCaptured } = getCapturedPieces();

  // --- UI: LOBBY ---
  if (!player1) {
    return (
      <div onClick={() => setAudioUnlocked(true)} style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", color: currentTheme.light }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", margin: "40px 0" }}>
          <img src="/themes/mickey/pieces/wk.png" style={{ width: "120px" }} alt="Mickey" />
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
             <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button type="button" onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", color: gameMode === "ai" ? "#000" : "#fff", fontWeight: "bold" }}>VS AI</button>
                <button type="button" onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", color: gameMode === "pvp" ? "#000" : "#fff", fontWeight: "bold" }}>VS PLAYER</button>
             </div>
             <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px", color: "#000" }} required />
                {gameMode === "ai" && (
                   <div style={{ padding: "10px", background: "#222", borderRadius: "10px" }}>
                     <label style={{ fontSize: "12px", color: currentTheme.light }}>AI LEVEL: {aiLevel}</label>
                     <input type="range" min="0" max="20" value={aiLevel} onChange={(e) => setAiLevel(parseInt(e.target.value))} style={{ width: "100%", accentColor: currentTheme.light }} />
                   </div>
                )}
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, color: "#000", fontWeight: "bold", borderRadius: "5px" }}>ENTER CLUB</button>
             </form>
          </div>
          <img src="/themes/miraculous/pieces/wq.png" style={{ width: "120px" }} alt="Ladybug" />
        </div>
      </div>
    );
  }

  // --- UI: GAME ---
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <div style={{ width: "80px", background: "#111", padding: "10px", borderRadius: "10px" }}>
        {blackCaptured.map((p, i) => <img key={i} src={`${currentTheme.path}w${p.toLowerCase()}.png`} style={{ width: "30px" }} alt="lost" />)}
      </div>

      <div style={{ margin: "0 40px", textAlign: "center" }}>
        <h2 style={{ color: currentTheme.light }}>{player1.username} vs {player2?.username}</h2>
        {gameOverMessage && (
          <div style={{ position: "absolute", zIndex: 100, top: "30%", left: "50%", transform: "translateX(-50%)", backgroundColor: "#000", padding: "40px", border: `4px solid ${currentTheme.light}`, borderRadius: "15px" }}>
            <h1>{gameOverMessage}</h1>
            <button onClick={() => { setGame(new Chess()); setGameOverMessage(null); }} style={{ padding: "10px 20px", backgroundColor: currentTheme.light, fontWeight: "bold" }}>NEW GAME</button>
          </div>
        )}
        <div style={{ width: "550px", border: `12px solid ${currentTheme.dark}` }}>
          <Chessboard position={game.fen()} onPieceDrop={onDrop} onSquareClick={getMoveOptions} customPieces={customPieces} customDarkSquareStyle={{ backgroundColor: currentTheme.dark }} customLightSquareStyle={{ backgroundColor: currentTheme.light }} />
        </div>
        <div style={{ marginTop: "20px" }}>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", background: "#444", color: "#fff", border: "none", borderRadius: "5px" }}>EXIT CLUB</button>
        </div>
      </div>

      <div style={{ width: "80px", background: "#111", padding: "10px", borderRadius: "10px" }}>
        {whiteCaptured.map((p, i) => <img key={i} src={`${currentTheme.path}b${p.toLowerCase()}.png`} style={{ width: "30px" }} alt="lost" />)}
      </div>
    </div>
  );
}
