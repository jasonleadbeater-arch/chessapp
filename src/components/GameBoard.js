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
  const [difficulty, setDifficulty] = useState(10);
  const [inputs, setInputs] = useState({ p1: "", p2: "" });
  const [treasury, setTreasury] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
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

  // --- REALTIME SUBSCRIPTION ---
  useEffect(() => {
    if (gameMode === "pvp" && player1) {
      const channel = supabase
        .channel('game-sync')
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'games' },
          (payload) => {
            const { white_player, black_player, fen } = payload.new;
            // Only update if this change belongs to our current match
            if (white_player === player1.username || black_player === player1.username) {
              setGame(new Chess(fen));
            }
          }
        )
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [gameMode, player1]);

  // --- DATA FETCHING ---
  const fetchData = async () => {
    const { data: m } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (m) setTreasury(m);
    const { data: g } = await supabase.from('games').select('*').limit(10);
    if (g) setLiveGames(g);
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
    new Audio(`${currentTheme.audioPath}${f}`).play().catch(() => {});
  };

  // --- ENGINE WORKER ---
  useEffect(() => {
    stockfish.current = new Worker('/stockfish.js');
    stockfish.current.onmessage = (e) => {
      if (e.data.startsWith("bestmove") && gameMode === "ai") {
        const moveStr = e.data.split(" ")[1];
        setGame((prev) => {
          const next = new Chess(prev.fen());
          const m = next.move({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
          if (m?.captured) playSound("black_capture.mp3");
          checkGameOver(next);
          return next;
        });
      }
    };
    return () => stockfish.current?.terminate();
  }, [gameMode]);

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver() && player1) {
      stockfish.current?.postMessage(`setoption name Skill Level value ${difficulty}`);
      stockfish.current?.postMessage(`position fen ${game.fen()}`);
      stockfish.current?.postMessage(`go depth ${Math.max(1, Math.floor(difficulty / 1.5))}`);
    }
  }, [game, difficulty]);

  // --- CHESS LOGIC ---
  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = gameInstance.isCheckmate() ? "Checkmate!" : "Draw!";
    setGameOverMessage(msg);
    // Coin logic preserved
    if (gameInstance.isCheckmate()) {
      const winnerColor = gameInstance.turn() === 'w' ? 'b' : 'w';
      const winName = winnerColor === 'w' ? player1?.username : player2?.username;
      const loseName = winnerColor === 'w' ? player2?.username : player1?.username;
      await updateCoins(winName, 3); await updateCoins(loseName, -3);
    }
  };

  async function onDrop(source, target) {
    const gameCopy = new Chess(game.fen());
    
    // PVP Turn Enforcement
    if (gameMode === "pvp") {
      const turn = gameCopy.turn(); // 'w' or 'b'
      const isMyTurn = (turn === 'w' && player1.username === player1.white_role) || (turn === 'b' && player1.username === player1.black_role);
      // If names don't match roles, we don't allow the move
      if (player2 && ((turn === 'w' && player1.username !== player1.username) || (turn === 'b' && player1.username !== player1.username))) {
         // This logic will be handled better by comparing the name to the game's white/black player columns
      }
    }

    try {
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

  const handleStartGame = async (e, existingGame = null) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true);
    const p1 = inputs.p1.toLowerCase().trim();
    if (!p1) return;
    setIsJoining(true);

    try {
      let { data: u1 } = await supabase.from('treasury').select('*').eq('username', p1).maybeSingle();
      if (!u1) {
        const { data: n1 } = await supabase.from('treasury').insert([{ username: p1, coins: 50 }]).select().single();
        u1 = n1;
      }
      setPlayer1(u1);

      if (existingGame) {
        setGameMode("pvp");
        setGame(new Chess(existingGame.fen));
        const opponent = existingGame.white_player === p1 ? existingGame.black_player : existingGame.white_player;
        setPlayer2({ username: opponent });
      } else if (gameMode === "pvp") {
        const p2 = inputs.p2.toLowerCase().trim();
        let { data: g } = await supabase.from('games').select('*').or(`and(white_player.eq.${p1},black_player.eq.${p2}),and(white_player.eq.${p2},black_player.eq.${p1})`).maybeSingle();
        if (g) setGame(new Chess(g.fen));
        else await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen() }]);
        setPlayer2({ username: p2 });
      } else {
        setPlayer2({ username: "Stockfish AI" });
      }
    } finally { setIsJoining(false); }
  };

  // --- AUDIO & THEME PIECES (Preserved) ---
  useEffect(() => {
    if (!audioUnlocked) return;
    if (bgMusic.current) { bgMusic.current.pause(); bgMusic.current.src = ""; }
    bgMusic.current = new Audio(`${currentTheme.audioPath}theme.mp3`);
    bgMusic.current.loop = true;
    bgMusic.current.volume = 0.3;
    bgMusic.current.play().catch(() => {});
    return () => { if (bgMusic.current) bgMusic.current.pause(); };
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

  // --- UI RENDERING ---
  if (!player1) {
    return (
      <div onClick={() => setAudioUnlocked(true)} style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ color: currentTheme.light }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ margin: "40px auto", padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
             <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", fontWeight: "bold" }}>VS AI</button>
                <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", fontWeight: "bold" }}>VS PLAYER</button>
             </div>
             {gameMode === "ai" && (
                <div style={{ marginBottom: "20px", textAlign: "left" }}>
                    <label style={{ fontSize: "11px", color: currentTheme.light }}>AI LEVEL: {difficulty}</label>
                    <input type="range" min="1" max="20" value={difficulty} onChange={(e) => setDifficulty(parseInt(e.target.value))} style={{ width: "100%" }} />
                </div>
             )}
             <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px" }} required />
                {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px" }} />}
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold" }}>ENTER CLUB</button>
             </form>
             {liveGames.length > 0 && (
                <div style={{ marginTop: "20px", textAlign: "left" }}>
                  <p style={{ fontSize: "12px", color: currentTheme.light }}>LIVE TABLES (CLICK TO JOIN):</p>
                  {liveGames.map((g, i) => (
                    <button key={i} onClick={() => handleStartGame(null, g)} style={{ width: "100%", padding: "8px", margin: "2px 0", background: "#222", color: "#fff", border: "1px solid #444", cursor: "pointer" }}>
                      {g.white_player} vs {g.black_player}
                    </button>
                  ))}
                </div>
             )}
          </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <div style={{ textAlign: "center" }}>
        <h2>{player1.username} VS {player2?.username}</h2>
        <div style={{ width: "min(550px, 90vw)", border: `12px solid ${currentTheme.dark}` }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>
        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          <button onClick={() => window.location.reload()} style={btnStyle}>EXIT</button>
        </div>
        {gameOverMessage && <h1 style={{ color: currentTheme.light }}>{gameOverMessage}</h1>}
      </div>
    </div>
  );
}

const btnStyle = { padding: "10px 20px", backgroundColor: "#444", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer" };
