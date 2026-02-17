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
  const [dbHistory, setDbHistory] = useState([]); // NEW: To keep DB moves and local moves in sync
  const [optionSquares, setOptionSquares] = useState({});
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  // --- THEMES ---
  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" },
    moana: { name: "Moana Ocean Adventure", light: "rgb(96, 255, 5)", dark: "rgb(2, 97, 1)", path: "/themes/moana/pieces/", audioPath: "/themes/moana/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  // --- DATA FETCHING ---
  const fetchData = async () => {
    const { data: m } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (m) setTreasury(m);
    const { data: g } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (g) setLiveGames(g);
  };

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 10000); 
    return () => clearInterval(interval);
  }, []);

  // --- REALTIME SYNC (Updated to sync History too) ---
  useEffect(() => {
    if (player1 && player2 && gameMode === "pvp") {
      const channel = supabase
        .channel('game-updates')
        .on(
          'postgres_changes',
          { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'games',
            filter: `white_player=eq.${player1.username},black_player=eq.${player2.username}`
          },
          (payload) => {
            if (payload.new.fen !== game.fen()) {
              setGame(new Chess(payload.new.fen));
              setDbHistory(payload.new.move_history || []); // Sync history
              playSound("move.mp3");
            }
          }
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    }
  }, [player1, player2, game]);

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

  // --- STOCKFISH ENGINE ---
  useEffect(() => {
    stockfish.current = new Worker('/stockfish.js');
    stockfish.current.onmessage = (e) => {
      if (e.data.startsWith("bestmove") && gameMode === "ai") {
        const moveStr = e.data.split(" ")[1];
        setGame((prev) => {
            const next = new Chess(prev.fen());
            const m = next.move({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
            if (m?.captured) playSound("white_capture.mp3");
            else playSound("move.mp3");
            checkGameOver(next);
            return next;
        });
      }
    };
    return () => stockfish.current?.terminate();
  }, [gameMode, themeKey]); 

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === "b" && !game.isGameOver()) {
      stockfish.current.postMessage(`position fen ${game.fen()}`);
      stockfish.current.postMessage(`go depth ${difficulty}`);
    }
  }, [game, gameMode, difficulty]);

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = "";
    if (gameInstance.isCheckmate()) {
      const winnerColor = gameInstance.turn() === 'w' ? 'b' : 'w';
      const winName = winnerColor === 'w' ? player1?.username : player2?.username;
      const loseName = winnerColor === 'w' ? player2?.username : player1?.username;
      msg = `${winName} Wins! (+3 🪙)`;
      await updateCoins(winName, 3); await updateCoins(loseName, -3);
    } else {
      msg = "Draw! (+1 🪙)";
      await updateCoins(player1?.username, 1); await updateCoins(player2?.username, 1);
    }
    setGameOverMessage(msg);
  };

  // --- HANDLERS ---
  async function onDrop(source, target) {
    try {
      const gameCopy = new Chess(game.fen());
      const turnBefore = gameCopy.turn();
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      
      const newFen = gameCopy.fen();
      const updatedHistory = [...dbHistory, move.san];
      
      setGame(gameCopy);
      setDbHistory(updatedHistory); 
      setOptionSquares({});
      
      if (move.captured) {
        playSound(turnBefore === 'w' ? "black_capture.mp3" : "white_capture.mp3");
      } else {
        playSound("move.mp3");
      }

      if (gameMode === "pvp") {
        await supabase.from('games').update({ 
          fen: newFen,
          move_history: updatedHistory 
        })
        .or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
      }
      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  const handleResumeActiveGame = async (activeGame, role) => {
    setAudioUnlocked(true);
    setGameMode("pvp");
    setGame(new Chess(activeGame.fen));
    setDbHistory(activeGame.move_history || []);
    
    if (role === "white") {
      setPlayer1({ username: activeGame.white_player });
      setPlayer2({ username: activeGame.black_player });
    } else {
      setPlayer1({ username: activeGame.black_player });
      setPlayer2({ username: activeGame.white_player });
    }
  };

  const handleDeleteGame = async (gameId) => {
    if (!window.confirm("Are you sure you want to delete this game?")) return;
    const { error } = await supabase.from('games').delete().eq('id', gameId);
    if (!error) fetchData();
  };

  const handleStartGame = async (e) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true); 
    const p1 = inputs.p1.toLowerCase().trim();
    const p2 = inputs.p2.toLowerCase().trim();
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
        if (g) {
          setGame(new Chess(g.fen));
          setDbHistory(g.move_history || []);
        } else {
          await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen(), move_history: [] }]);
          setDbHistory([]);
          fetchData();
        }
        setPlayer2({ username: p2 });
      } else { setPlayer2({ username: "Stockfish AI" }); }
    } finally { setIsJoining(false); }
  };

  const unlockAudio = () => { if (!audioUnlocked) setAudioUnlocked(true); };

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

  // --- UI RENDER ---
  if (!player1) {
    return (
      <div onClick={unlockAudio} style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", color: currentTheme.light, letterSpacing: "4px" }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "center", gap: "40px", flexWrap: "wrap", margin: "40px 0" }}>
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", fontWeight: "bold" }}>VS AI</button>
                <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", fontWeight: "bold" }}>VS PLAYER</button>
              </div>
              <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} required />
                {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} />}
                
                {/* NEW: Depth selector added here for VS AI mode */}
                {gameMode === "ai" && (
                  <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={{ fontSize: "12px", color: currentTheme.light }}>AI DEPTH: {difficulty}</label>
                    <input 
                      type="range" min="1" max="20" 
                      value={difficulty} 
                      onChange={(e) => setDifficulty(parseInt(e.target.value))} 
                      style={{ cursor: "pointer" }}
                    />
                  </div>
                )}

                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold" }}>ENTER CLUB</button>
              </form>
          </div>
          <div style={{ width: "400px", textAlign: "left" }}>
            <h2 style={{ color: currentTheme.light, borderBottom: `2px solid ${currentTheme.light}` }}>ACTIVE GAMES</h2>
            <div style={{ height: "300px", overflowY: "auto", marginTop: "10px" }}>
              {liveGames.length === 0 && <p style={{ color: "#666" }}>No games in progress...</p>}
              {liveGames.map((g, i) => (
                <div key={i} style={{ background: "#111", padding: "15px", marginBottom: "10px", borderRadius: "10px", borderLeft: `5px solid ${currentTheme.light}`, position: "relative" }}>
                  <button onClick={() => handleDeleteGame(g.id)} style={{ position: "absolute", top: "10px", right: "10px", background: "none", border: "none", color: "#600", cursor: "pointer", fontSize: "16px", fontWeight: "bold" }}>✕</button>
                  <p style={{ fontWeight: "bold", marginBottom: "10px" }}>{g.white_player} vs {g.black_player}</p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => handleResumeActiveGame(g, "white")} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "#fff", color: "#000", cursor: "pointer" }}>Join as {g.white_player}</button>
                    <button onClick={() => handleResumeActiveGame(g, "black")} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "#444", color: "#fff", cursor: "pointer" }}>Join as {g.black_player}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <div style={{ width: "80px", textAlign: "center", background: "#111", padding: "10px", borderRadius: "10px" }}>
        <p style={{ fontSize: "10px", color: "#666" }}>LOST</p>
      </div>

      <div style={{ margin: "0 40px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "20px" }}>{player1.username} VS {player2?.username}</h2>
        <div style={{ width: "min(550px, 90vw)", border: `12px solid ${currentTheme.dark}`, borderRadius: "5px" }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>
        
        <div style={{ marginTop: "20px", height: "100px", overflowY: "auto", background: "#111", padding: "10px", fontSize: "12px", textAlign: "left", border: `1px solid ${currentTheme.dark}` }}>
          <p style={{ color: "#666", marginBottom: "5px" }}>MOVE HISTORY</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {dbHistory.map((m, i) => (
              <span key={i} style={{ color: i % 2 === 0 ? "#fff" : currentTheme.light }}>
                {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}{m}
              </span>
            ))}
          </div>
        </div>
        <button onClick={() => window.location.reload()} style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#444", color: "white", border: "none", cursor: "pointer" }}>EXIT</button>
      </div>
    </div>
  );
}
