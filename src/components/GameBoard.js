"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../lib/supabase";

export default function GameBoard({ themeKey, assignedRole, setAssignedRole }) {
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [gameMode, setGameMode] = useState("ai");
  const [difficulty, setDifficulty] = useState(10);
  const [inputs, setInputs] = useState({ p1: "", p2: "" });
  const [treasury, setTreasury] = useState([]);
  const [liveGames, setLiveGames] = useState([]); 
  const [game, setGame] = useState(new Chess());
  const [dbHistory, setDbHistory] = useState([]);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState(null);
  const [isJoining, setIsJoining] = useState(false);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" },
    moana: { name: "Moana Ocean Adventure", light: "rgb(96, 255, 5)", dark: "rgb(2, 97, 1)", path: "/themes/moana/pieces/", audioPath: "/themes/moana/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  useEffect(() => {
    if (audioUnlocked) {
      if (bgMusic.current) bgMusic.current.pause();
      bgMusic.current = new Audio(`${currentTheme.audioPath}theme.mp3`);
      bgMusic.current.loop = true;
      bgMusic.current.volume = 0.3;
      bgMusic.current.play().catch(e => console.log("Music error:", e));
    }
    return () => { if (bgMusic.current) bgMusic.current.pause(); };
  }, [audioUnlocked, themeKey]);

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

  useEffect(() => {
    if (player1 && player2 && gameMode === "pvp") {
      const channel = supabase
        .channel('game-updates')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, (payload) => {
            if (payload.new.fen !== game.fen()) {
              setGame(new Chess(payload.new.fen));
              setDbHistory(payload.new.move_history || []);
              playSound("move.mp3");
            }
          }
        ).subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [player1, player2, game]);

  const playSound = (f) => { 
    if (!audioUnlocked) return;
    const audio = new Audio(`${currentTheme.audioPath}${f}`);
    audio.play().catch(e => console.log("Sound error:", e));
  };

  async function onDrop(source, target) {
    // --- PIECE COLOR LOCK ---
    // If it's PvP, check if the piece color belongs to the player
    if (gameMode === "pvp") {
      const piece = game.get(source);
      if (piece && piece.color !== assignedRole) {
        return false; // Prevent move
      }
    }

    try {
      const gameCopy = new Chess(game.fen());
      const turnBefore = gameCopy.turn();
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      
      const newFen = gameCopy.fen();
      const updatedHistory = [...dbHistory, move.san];
      
      setGame(gameCopy);
      setDbHistory(updatedHistory); 
      
      if (move.captured) {
        playSound(turnBefore === 'w' ? "black_capture.mp3" : "white_capture.mp3");
      } else {
        playSound("move.mp3");
      }

      if (gameMode === "pvp") {
        await supabase.from('games').update({ 
          fen: newFen,
          move_history: updatedHistory,
          turn: gameCopy.turn()
        })
        .or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
      }
      return true;
    } catch (e) { return false; }
  }

  const handleResumeActiveGame = async (activeGame, role) => {
    setAudioUnlocked(true);
    setGameMode("pvp");
    setAssignedRole(role === "white" ? "w" : "b"); // Lock player to 'w' or 'b'
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

  const handleStartGame = async (e) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true); 
    setAssignedRole("w"); // Starter is always white
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
        if (!g) {
          await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen(), move_history: [], turn: 'w' }]);
        }
        setPlayer2({ username: p2 });
      } else { setPlayer2({ username: "Stockfish AI" }); }
    } finally { setIsJoining(false); }
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
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold" }}>ENTER CLUB</button>
              </form>
          </div>
          <div style={{ width: "400px", textAlign: "left" }}>
            <h2 style={{ color: currentTheme.light, borderBottom: `2px solid ${currentTheme.light}` }}>ACTIVE GAMES</h2>
            <div style={{ height: "300px", overflowY: "auto", marginTop: "10px" }}>
              {liveGames.map((g, i) => (
                <div key={i} style={{ background: "#111", padding: "15px", marginBottom: "10px", borderRadius: "10px", borderLeft: `5px solid ${currentTheme.light}` }}>
                  <p style={{ fontWeight: "bold" }}>{g.white_player} vs {g.black_player}</p>
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <button onClick={() => handleResumeActiveGame(g, "white")} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "#fff", color: "#000" }}>Join as {g.white_player}</button>
                    <button onClick={() => handleResumeActiveGame(g, "black")} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "#444", color: "#fff" }}>Join as {g.black_player}</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <div style={{ margin: "0 40px", textAlign: "center" }}>
        <h2 style={{ marginBottom: "20px" }}>{player1.username} ({assignedRole === 'w' ? 'White' : 'Black'}) VS {player2?.username}</h2>
        <div style={{ width: "min(550px, 90vw)", border: `12px solid ${currentTheme.dark}`, borderRadius: "5px" }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            boardOrientation={assignedRole === 'w' ? 'white' : 'black'}
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>
        <button onClick={() => window.location.reload()} style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#444", color: "white", border: "none" }}>EXIT</button>
      </div>
    </div>
  );
}
