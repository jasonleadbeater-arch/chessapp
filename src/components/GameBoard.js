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
  const [liveGames, setLiveGames] = useState([]);
  const [game, setGame] = useState(new Chess());
  const [optionSquares, setOptionSquares] = useState({}); // For Legal Move Dots
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

  // --- CAPTURED PIECES CALCULATION ---
  const getCapturedPieces = () => {
    const history = game.history({ verbose: true });
    const whiteCaptured = []; // Pieces white has lost (captured by black)
    const blackCaptured = []; // Pieces black has lost (captured by white)
    history.forEach((m) => {
      if (m.captured) {
        if (m.color === "w") blackCaptured.push(m.captured);
        else whiteCaptured.push(m.captured);
      }
    });
    return { whiteCaptured, blackCaptured };
  };

  // --- LEGAL MOVE DOTS ---
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

  // --- CORE GAME ACTIONS ---
  const updateCoins = async (u, d) => {
    if (!u || u === "Stockfish AI") return;
    const { data } = await supabase.from('treasury').select('coins').eq('username', u).single();
    if (data) await supabase.from('treasury').update({ coins: Math.max(0, data.coins + d) }).eq('username', u);
    fetchData();
  };

  const handleResign = async () => {
    if (!player1 || !player2) return;
    await updateCoins(player2.username, 3);
    await updateCoins(player1.username, -3);
    setGameOverMessage(`${player1.username} Resigned. ${player2.username} Wins!`);
  };

  const handleUndo = () => {
    if (gameMode !== "ai") return;
    game.undo(); game.undo(); // Undo AI and Player
    setGame(new Chess(game.fen()));
    setOptionSquares({});
  };

  const handleDrawOffer = async () => {
    await updateCoins(player1.username, 1);
    await updateCoins(player2.username, 1);
    setGameOverMessage("Game Ended in a Mutual Draw!");
  };

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = "";
    if (gameInstance.isCheckmate()) {
      const winnerColor = gameInstance.turn() === 'w' ? 'b' : 'w';
      const winName = winnerColor === 'w' ? player1?.username : player2?.username;
      const loseName = winnerColor === 'w' ? player2?.username : player1?.username;
      msg = `${winName} Wins by Checkmate! (+3 🪙)`;
      await updateCoins(winName, 3); await updateCoins(loseName, -3);
    } else {
      msg = "Draw! (+1 🪙)";
      await updateCoins(player1?.username, 1); await updateCoins(player2?.username, 1);
    }
    setGameOverMessage(msg);
  };

  // --- DATA FETCHING ---
  const fetchData = async () => {
    const { data: m } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (m) setTreasury(m);
    const { data: g } = await supabase.from('games').select('*').limit(10);
    if (g) setLiveGames(g);
  };
  useEffect(() => { fetchData(); }, []);

  // --- SOUNDS & ENGINE ---
  const playSound = (f) => { if (audioUnlocked) new Audio(`${currentTheme.audioPath}${f}`).play().catch(() => {}); };
  
  useEffect(() => {
    stockfish.current = new Worker('/stockfish.js');
    stockfish.current.onmessage = (e) => {
      if (e.data.startsWith("bestmove") && gameMode === "ai") {
        const moveStr = e.data.split(" ")[1];
        const next = new Chess(game.fen());
        const m = next.move({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
        setGame(next);
        if (m?.captured) playSound("black_capture.mp3");
        checkGameOver(next);
      }
    };
    return () => stockfish.current?.terminate();
  }, [gameMode, player1]);

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver() && player1) {
      stockfish.current?.postMessage(`position fen ${game.fen()}`);
      stockfish.current?.postMessage(`go depth 10`);
    }
  }, [game]);

  // --- PIECE THEMES ---
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

  // --- HANDLERS ---
  async function onDrop(source, target) {
    try {
      const gameCopy = new Chess(game.fen());
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      setGame(gameCopy);
      setOptionSquares({});
      playSound(move.captured ? "white_capture.mp3" : "move.mp3");
      if (gameMode === "pvp") {
        await supabase.from('games').update({ fen: gameCopy.fen() })
          .or(`and(white_player.eq.${player1.username},black_player.eq.${player2?.username}),and(white_player.eq.${player2?.username},black_player.eq.${player1.username})`);
      }
      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  const handleStartGame = async (e, existingOpponent = null) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true);
    const p1 = inputs.p1.toLowerCase().trim();
    const p2 = (existingOpponent || inputs.p2 || "").toLowerCase().trim();
    if (!p1) return;
    setIsJoining(true);
    try {
      let { data: u1 } = await supabase.from('treasury').select('*').eq('username', p1).maybeSingle();
      if (!u1) {
        const { data: n1 } = await supabase.from('treasury').insert([{ username: p1, coins: 50 }]).select().single();
        u1 = n1;
      }
      setPlayer1(u1);
      if (gameMode === "pvp" && p2) {
        let { data: g } = await supabase.from('games').select('*').or(`and(white_player.eq.${p1},black_player.eq.${p2}),and(white_player.eq.${p2},black_player.eq.${p1})`).maybeSingle();
        if (g) setGame(new Chess(g.fen));
        else await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen() }]);
        setPlayer2({ username: p2 });
      } else { setPlayer2({ username: "Stockfish AI" }); }
    } finally { setIsJoining(false); }
  };

  const { whiteCaptured, blackCaptured } = getCapturedPieces();

  // --- RENDER LOBBY ---
  if (!player1) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", color: currentTheme.light, letterSpacing: "4px" }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", margin: "40px 0" }}>
          <img src="/themes/mickey/pieces/wk.png" style={{ width: "120px", filter: "drop-shadow(0 0 10px gold)" }} alt="Mickey" />
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
             <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", border: "none" }}>VS AI</button>
                <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", border: "none" }}>VS PLAYER</button>
             </div>
             <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px", color: "#000" }} required />
                {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px", color: "#000" }} />}
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, color: "#000", fontWeight: "bold" }}>ENTER CLUB</button>
             </form>
          </div>
          <img src="/themes/miraculous/pieces/wq.png" style={{ width: "120px", filter: "drop-shadow(0 0 10px red)" }} alt="Ladybug" />
        </div>
        <h2 style={{ color: currentTheme.light }}>CLUB MEMBERS</h2>
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
          {treasury.map((u, i) => (
            <div key={i} style={{ padding: "8px 15px", background: "#222", borderRadius: "20px", border: `1px solid ${currentTheme.light}` }}>
              {u.username} <span style={{ color: "gold" }}>🪙 {u.coins}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- RENDER GAME ---
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      
      {/* CAPTURED BY BLACK (Pieces White Lost) */}
      <div style={{ width: "80px", display: "flex", flexDirection: "column", gap: "5px", alignItems: "center", background: "#111", padding: "10px", borderRadius: "10px" }}>
        <p style={{ fontSize: "10px", color: "#666" }}>LOST</p>
        {blackCaptured.map((p, i) => <img key={i} src={`${currentTheme.path}w${p.toLowerCase()}.png`} style={{ width: "30px" }} alt="lost" />)}
      </div>

      <div style={{ margin: "0 40px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "20px" }}>{player1.username} VS {player2?.username}</h2>
        
        {gameOverMessage && (
          <div style={{ position: "absolute", zIndex: 100, top: "20%", left: "50%", transform: "translateX(-50%)", backgroundColor: "#000", padding: "40px", border: `5px solid ${currentTheme.light}`, boxShadow: "0 0 50px #000" }}>
            <h1>{gameOverMessage}</h1>
            <button onClick={() => { setGame(new Chess()); setGameOverMessage(null); }} style={{ padding: "15px 30px", backgroundColor: currentTheme.light, fontWeight: "bold", border: "none", cursor: "pointer" }}>NEW GAME</button>
          </div>
        )}

        <div style={{ width: "min(550px, 90vw)", border: `12px solid ${currentTheme.dark}`, borderRadius: "5px" }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            onSquareClick={(square) => { getMoveOptions(square) || setOptionSquares({}); }}
            customPieces={customPieces}
            customSquareStyles={{ ...optionSquares }}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>

        {/* CONTROLS */}
        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          {gameMode === "ai" && <button onClick={handleUndo} style={btnStyle}>UNDO</button>}
          <button onClick={handleDrawOffer} style={btnStyle}>OFFER DRAW</button>
          <button onClick={handleResign} style={{ ...btnStyle, backgroundColor: "#600" }}>RESIGN</button>
          <button onClick={() => window.location.reload()} style={{ ...btnStyle, backgroundColor: "#333" }}>EXIT</button>
        </div>
      </div>

      {/* CAPTURED BY WHITE (Pieces Black Lost) */}
      <div style={{ width: "80px", display: "flex", flexDirection: "column", gap: "5px", alignItems: "center", background: "#111", padding: "10px", borderRadius: "10px" }}>
        <p style={{ fontSize: "10px", color: "#666" }}>LOST</p>
        {whiteCaptured.map((p, i) => <img key={i} src={`${currentTheme.path}b${p.toLowerCase()}.png`} style={{ width: "30px" }} alt="lost" />)}
      </div>
    </div>
  );
}

const btnStyle = { padding: "10px 20px", backgroundColor: "#444", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer", fontWeight: "bold", fontSize: "12px" };
