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
  const [gameOverMessage, setGameOverMessage] = useState(null);
  const [currentGameId, setCurrentGameId] = useState(null);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  // --- REALTIME: SYNC CURRENT POSITION ---
  useEffect(() => {
    if (!currentGameId) return;

    const channel = supabase
      .channel(`room-${currentGameId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'games',
        filter: `id=eq.${currentGameId}` 
      }, (payload) => {
        // If the FEN in the DB is different than our local board, update it
        if (payload.new.fen !== game.fen()) {
          setGame(new Chess(payload.new.fen));
          playSound("move.mp3");
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    const interval = setInterval(fetchData, 5000); // Faster polling for lobby
    return () => clearInterval(interval);
  }, []);

  const playSound = (f) => { 
    if (!audioUnlocked) return;
    new Audio(`${currentTheme.audioPath}${f}`).play().catch(() => {});
  };

  // --- HANDLERS ---
  const handleStartGame = async (e, selectedGame = null) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true);

    const p1Name = inputs.p1.toLowerCase().trim();
    if (!p1Name) return alert("Please enter your name first!");

    // 1. Authenticate User
    let { data: user } = await supabase.from('treasury').select('*').eq('username', p1Name).maybeSingle();
    if (!user) {
      const { data: newUser } = await supabase.from('treasury').insert([{ username: p1Name, coins: 50 }]).select().single();
      user = newUser;
    }
    setPlayer1(user);

    // 2. Load Position Logic
    if (selectedGame) {
      // JOINING: Update mode and ID first
      setGameMode("pvp");
      setCurrentGameId(selectedGame.id);
      
      // CRITICAL: Initialize the board with the position from the table
      const loadedGame = new Chess(selectedGame.fen);
      setGame(loadedGame);

      // Identify opponent
      const opponent = selectedGame.white_player === p1Name ? selectedGame.black_player : selectedGame.white_player;
      setPlayer2({ username: opponent });

    } else if (gameMode === "pvp") {
      // NEW PVP GAME
      const p2Name = inputs.p2.toLowerCase().trim();
      const { data: newGame } = await supabase.from('games').insert([
        { white_player: p1Name, black_player: p2Name, fen: new Chess().fen() }
      ]).select().single();
      
      setCurrentGameId(newGame.id);
      setGame(new Chess());
      setPlayer2({ username: p2Name });
    } else {
      // VS AI
      setPlayer2({ username: "Stockfish AI" });
      setGame(new Chess());
    }
  };

  async function onDrop(source, target) {
    const gameCopy = new Chess(game.fen());
    const turn = gameCopy.turn(); // 'w' or 'b'

    // PVP Security: Are you the right player for this turn?
    if (gameMode === "pvp" && currentGameId) {
        const { data: activeGame } = await supabase.from('games').select('*').eq('id', currentGameId).single();
        const turnName = turn === 'w' ? activeGame.white_player : activeGame.black_player;
        
        if (player1.username !== turnName) {
            alert(`It is ${turnName}'s turn!`);
            return false;
        }
    }

    try {
      const move = gameCopy.move({ from: source, to: target, promotion: "q" });
      if (!move) return false;
      
      setGame(gameCopy);
      playSound(move.captured ? "white_capture.mp3" : "move.mp3");

      if (gameMode === "pvp" && currentGameId) {
        // Push the new position to Supabase immediately
        await supabase.from('games').update({ fen: gameCopy.fen() }).eq('id', currentGameId);
      }
      return true;
    } catch (e) { return false; }
  }

  // --- ENGINE WORKER (Preserved) ---
  useEffect(() => {
    stockfish.current = new Worker('/stockfish.js');
    stockfish.current.onmessage = (e) => {
      if (e.data.startsWith("bestmove") && gameMode === "ai") {
        const moveStr = e.data.split(" ")[1];
        const next = new Chess(game.fen());
        next.move({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
        setGame(next);
      }
    };
    return () => stockfish.current?.terminate();
  }, [gameMode, game.fen()]);

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

  // --- UI: LOBBY ---
  if (!player1) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "40px", textAlign: "center" }}>
        <h1 style={{ color: currentTheme.light }}>TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "center", gap: "20px", marginTop: "30px" }}>
          
          <div style={{ width: "350px", padding: "20px", background: "#111", border: `2px solid ${currentTheme.light}`, borderRadius: "10px" }}>
            <h3>START NEW</h3>
            <div style={{ marginBottom: "15px" }}>
              <button onClick={() => setGameMode("ai")} style={{ background: gameMode === "ai" ? currentTheme.light : "#333", width: "50%" }}>AI</button>
              <button onClick={() => setGameMode("pvp")} style={{ background: gameMode === "pvp" ? currentTheme.light : "#333", width: "50%" }}>PVP</button>
            </div>
            <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <input placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "10px" }} required />
              {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "10px" }} />}
              <button type="submit" style={{ background: currentTheme.light, color: "#000", fontWeight: "bold", padding: "10px" }}>GO</button>
            </form>
          </div>

          <div style={{ width: "450px", background: "#111", padding: "20px", borderRadius: "10px" }}>
            <h3 style={{ color: currentTheme.light }}>LIVE TABLES</h3>
            <table style={{ width: "100%", textAlign: "left" }}>
              <thead>
                <tr style={{ color: "#666", fontSize: "12px" }}>
                  <th>White</th>
                  <th>Black</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {liveGames.map((g) => (
                  <tr key={g.id} style={{ borderBottom: "1px solid #222" }}>
                    <td>{g.white_player}</td>
                    <td>{g.black_player}</td>
                    <td>
                      <button onClick={() => handleStartGame(null, g)} style={{ color: currentTheme.light, border: "none", background: "none", cursor: "pointer" }}>
                        JOIN MATCH
                      </button>
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

  // --- UI: GAME ---
  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "40px", textAlign: "center" }}>
      <h2>{player1.username} vs {player2.username}</h2>
      <div style={{ width: "500px", margin: "0 auto", border: `10px solid ${currentTheme.dark}` }}>
        <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
        />
      </div>
      <button onClick={() => window.location.reload()} style={{ marginTop: "20px" }}>EXIT</button>
    </div>
  );
}
