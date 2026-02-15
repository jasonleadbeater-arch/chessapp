"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../lib/supabase";

export default function GameBoard({ themeKey }) {
  // --- RESPONSIVE HOOK ---
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 900);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // --- STATE ---
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [gameMode, setGameMode] = useState("ai");
  const [difficulty, setDifficulty] = useState(10);
  const [inputs, setInputs] = useState({ p1: "", p2: "" });
  const [treasury, setTreasury] = useState([]);
  const [game, setGame] = useState(new Chess());
  const [optionSquares, setOptionSquares] = useState({});
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState(null);

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

  // --- LOGIC ---
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

  const playSound = (f) => { 
    if (!audioUnlocked) return;
    const audio = new Audio(`${currentTheme.audioPath}${f}`);
    audio.play().catch(e => console.log("Sound error:", e));
  };

  // --- UI COMPONENTS ---
  const CapturedSidebar = ({ pieces, color, label }) => (
    <div style={{ 
      width: isMobile ? "100%" : "80px", 
      display: "flex", 
      flexDirection: isMobile ? "row" : "column", 
      flexWrap: "wrap",
      gap: "5px", 
      justifyContent: "center",
      background: "#111", 
      padding: "10px", 
      borderRadius: "10px",
      margin: isMobile ? "10px 0" : "0"
    }}>
      <p style={{ fontSize: "10px", color: "#666", width: "100%", textAlign: "center", marginBottom: "5px" }}>{label}</p>
      {pieces.map((p, i) => (
        <img key={i} src={`${currentTheme.path}${color}${p.toLowerCase()}.png`} style={{ width: "25px" }} alt="captured" />
      ))}
    </div>
  );

  const { whiteCaptured, blackCaptured } = getCapturedPieces();

  // --- RENDER LOBBY ---
  if (!player1) {
    return (
      <div onClick={() => setAudioUnlocked(true)} style={{ 
        minHeight: "100vh", backgroundColor: "#000", color: "white", 
        padding: isMobile ? "20px 10px" : "40px", textAlign: "center" 
      }}>
        <h1 style={{ fontSize: isMobile ? "1.8rem" : "3rem", color: currentTheme.light, letterSpacing: "2px" }}>
          THE TREASURE CHESS CLUB
        </h1>
        
        <div style={{ 
          display: "flex", 
          flexDirection: isMobile ? "column" : "row",
          justifyContent: "center", 
          alignItems: "center", 
          gap: "20px",
          margin: "30px 0" 
        }}>
          {!isMobile && <img src="/themes/mickey/pieces/wk.png" style={{ width: "100px" }} alt="piece" />}
          
          <div style={{ 
            padding: "20px", background: "#111", borderRadius: "20px", 
            border: `3px solid ${currentTheme.light}`, width: "100%", maxWidth: "400px" 
          }}>
            <form onSubmit={(e) => { e.preventDefault(); setPlayer1({username: inputs.p1}); }}>
              <input 
                placeholder="Enter Username" 
                value={inputs.p1} 
                onChange={(e) => setInputs({...inputs, p1: e.target.value})} 
                style={{ width: "100%", padding: "12px", marginBottom: "10px", borderRadius: "5px" }} 
              />
              <button type="submit" style={{ ...btnStyle, width: "100%", backgroundColor: currentTheme.light, color: "#000" }}>
                START PLAYING
              </button>
            </form>
          </div>

          {!isMobile && <img src="/themes/miraculous/pieces/wq.png" style={{ width: "100px" }} alt="piece" />}
        </div>
      </div>
    );
  }

  // --- RENDER GAME ---
  return (
    <div style={{ 
      display: "flex", 
      flexDirection: isMobile ? "column" : "row", 
      justifyContent: "center", 
      alignItems: isMobile ? "center" : "flex-start", 
      padding: isMobile ? "10px" : "40px", 
      backgroundColor: "#000", 
      minHeight: "100vh"
    }}>
      
      {/* Top Sidebar (Black's Losses) */}
      <CapturedSidebar pieces={blackCaptured} color="w" label="WHITE TAKES" />

      {/* Main Game Area */}
      <div style={{ flex: 1, maxWidth: "600px", margin: isMobile ? "0" : "0 30px", textAlign: "center" }}>
        <h3 style={{ marginBottom: "15px", fontSize: isMobile ? "1rem" : "1.5rem" }}>
          {player1.username} vs AI
        </h3>

        <div style={{ border: `8px solid ${currentTheme.dark}`, borderRadius: "8px", overflow: "hidden" }}>
          <Chessboard 
            id="BasicBoard"
            position={game.fen()} 
            onPieceDrop={(s, t) => {
                const move = game.move({ from: s, to: t, promotion: "q" });
                if (!move) return false;
                setGame(new Chess(game.fen()));
                if (move.captured) playSound("black_capture.mp3");
                return true;
            }}
            customDarkSquareStyle={{ backgroundColor: currentTheme.dark }}
            customLightSquareStyle={{ backgroundColor: currentTheme.light }}
            boardWidth={isMobile ? window.innerWidth - 40 : 550}
          />
        </div>

        {/* Responsive Button Grid */}
        <div style={{ 
          marginTop: "20px", 
          display: "grid", 
          gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", 
          gap: "10px" 
        }}>
          <button onClick={() => { game.undo(); setGame(new Chess(game.fen())); }} style={btnStyle}>UNDO</button>
          <button onClick={() => window.location.reload()} style={{...btnStyle, backgroundColor: "#333"}}>EXIT</button>
        </div>
      </div>

      {/* Bottom Sidebar (White's Losses) */}
      <CapturedSidebar pieces={whiteCaptured} color="b" label="BLACK TAKES" />

    </div>
  );
}

const btnStyle = { 
  padding: "12px", background: "#444", color: "#fff", 
  border: "none", borderRadius: "8px", fontWeight: "bold", 
  cursor: "pointer", fontSize: "14px" 
};
