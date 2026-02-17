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
  const [dbHistory, setDbHistory] = useState([]); // Explicitly sync with DB
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
            // Update the board and history only if it's different from our current state
            if (payload.new.fen !== game.fen()) {
              const newGame = new Chess(payload.new.fen);
              setGame(newGame);
              setDbHistory(payload.new.move_history || []);
              playSound("move.mp3");
            }
          }
        )
        .subscribe();

      return () => supabase.removeChannel(channel);
    }
  }, [player1, player2, game.fen()]);

  const playSound = (f) => { 
    if (!audioUnlocked) return;
    const audio = new Audio(`${currentTheme.audioPath}${f}`);
    audio.play().catch(e => console.log("Sound error:", e));
  };

  // --- HANDLERS ---
  async function onDrop(source, target) {
    try {
      const gameCopy = new Chess(game.fen());
      const turnBefore = gameCopy.turn();
      const move = gameCopy.move({ from: source, target, promotion: "q" });
      if (!move) return false;
      
      const newFen = gameCopy.fen();
      const newHistory = [...dbHistory, move.san];

      setGame(gameCopy);
      setDbHistory(newHistory);
      setOptionSquares({});
      
      if (move.captured) {
        playSound(turnBefore === 'w' ? "black_capture.mp3" : "white_capture.mp3");
      } else {
        playSound("move.mp3");
      }

      if (gameMode === "pvp") {
        // Find exact row using both player names
        await supabase.from('games').update({ 
          fen: newFen,
          move_history: newHistory 
        })
        .or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
      }
      return true;
    } catch (e) { return false; }
  }

  const handleResumeActiveGame = async (activeGame, role) => {
    setAudioUnlocked(true);
    setGameMode("pvp");
    
    // Force set the game to the saved FEN immediately
    const loadedGame = new Chess(activeGame.fen);
    setGame(loadedGame);
    setDbHistory(activeGame.move_history || []);
    
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
          const freshGame = new Chess();
          await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: freshGame.fen(), move_history: [] }]);
          setGame(freshGame);
          setDbHistory([]);
          fetchData();
        }
        setPlayer2({ username: p2 });
      } else { 
        setPlayer2({ username: "Stockfish AI" }); 
      }
    } catch(err) { console.error(err); }
  };

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

  if (!player1) {
    return (
      <div onClick={() => setAudioUnlocked(true)} style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ color: currentTheme.light }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", margin: "40px 0" }}>
          <div style={{ background: "#111", padding: "20px", border: `2px solid ${currentTheme.light}`, width: "350px" }}>
            <div style={{ display: "flex", gap: "5px", marginBottom: "15px" }}>
              <button onClick={() => setGameMode("ai")} style={{ flex: 1, background: gameMode === "ai" ? currentTheme.light : "#333" }}>AI</button>
              <button onClick={() => setGameMode("pvp")} style={{ flex: 1, background: gameMode === "pvp" ? currentTheme.light : "#333" }}>PVP</button>
            </div>
            <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Your Name" value={inputs.p1} onChange={e => setInputs({...inputs, p1: e.target.value})} required />
              {gameMode === "pvp" && <input placeholder="Opponent" value={inputs.p2} onChange={e => setInputs({...inputs, p2: e.target.value})} />}
              <button type="submit">GO</button>
            </form>
          </div>
          <div style={{ width: "350px", textAlign: "left" }}>
            <h3>ACTIVE GAMES</h3>
            {liveGames.map((g, i) => (
              <div key={i} style={{ background: "#222", padding: "10px", marginBottom: "5px" }}>
                <p>{g.white_player} vs {g.black_player}</p>
                <button onClick={() => handleResumeActiveGame(g, "white")}>White</button>
                <button onClick={() => handleResumeActiveGame(g, "black")}>Black</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "40px", background: "#000", color: "#fff" }}>
      <div style={{ textAlign: "center" }}>
        <h2>{player1.username} vs {player2.username}</h2>
        <div style={{ width: "500px" }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>
        <div style={{ marginTop: "20px", background: "#111", padding: "10px", height: "80px", overflowY: "auto" }}>
          {dbHistory.map((m, i) => (
            <span key={i} style={{ marginRight: "10px" }}>{i % 2 === 0 ? `${Math.floor(i/2)+1}.` : ""}{m}</span>
          ))}
        </div>
        <button onClick={() => window.location.reload()}>EXIT</button>
      </div>
    </div>
  );
}
