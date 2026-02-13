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
  const [liveGames, setLiveGames] = useState([]); // Lobby State
  const [game, setGame] = useState(new Chess());
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

  // --- 1. TREASURY & LOBBY FETCH ---
  const fetchData = async () => {
    // Fetch Members
    const { data: members } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (members) setTreasury(members);
    
    // Fetch Live Games for the Lobby
    const { data: games } = await supabase.from('games').select('*').limit(10);
    if (games) setLiveGames(games);
  };

  useEffect(() => {
    fetchData();
    // Refresh lobby every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- 2. COIN SCORING LOGIC ---
  const updateCoins = async (username, diff) => {
    if (!username || username === "Stockfish AI") return;
    const { data } = await supabase.from('treasury').select('coins').eq('username', username).single();
    if (data) {
      const newTotal = Math.max(0, (data.coins || 0) + diff);
      await supabase.from('treasury').update({ coins: newTotal }).eq('username', username);
    }
  };

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = "";
    if (gameInstance.isCheckmate()) {
      const winnerColor = gameInstance.turn() === 'w' ? 'b' : 'w';
      const winner = winnerColor === 'w' ? player1?.username : player2?.username;
      const loser = winnerColor === 'w' ? player2?.username : player1?.username;
      msg = `${winner} Wins! (+3 🪙)`;
      await updateCoins(winner, 3);
      await updateCoins(loser, -3);
    } else {
      msg = "Draw! (+1 🪙)";
      await updateCoins(player1?.username, 1);
      await updateCoins(player2?.username, 1);
    }
    setGameOverMessage(msg);
    fetchData();
  };

  // --- 3. START GAME / LOBBY JOIN ---
  const handleStartGame = async (e, existingOpponent = null) => {
    if (e) e.preventDefault();
    if (!inputs.p1 || isJoining) return;
    setIsJoining(true);

    const p1Name = inputs.p1.toLowerCase().trim();
    const p2Name = (existingOpponent || inputs.p2 || "").toLowerCase().trim();

    try {
      let { data: u1 } = await supabase.from('treasury').select('*').eq('username', p1Name).maybeSingle();
      if (!u1) {
        const { data: n1 } = await supabase.from('treasury').insert([{ username: p1Name, coins: 50 }]).select().single();
        u1 = n1;
      }
      setPlayer1(u1);

      if (gameMode === "pvp" && p2Name) {
        let { data: gRow } = await supabase.from('games').select('*')
          .or(`and(white_player.eq.${p1Name},black_player.eq.${p2Name}),and(white_player.eq.${p2Name},black_player.eq.${p1Name})`)
          .maybeSingle();

        if (gRow) {
          setGame(new Chess(gRow.fen));
        } else {
          await supabase.from('games').insert([{ white_player: p1Name, black_player: p2Name, fen: new Chess().fen() }]);
          setGame(new Chess());
        }
        setPlayer2({ username: p2Name });
      } else {
        setPlayer2({ username: "Stockfish AI" });
        setGame(new Chess());
      }
    } catch (err) { console.error(err); } finally { setIsJoining(false); }
  };

  // --- 4. ENGINE & MOVE LOGIC ---
  async function onDrop(sourceSquare, targetSquare) {
    if (!audioUnlocked) setAudioUnlocked(true);
    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (!move) return false;
      setGame(gameCopy);
      if (gameMode === "pvp") {
        await supabase.from('games').update({ fen: gameCopy.fen() })
          .or(`and(white_player.eq.${player1.username},black_player.eq.${player2?.username}),and(white_player.eq.${player2?.username},black_player.eq.${player1.username})`);
      }
      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  // --- 5. THEMES & PIECES ---
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

  // --- UI: MAIN MENU ---
  if (!player1) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", fontFamily: "sans-serif" }}>
        <h1 style={{ textAlign: "center", fontSize: "3rem", color: currentTheme.light, letterSpacing: "4px" }}>THE TREASURE CHESS CLUB</h1>
        
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", flexWrap: "wrap", margin: "40px 0" }}>
          <img src="/themes/mickey/pieces/wk.png" style={{ width: "120px", filter: "drop-shadow(0 0 10px gold)" }} alt="Mickey" />
          
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
             <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", color: gameMode === "ai" ? "#000" : "#fff", border: "none", cursor: "pointer" }}>AI</button>
                <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", color: gameMode === "pvp" ? "#000" : "#fff", border: "none", cursor: "pointer" }}>PVP</button>
             </div>
             <form onSubmit={(e) => handleStartGame(e)} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <input type="text" placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} required />
                {gameMode === "pvp" && (
                  <input type="text" placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} />
                )}
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold", cursor: "pointer" }}>{isJoining ? "JOINING..." : "ENTER CLUB"}</button>
             </form>

             {/* LIVE LOBBY LIST */}
             {gameMode === "pvp" && liveGames.length > 0 && (
               <div style={{ marginTop: "20px" }}>
                 <p style={{ fontSize: "12px", color: currentTheme.light }}>OR JOIN A LIVE TABLE:</p>
                 {liveGames.map((g, i) => (
                   <button key={i} onClick={() => {
                     const opp = g.white_player === inputs.p1 ? g.black_player : g.white_player;
                     handleStartGame(null, opp);
                   }} style={{ width: "100%", padding: "8px", marginBottom: "5px", fontSize: "12px", background: "#222", color: "#fff", border: "1px solid #444", cursor: "pointer" }}>
                     {g.white_player} vs {g.black_player}
                   </button>
                 ))}
               </div>
             )}
          </div>

          <img src="/themes/miraculous/pieces/wq.png" style={{ width: "120px", filter: "drop-shadow(0 0 10px red)" }} alt="Ladybug" />
        </div>

        {/* BUBBLE MEMBER LIST */}
        <div style={{ textAlign: "center" }}>
          <h2 style={{ color: currentTheme.light }}>CLUB MEMBERS</h2>
          <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap", padding: "20px" }}>
            {treasury.map((u, i) => (
              <div key={i} style={{ padding: "8px 15px", background: "#222", borderRadius: "20px", border: `1px solid ${currentTheme.light}` }}>
                {u.username} <span style={{ color: "gold" }}>🪙 {u.coins}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- UI: GAME BOARD ---
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <h2 style={{ letterSpacing: "2px" }}>{player1?.username} VS {player2?.username}</h2>
      
      {gameOverMessage && (
        <div style={{ position: "absolute", zIndex: 10, top: "30%", backgroundColor: "#000", padding: "40px", border: `5px solid ${currentTheme.light}`, textAlign: "center" }}>
          <h1>{gameOverMessage}</h1>
          <button onClick={() => { setGame(new Chess()); setGameOverMessage(null); }} style={{ padding: "10px 20px", backgroundColor: currentTheme.light, border: "none", cursor: "pointer", fontWeight: "bold" }}>NEW GAME</button>
        </div>
      )}

      <div style={{ width: "min(550px, 95vw)", border: `15px solid ${currentTheme.dark}`, boxShadow: "0 0 50px rgba(0,0,0,0.5)" }}>
        <Chessboard position={game.fen()} onPieceDrop={onDrop} customPieces={customPieces} customDarkSquareStyle={{ backgroundColor: currentTheme.dark }} customLightSquareStyle={{ backgroundColor: currentTheme.light }} />
      </div>

      <button onClick={() => setPlayer1(null)} style={{ marginTop: "30px", background: "none", border: "none", color: "#444", cursor: "pointer" }}>Exit to Lobby</button>
    </div>
  );
}
