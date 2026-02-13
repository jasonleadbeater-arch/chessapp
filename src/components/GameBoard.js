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
  const [game, setGame] = useState(new Chess());
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [difficulty, setDifficulty] = useState(5);
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

  // --- 1. TREASURY LOGIC (COIN UPDATES) ---
  const updateCoins = async (username, diff) => {
    if (!username || username === "Stockfish AI") return;

    // Fetch current coins
    const { data } = await supabase.from('treasury').select('coins').eq('username', username).single();
    
    if (data) {
      const currentCoins = data.coins || 0;
      // Calculate new total, but don't go below 0
      const newTotal = Math.max(0, currentCoins + diff);
      
      await supabase
        .from('treasury')
        .update({ coins: newTotal })
        .eq('username', username);
    }
  };

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;

    let msg = "";
    if (gameInstance.isCheckmate()) {
      const winnerColor = gameInstance.turn() === 'w' ? 'b' : 'w';
      const winnerName = winnerColor === 'w' ? player1?.username : player2?.username;
      const loserName = winnerColor === 'w' ? player2?.username : player1?.username;

      msg = `${winnerName} Wins! (+3 🪙)`;
      
      // Award Winner and Deduct Loser
      await updateCoins(winnerName, 3);
      await updateCoins(loserName, -3);
    } else {
      msg = "Draw! (+1 🪙 each)";
      // Award both for a draw
      await updateCoins(player1?.username, 1);
      await updateCoins(player2?.username, 1);
    }

    setGameOverMessage(msg);
    fetchTreasury(); // Refresh leaderboard
  };

  // --- 2. FETCH LEADERBOARD ---
  const fetchTreasury = async () => {
    const { data } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (data) setTreasury(data);
  };

  useEffect(() => { fetchTreasury(); }, []);

  // --- 3. REALTIME LISTENER ---
  useEffect(() => {
    if (gameMode !== "pvp" || !player1 || !player2) return;
    const channel = supabase
      .channel('realtime-chess')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games' }, (payload) => {
        const newFen = payload.new.fen;
        if (newFen !== game.fen()) {
          const updatedGame = new Chess(newFen);
          setGame(updatedGame);
          if (updatedGame.isGameOver()) checkGameOver(updatedGame);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [gameMode, player1, player2, game]);

  // --- 4. START GAME ---
  const handleStartGame = async (e) => {
    e.preventDefault();
    if (!inputs.p1 || isJoining) return;
    setIsJoining(true);

    try {
      let { data: u1 } = await supabase.from('treasury').select('*').eq('username', inputs.p1).maybeSingle();
      if (!u1) {
        const { data: newUser } = await supabase.from('treasury').insert([{ username: inputs.p1, coins: 50 }]).select().single();
        u1 = newUser;
      }
      setPlayer1(u1);

      if (gameMode === "pvp" && inputs.p2) {
        let { data: existingGame } = await supabase
          .from('games')
          .select('*')
          .or(`and(white_player.eq.${inputs.p1},black_player.eq.${inputs.p2}),and(white_player.eq.${inputs.p2},black_player.eq.${inputs.p1})`)
          .maybeSingle();

        if (existingGame) {
          setGame(new Chess(existingGame.fen));
        } else {
          await supabase.from('games').insert([{ white_player: inputs.p1, black_player: inputs.p2, fen: new Chess().fen() }]);
          setGame(new Chess());
        }
        setPlayer2({ username: inputs.p2 });
      } else {
        setPlayer2({ username: "Stockfish AI" });
        setGame(new Chess());
      }
      fetchTreasury();
    } catch (err) {
      console.error(err);
    } finally {
      setIsJoining(false);
    }
  };

  // --- 5. ENGINE & MOVES ---
  useEffect(() => {
    stockfish.current = new Worker("/stockfish.js");
    stockfish.current.onmessage = (e) => {
      if (gameMode === "ai" && e.data.startsWith("bestmove")) {
        const moveStr = e.data.split(" ")[1];
        if (moveStr && moveStr !== "(none)") {
          setGame((prevGame) => {
            const gameCopy = new Chess(prevGame.fen());
            gameCopy.move({ from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" });
            checkGameOver(gameCopy);
            return gameCopy;
          });
        }
      }
    };
    stockfish.current.postMessage("uci");
    return () => stockfish.current?.terminate();
  }, [gameMode, player1]);

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver() && player1) {
      setTimeout(() => {
        stockfish.current.postMessage(`position fen ${game.fen()}`);
        stockfish.current.postMessage(`go depth ${difficulty}`);
      }, 600);
    }
  }, [game, difficulty, gameMode, player1]);

  async function onDrop(sourceSquare, targetSquare) {
    if (!audioUnlocked) setAudioUnlocked(true);
    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (move === null) return false;
      setGame(gameCopy);
      if (gameMode === "pvp") {
        await supabase.from('games').update({ fen: gameCopy.fen() })
          .or(`and(white_player.eq.${player1.username},black_player.eq.${player2?.username}),and(white_player.eq.${player2?.username},black_player.eq.${player1.username})`);
      }
      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  // --- THEMES & UI ---
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
      <div style={{ padding: "40px", textAlign: "center", color: "white", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, maxWidth: "500px", margin: "100px auto" }}>
        <h1>THE TREASURE CHESS CLUB</h1>
        <div style={{ marginBottom: "20px" }}>
          <button onClick={() => setGameMode("ai")} style={{ padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", color: gameMode === "ai" ? "#000" : "#fff", border: "none" }}>VS AI</button>
          <button onClick={() => setGameMode("pvp")} style={{ padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", color: gameMode === "pvp" ? "#000" : "#fff", border: "none" }}>VS PLAYER</button>
        </div>
        <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <input type="text" placeholder="Your Name" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} required />
          {gameMode === "pvp" && (
            <input type="text" placeholder="Opponent Name" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px" }} required />
          )}
          <button type="submit" disabled={isJoining} style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold", cursor: "pointer" }}>{isJoining ? "CONNECTING..." : "JOIN CLUB"}</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "40px", padding: "20px" }}>
      <div style={{ width: "250px", backgroundColor: "#000", padding: "20px", borderRadius: "15px", border: `2px solid ${currentTheme.light}`, color: "white" }}>
        <h3 style={{ color: currentTheme.light }}>MEMBERS</h3>
        {treasury.map((u, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0" }}>
            <span>{u.username}</span>
            <span style={{ color: "#ffd700" }}>🪙 {u.coins}</span>
          </div>
        ))}
      </div>
      <div style={{ textAlign: "center" }}>
        <h2 style={{ color: "white" }}>{player1?.username} vs {player2?.username}</h2>
        {gameOverMessage && (
          <div style={{ padding: "20px", backgroundColor: "#000", color: currentTheme.light, border: `3px solid ${currentTheme.light}`, marginBottom: "10px" }}>
            <h3>{gameOverMessage}</h3>
            <button onClick={() => { setGame(new Chess()); setGameOverMessage(null); }} style={{ padding: "10px", backgroundColor: currentTheme.light, cursor: "pointer" }}>PLAY AGAIN</button>
          </div>
        )}
        <div style={{ width: "min(500px, 95vw)", border: `12px solid ${currentTheme.dark}` }}>
          <Chessboard position={game.fen()} onPieceDrop={onDrop} customPieces={customPieces} customDarkSquareStyle={{ backgroundColor: currentTheme.dark }} customLightSquareStyle={{ backgroundColor: currentTheme.light }} />
        </div>
      </div>
    </div>
  );
}
