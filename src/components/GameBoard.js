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
  const [optionSquares, setOptionSquares] = useState({});

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

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

  // --- COIN & GAME OVER LOGIC ---
  const updateCoins = async (username, amount) => {
    if (!username || username === "Stockfish AI") return;
    const { data } = await supabase.from('treasury').select('coins').eq('username', username).single();
    if (data) {
      await supabase.from('treasury').update({ coins: data.coins + amount }).eq('username', username);
    }
  };

  const checkGameOver = async (gameInstance) => {
    if (gameInstance.isGameOver() && !gameOverMessage) {
      let message = "";
      if (gameInstance.isCheckmate()) {
        const winnerName = gameInstance.turn() === "w" ? player2?.username : player1?.username;
        const loserName = gameInstance.turn() === "w" ? player1?.username : player2?.username;
        message = `CHECKMATE! ${winnerName} wins!`;
        if (winnerName) await updateCoins(winnerName, 3);
        if (loserName) await updateCoins(loserName, -3);
      } else if (gameInstance.isDraw()) {
        message = "DRAW!";
        if (player1) await updateCoins(player1.username, 1);
        if (player2) await updateCoins(player2.username, 1);
      } else {
        message = "GAME OVER";
      }
      setGameOverMessage(message);
      fetchData();
    }
  };

  // --- AUDIO & STOCKFISH ---
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

  // --- MOVES & INDICATORS ---
  function getMoveOptions(square) {
    const moves = game.moves({ square, verbose: true });
    if (moves.length === 0) {
      setOptionSquares({});
      return;
    }
    const newSquares = {};
    moves.map((move) => {
      newSquares[move.to] = {
        background:
          game.get(move.to) && game.get(move.to).color !== game.get(square).color
            ? "radial-gradient(circle, rgba(0,0,0,.1) 85%, transparent 85%)"
            : "radial-gradient(circle, rgba(0,0,0,.1) 25%, transparent 25%)",
        borderRadius: "50%",
      };
      return move;
    });
    newSquares[square] = { background: "rgba(255, 255, 0, 0.4)" };
    setOptionSquares(newSquares);
  }

  function onSquareClick(square) {
    if (gameMode === "pvp" && game.get(square)?.color !== assignedRole) return;
    getMoveOptions(square);
  }

  async function onDrop(source, target) {
    if (gameMode === "pvp") {
      const piece = game.get(source);
      if (piece && piece.color !== assignedRole) return false;
    }

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

      checkGameOver(gameCopy);
      return true;
    } catch (e) { return false; }
  }

  // --- LOBBY ACTIONS ---
  const handleStartGame = async (e) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true); 
    setAssignedRole("w");
    const p1 = inputs.p1.toLowerCase().trim();
    if (!p1) return;
    setPlayer1({ username: p1 });
    setPlayer2({ username: "Stockfish AI" });
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
  }, [themeKey]);

  if (!player1) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <h2 style={{ color: currentTheme.light }}>ENTER THE ARENA</h2>
        <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "300px", margin: "0 auto" }}>
          <input 
            placeholder="Your Name" 
            value={inputs.p1} 
            onChange={(e) => setInputs({...inputs, p1: e.target.value})} 
            style={{ padding: "10px", borderRadius: "5px", border: "1px solid #333", backgroundColor: "#111", color: "#fff" }} 
            required 
          />
          <button type="submit" style={{ padding: "10px", backgroundColor: currentTheme.light, color: "#000", fontWeight: "bold", cursor: "pointer", border: "none", borderRadius: "5px" }}>
            START PLAYING
          </button>
        </form>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
      {gameOverMessage && (
        <div style={{ padding: "20px", backgroundColor: "rgba(0,0,0,0.9)", border: `2px solid ${currentTheme.light}`, borderRadius: "10px", position: "absolute", zIndex: 10 }}>
          <h2 style={{ color: "gold" }}>{gameOverMessage}</h2>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", cursor: "pointer" }}>BACK TO LOBBY</button>
        </div>
      )}

      {game.inCheck() && !game.isGameOver() && (
        <div style={{ color: "#ff4d4d", fontWeight: "bold", fontSize: "22px", animation: "blink 1s infinite" }}>
          ⚠️ CHECK! ⚠️
        </div>
      )}

      <div style={{ width: "min(500px, 90vw)", border: `8px solid ${currentTheme.dark}`, borderRadius: "10px", boxShadow: "0 0 20px rgba(0,0,0,0.5)" }}>
        <Chessboard 
          position={game.fen()} 
          onPieceDrop={onDrop} 
          onSquareClick={onSquareClick}
          customSquareStyles={optionSquares}
          boardOrientation={assignedRole === 'w' ? 'white' : 'black'}
          customPieces={customPieces}
          customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
          customLightSquareStyle={{ backgroundColor: currentTheme.light }}
        />
      </div>
    </div>
  );
}
