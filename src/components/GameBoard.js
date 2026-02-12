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

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  // --- 1. REALTIME LISTENER ---
  // This listens for moves made by the OTHER player
  useEffect(() => {
    if (gameMode !== "pvp" || !player1 || !player2) return;

    const channel = supabase
      .channel('realtime-chess')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'games' },
        (payload) => {
          const newFen = payload.new.fen;
          // Only update if the FEN is different to avoid infinite loops
          if (newFen !== game.fen()) {
            const updatedGame = new Chess(newFen);
            setGame(updatedGame);
            checkGameOver(updatedGame);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameMode, player1, player2, game]);

  // --- 2. CLOUD DATA FETCHING ---
  const fetchTreasury = async () => {
    const { data } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (data) setTreasury(data);
  };

  useEffect(() => { fetchTreasury(); }, []);

  // --- 3. START GAME (MATCHMAKING) ---
  const handleStartGame = async (e) => {
    e.preventDefault();
    if (!inputs.p1) return;

    // Login/Create Player 1
    let { data: u1 } = await supabase.from('treasury').select('*').eq('username', inputs.p1).single();
    if (!u1) {
      const { data: newUser } = await supabase.from('treasury').insert([{ username: inputs.p1, coins: 50 }]).select().single();
      u1 = newUser;
    }
    setPlayer1(u1);

    if (gameMode === "pvp" && inputs.p2) {
      // Find existing game room between these two players
      let { data: existingGame } = await supabase
        .from('games')
        .select('*')
        .or(`and(white_player.eq.${inputs.p1},black_player.eq.${inputs.p2}),and(white_player.eq.${inputs.p2},black_player.eq.${inputs.p1})`)
        .single();

      if (existingGame) {
        setGame(new Chess(existingGame.fen));
      } else {
        // Create new room if none exists
        await supabase.from('games').insert([
          { white_player: inputs.p1, black_player: inputs.p2, fen: new Chess().fen() }
        ]);
        setGame(new Chess());
      }
      setPlayer2({ username: inputs.p2 });
    } else {
      setPlayer2({ username: "Stockfish AI", coins: "∞" });
      setGame(new Chess());
    }
    fetchTreasury();
  };

  // --- 4. STOCKFISH ENGINE ---
  useEffect(() => {
    stockfish.current = new Worker("/stockfish.js");
    stockfish.current.onmessage = (e) => {
      if (gameMode === "ai" && e.data.startsWith("bestmove")) {
        const moveStr = e.data.split(" ")[1];
        if (moveStr && moveStr !== "(none)") {
          const aiMove = { from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" };
          setGame((prevGame) => {
            const gameCopy = new Chess(prevGame.fen());
            gameCopy.move(aiMove);
            handleMoveSounds(gameCopy.history({ verbose: true }).pop(), gameCopy);
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

  // --- 5. MOVE LOGIC & BROADCASTING ---
  async function onDrop(sourceSquare, targetSquare) {
    if (!audioUnlocked) setAudioUnlocked(true);

    const gameCopy = new Chess(game.fen());
    try {
      const move = gameCopy.move({ from: sourceSquare, to: targetSquare, promotion: "q" });
      if (move === null) return false;

      setGame(gameCopy);
      handleMoveSounds(move, gameCopy);

      // BROADCAST TO SUPABASE IF PVP
      if (gameMode === "pvp") {
        await supabase
          .from('games')
          .update({ fen: gameCopy.fen() })
          .or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
      }

      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  // --- 6. UTILS (SCORES, SOUNDS, UI) ---
  const updateCoins = async (username, diff) => {
    const { data } = await supabase.from('treasury').select('coins').eq('username', username).single();
    if (data) {
      await supabase.from('treasury').update({ coins: data.coins + diff }).eq('username', username);
    }
  };

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = "";
    if (gameInstance.isCheckmate()) {
      const winnerColor = gameInstance.turn() === 'w' ? 'b' : 'w';
      msg = winnerColor === 'w' ? "White Wins!" : "Black Wins!";
      // Add coin logic here if desired
    } else {
      msg = "Draw!";
    }
    setGameOverMessage(msg);
    fetchTreasury();
  };

  useEffect(() => {
    if (bgMusic.current) { bgMusic.current.pause(); bgMusic.current.src = ""; }
    bgMusic.current = new Audio(`${currentTheme.audioPath}theme.mp3`);
    bgMusic.current.loop = true;
    if (audioUnlocked && player1) bgMusic.current.play().catch(() => {});
    return () => bgMusic.current?.pause();
  }, [themeKey, audioUnlocked, player1]);

  const playSound = (soundFile) => {
    const audio = new Audio(`${currentTheme.audioPath}${soundFile}`);
    audio.play().catch(() => {});
  };

  const handleMoveSounds = (move, gameInstance) => {
    if (gameInstance.isCheckmate() && themeKey === "miraculous") {
      playSound("blackking_capture.mp3");
    } else if (move && move.captured) {
      playSound(move.color === 'w' ? "white_capture.mp3" : "black_capture.mp3");
    }
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
  }, [currentTheme, themeKey]);

  // --- RENDER ---
  if (!player1) {
    return (
      <div style={{ padding: "40px", textAlign: "center", color: "white", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, maxWidth: "500px", margin: "100px auto" }}>
        <h1 style={{ letterSpacing: "2px", color: currentTheme.light }}>TREASURE CHESS CLUB</h1>
        <div style={{ marginBottom: "20px" }}>
          <button onClick={() => setGameMode("ai")} style={{ padding: "10px 20px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", color: gameMode === "ai" ? "#000" : "#fff", cursor: "pointer", border: "none" }}>VS AI</button>
          <button onClick={() => setGameMode("pvp")} style={{ padding: "10px 20px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", color: gameMode === "pvp" ? "#000" : "#fff", cursor: "pointer", border: "none" }}>VS PLAYER</button>
        </div>
        <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <input type="text" placeholder="Your Username" value={inputs.p1} onChange={(e) => setInputs({...inputs, p1: e.target.value})} style={{ padding: "12px", borderRadius: "5px", color: "#000" }} required />
          {gameMode === "pvp" && (
            <input type="text" placeholder="Opponent Username" value={inputs.p2} onChange={(e) => setInputs({...inputs, p2: e.target.value})} style={{ padding: "12px", borderRadius: "5px", color: "#000" }} required />
          )}
          <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, color: "#000", fontWeight: "bold", borderRadius: "5px", border: "none", cursor: "pointer" }}>JOIN THE CLUB</button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "40px", padding: "20px" }}>
      <div style={{ width: "250px", backgroundColor: "#000", padding: "20px", borderRadius: "15px", border: `2px solid ${currentTheme.light}`, color: "white" }}>
        <h3 style={{ color: currentTheme.light, textAlign: "center", margin: 0 }}>GLOBAL TREASURY</h3>
        <hr style={{ borderColor: "#222" }} />
        {treasury.map((u, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #111" }}>
            <span>{u.username}</span>
            <span style={{ color: "#ffd700" }}>🪙 {u.coins}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <h2 style={{ color: "white", textTransform: "uppercase", letterSpacing: "3px" }}>Treasure Chess Club</h2>
        <div style={{ marginBottom: "20px", color: "white", backgroundColor: "#111", padding: "10px 20px", borderRadius: "50px", border: "1px solid #333" }}>
          ⚪ {player1.username} vs ⚫ {player2.username}
        </div>

        {gameOverMessage && (
          <div style={{ position: "absolute", top: "40%", zIndex: 100, backgroundColor: "#000", color: currentTheme.light, padding: "30px", borderRadius: "15px", border: `4px solid ${currentTheme.light}`, textAlign: "center" }}>
            <h2>{gameOverMessage}</h2>
            <button onClick={() => { setGame(new Chess()); setGameOverMessage(null); fetchTreasury(); }} style={{ padding: "10px 25px", cursor: "pointer", backgroundColor: currentTheme.light, border: "none" }}>PLAY AGAIN</button>
          </div>
        )}

        <div style={{ width: "min(500px, 95vw)", border: `12px solid ${currentTheme.dark}`, backgroundColor: currentTheme.dark }}>
          <Chessboard 
            position={game.fen()} 
            onPieceDrop={onDrop} 
            customPieces={customPieces}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
          />
        </div>
        <button onClick={() => setPlayer1(null)} style={{ marginTop: "20px", color: "#666", fontSize: "11px", background: "none", border: "none", cursor: "pointer" }}>Logout</button>
      </div>
    </div>
  );
}
