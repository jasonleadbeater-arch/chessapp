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
  const [liveGames, setLiveGames] = useState([]); // NEW: State for the Active Games list
  const [game, setGame] = useState(new Chess());
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
    // Fetch members
    const { data: m } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (m) setTreasury(m);
    
    // NEW: Fetch active games from the 'games' table
    const { data: g } = await supabase.from('games').select('*').order('created_at', { ascending: false });
    if (g) setLiveGames(g);
  };

  useEffect(() => { 
    fetchData(); 
    const interval = setInterval(fetchData, 10000); // Auto-refresh lobby every 10s
    return () => clearInterval(interval);
  }, []);

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

  // --- DOTS / LEGAL MOVES ---
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

  // --- REALTIME SYNC ---
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

  // --- HANDLERS (With History Recording) ---
  async function onDrop(source, target) {
    try {
      const gameCopy = new Chess(game.fen());
      const turnBefore = gameCopy.turn();
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      
      setGame(gameCopy);
      setOptionSquares({});
      
      if (move.captured) {
        playSound(turnBefore === 'w' ? "black_capture.mp3" : "white_capture.mp3");
      } else {
        playSound("move.mp3");
      }

      if (gameMode === "pvp") {
        const { data: currentData } = await supabase
          .from('games')
          .select('move_history')
          .or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`)
          .single();

        const updatedHistory = [...(currentData?.move_history || []), move.san];

        await supabase.from('games').update({ 
          fen: gameCopy.fen(),
          move_history: updatedHistory 
        })
        .or(`and(white_player.eq.${player1.username},black_player.eq.${player2?.username}),and(white_player.eq.${player2?.username},black_player.eq.${player1.username})`);
      }
      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  // NEW: Handler for joining an existing game as a specific role
  const handleResumeActiveGame = async (activeGame, role) => {
    setAudioUnlocked(true);
    setGameMode("pvp");
    setGame(new Chess(activeGame.fen));
    
    if (role === "white") {
      setPlayer1({ username: activeGame.white_player });
      setPlayer2({ username: activeGame.black_player });
    } else {
      setPlayer1({ username: activeGame.black_player });
      setPlayer2({ username: activeGame.white_player });
    }
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
        } else {
          await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen(), move_history: [] }]);
          fetchData(); // Update the active games list
        }
        setPlayer2({ username: p2 });
      } else { setPlayer2({ username: "Stockfish AI" }); }
    } finally { setIsJoining(false); }
  };

  // --- THEME MUSIC ---
  useEffect(() => {
    if (!audioUnlocked) return;
    if (bgMusic.current) { bgMusic.current.pause(); bgMusic.current.src = ""; }
    const musicPath = `${currentTheme.audioPath}theme.mp3`;
    bgMusic.current = new Audio(musicPath);
    bgMusic.current.loop = true;
    bgMusic.current.volume = 0.3;
    bgMusic.current.play().catch(() => console.log("Autoplay blocked."));
    return () => { if (bgMusic.current) bgMusic.current.pause(); };
  }, [themeKey, audioUnlocked]);

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

  const { whiteCaptured, blackCaptured } = getCapturedPieces();

  // --- LOBBY UI ---
  if (!player1) {
    return (
      <div onClick={unlockAudio} style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ fontSize: "3rem", color: currentTheme.light, letterSpacing: "4px" }}>THE TREASURE CHESS CLUB</h1>
        
        <div style={{ display: "flex", justifyContent: "center", gap: "40px", flexWrap: "wrap", margin: "40px 0" }}>
          {/* LOGIN BOX */}
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", fontWeight: "bold" }}>VS AI</button>
                <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", fontWeight: "bold" }}>VS PLAYER</button>
              </div>
              <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} required />
                {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} />}
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold" }}>ENTER CLUB</button>
              </form>
          </div>

          {/* ACTIVE GAMES LIST */}
          <div style={{ width: "400px", textAlign: "left" }}>
            <h2 style={{ color: currentTheme.light, borderBottom: `2px solid ${currentTheme.light}` }}>ACTIVE GAMES</h2>
            <div style={{ height: "300px", overflowY: "auto", marginTop: "10px" }}>
              {liveGames.length === 0 && <p style={{ color: "#666" }}>No games in progress...</p>}
              {liveGames.map((g, i) => (
                <div key={i} style={{ background: "#111", padding: "15px", marginBottom: "10px", borderRadius: "10px", borderLeft: `5px solid ${currentTheme.light}` }}>
                  <p style={{ fontWeight: "bold", marginBottom: "10px" }}>{g.white_player} vs {g.black_player}</p>
                  <div style={{ display: "flex", gap: "10px" }}>
                    <button onClick={() => handleResumeActiveGame(g, "white")} style={{ padding: "5px 10px", fontSize: "12px", backgroundColor: "#fff", color: "#000", cursor: "pointer" }}>Join as {g.white_player}</button>
                    <button onClick={() => handleResumeActiveGame(g, "black")} style={{ padding: "5px 10px", fontSize: "12px", backgroundColor: "#444", color: "#fff", cursor: "pointer" }}>Join as {g.black_player}</button>
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

  // --- GAME UI ---
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <div style={{ width: "80px", display: "flex", flexDirection: "column", gap: "5px", alignItems: "center", background: "#111", padding: "10px", borderRadius: "10px" }}>
        <p style={{ fontSize: "10px", color: "#666" }}>LOST</p>
        {blackCaptured.map((p, i) => <img key={i} src={`${currentTheme.path}w${p.toLowerCase()}.png`} style={{ width: "30px" }} alt="lost" />)}
      </div>

      <div style={{ margin: "0 40px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "20px" }}>{player1.username} VS {player2?.username}</h2>
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
        
        <div style={{ marginTop: "20px", height: "100px", overflowY: "auto", background: "#111", padding: "10px", fontSize: "12px", textAlign: "left", border: `1px solid ${currentTheme.dark}`, borderRadius: "5px" }}>
          <p style={{ color: "#666", marginBottom: "5px" }}>MOVE HISTORY</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            {game.history().map((m, i) => (
              <span key={i} style={{ color: i % 2 === 0 ? "#fff" : currentTheme.light }}>
                {i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ""}{m}
              </span>
            ))}
          </div>
        </div>

        <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "center" }}>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", backgroundColor: "#444", border: "none", borderRadius: "5px", color: "white", fontWeight: "bold", cursor: "pointer" }}>EXIT</button>
        </div>
      </div>

      <div style={{ width: "80px", display: "flex", flexDirection: "column", gap: "5px", alignItems: "center", background: "#111", padding: "10px", borderRadius: "10px" }}>
        <p style={{ fontSize: "10px", color: "#666" }}>LOST</p>
        {whiteCaptured.map((p, i) => <img key={i} src={`${currentTheme.path}b${p.toLowerCase()}.png`} style={{ width: "30px" }} alt="lost" />)}
      </div>
    </div>
  );
}
