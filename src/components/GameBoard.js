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
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [currentGameId, setCurrentGameId] = useState(null);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  // --- THEMES CONFIGURATION ---
  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" },
    // New Moana Theme Added Here
    moana: { name: "Moana Ocean Adventure", light: "#00ced1", dark: "#008b8b", path: "/themes/moana/pieces/", audioPath: "/themes/moana/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  // --- REALTIME: LISTEN FOR OPPONENT MOVES ---
  useEffect(() => {
    if (currentGameId) {
      const channel = supabase
        .channel(`game-${currentGameId}`)
        .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'games',
            filter: `id=eq.${currentGameId}` 
        }, (payload) => {
          if (payload.new.fen !== game.fen()) {
            setGame(new Chess(payload.new.fen));
            playSound("move.mp3");
          }
        })
        .subscribe();

      return () => { supabase.removeChannel(channel); };
    }
  }, [currentGameId, game]);

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

  const playSound = (f) => { 
    if (!audioUnlocked) return;
    new Audio(`${currentTheme.audioPath}${f}`).play().catch(() => {});
  };

  // --- ENGINE SETUP ---
  useEffect(() => {
    stockfish.current = new Worker('/stockfish.js');
    stockfish.current.onmessage = (e) => {
      if (e.data.startsWith("bestmove") && gameMode === "ai") {
        const moveStr = e.data.split(" ")[1];
        setGame((prev) => {
          const next = new Chess(prev.fen());
          next.move({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
          return next;
        });
      }
    };
    return () => stockfish.current?.terminate();
  }, [gameMode]);

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver()) {
      stockfish.current?.postMessage(`setoption name Skill Level value ${difficulty}`);
      stockfish.current?.postMessage(`position fen ${game.fen()}`);
      stockfish.current?.postMessage(`go depth 10`);
    }
  }, [game]);

  // --- HANDLERS ---
  const handleStartGame = async (e, existingGame = null) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true);
    const p1Name = inputs.p1.toLowerCase().trim();
    if (!p1Name) return alert("Please enter your name first!");

    let { data: user } = await supabase.from('treasury').select('*').eq('username', p1Name).maybeSingle();
    if (!user) {
      const { data: newUser } = await supabase.from('treasury').insert([{ username: p1Name, coins: 50 }]).select().single();
      user = newUser;
    }
    setPlayer1(user);

    if (existingGame) {
      setGameMode("pvp");
      setCurrentGameId(existingGame.id);
      
      // CRITICAL: Initialize the board with the current position from the table
      const loadedBoard = new Chess(existingGame.fen);
      setGame(loadedBoard); 

      const isWhite = existingGame.white_player === p1Name;
      setPlayer2({ username: isWhite ? existingGame.black_player : existingGame.white_player });
    } else if (gameMode === "pvp") {
      const p2Name = inputs.p2.toLowerCase().trim();
      const { data: newGame } = await supabase.from('games').insert([
        { white_player: p1Name, black_player: p2Name, fen: new Chess().fen() }
      ]).select().single();
      setCurrentGameId(newGame.id);
      setGame(new Chess()); 
      setPlayer2({ username: p2Name });
    } else {
      setPlayer2({ username: "Stockfish AI" });
      setGame(new Chess());
    }
  };

  async function onDrop(source, target) {
    const gameCopy = new Chess(game.fen());
    const turn = gameCopy.turn();
    
    if (gameMode === "pvp") {
        const { data: activeGame } = await supabase.from('games').select('*').eq('id', currentGameId).single();
        const authorizedUser = turn === 'w' ? activeGame.white_player : activeGame.black_player;
        if (player1.username !== authorizedUser) {
            alert(`Wait! It is ${authorizedUser}'s turn.`);
            return false;
        }
    }

    try {
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      
      setGame(gameCopy);
      playSound(move.captured ? (turn === 'w' ? "white_capture.mp3" : "black_capture.mp3") : "move.mp3");

      if (gameMode === "pvp" && currentGameId) {
        await supabase.from('games').update({ fen: gameCopy.fen() }).eq('id', currentGameId);
      }
      return true;
    } catch (e) { return false; }
  }

  // --- PIECE MAPPING ---
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

  // --- LOBBY UI ---
  if (!player1) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "40px", textAlign: "center" }}>
        <h1 style={{ color: currentTheme.light, textTransform: "uppercase", letterSpacing: "2px" }}>The Treasure Chess Club</h1>
        <div style={{ display: "flex", justifyContent: "center", gap: "40px", flexWrap: "wrap", marginTop: "30px" }}>
          <div style={{ width: "400px", padding: "30px", background: "#111", borderRadius: "15px", border: `2px solid ${currentTheme.light}` }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", background: gameMode === "ai" ? currentTheme.light : "#333", color: gameMode === "ai" ? "#000" : "#fff", border: "none", fontWeight: "bold", cursor: "pointer" }}>VS AI</button>
              <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", background: gameMode === "pvp" ? currentTheme.light : "#333", color: gameMode === "pvp" ? "#000" : "#fff", border: "none", fontWeight: "bold", cursor: "pointer" }}>VS PLAYER</button>
            </div>
            <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Enter Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} required />
              {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} />}
              <button type="submit" style={{ padding: "15px", background: currentTheme.light, color: "#000", fontWeight: "bold", border: "none", borderRadius: "5px", cursor: "pointer" }}>START ADVENTURE</button>
            </form>
          </div>
          <div style={{ width: "500px", background: "#111", padding: "20px", borderRadius: "15px", border: "1px solid #333" }}>
            <h3 style={{ color: currentTheme.light, marginTop: 0 }}>LIVE TABLES</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #333", color: "#666" }}>
                  <th style={{ padding: "10px", textAlign: "left" }}>White</th>
                  <th style={{ padding: "10px", textAlign: "left" }}>Black</th>
                  <th style={{ padding: "10px", textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {liveGames.map((g) => (
                  <tr key={g.id} style={{ borderBottom: "1px solid #222" }}>
                    <td style={{ padding: "10px" }}>{g.white_player}</td>
                    <td style={{ padding: "10px" }}>{g.black_player}</td>
                    <td style={{ padding: "10px", textAlign: "right" }}>
                      <button onClick={() => handleStartGame(null, g)} style={{ padding: "5px 15px", background: "transparent", border: `1px solid ${currentTheme.light}`, color: currentTheme.light, cursor: "pointer", borderRadius: "3px" }}>JOIN</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // --- GAME UI ---
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", textAlign: "center", padding: "40px" }}>
      <h2 style={{ color: currentTheme.light }}>{player1.username} vs {player2.username}</h2>
      <div style={{ width: "550px", margin: "0 auto", border: `12px solid ${currentTheme.dark}`, borderRadius: "8px", boxShadow: "0 0 20px rgba(0,0,0,0.5)" }}>
        <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
        />
      </div>
      <button onClick={() => window.location.reload()} style={{ marginTop: "30px", padding: "10px 30px", background: "#333", color: "#fff", border: "none", borderRadius: "5px", cursor: "pointer" }}>RETURN TO LOBBY</button>
    </div>
  );
}
