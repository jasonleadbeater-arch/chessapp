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
  const [drawOfferedBy, setDrawOfferedBy] = useState(null);

  const bgMusic = useRef(null);
  const stockfish = useRef(null);

  const themes = {
    beast_quest: { name: "Beast Quest", light: "#7cfc00", dark: "#4d3d2b", path: "/themes/beast_quest/pieces/", audioPath: "/themes/beast_quest/sounds/" },
    mickey: { name: "Mickey Mouse Arcade", light: "#ffcc00", dark: "#000000", path: "/themes/mickey/pieces/", audioPath: "/themes/mickey/sounds/" },
    miraculous: { name: "Miraculous Ladybug", light: "#e21b22", dark: "#000000", path: "/themes/miraculous/pieces/", audioPath: "/themes/miraculous/sounds/" },
    moana: { name: "Moana Ocean Adventure", light: "rgb(35, 250, 244)", dark: "rgb(2, 97, 1)", path: "/themes/moana/pieces/", audioPath: "/themes/moana/sounds/" }
  };
  const currentTheme = themes[themeKey] || themes.mickey;

  const updateCoins = async (winnerName, loserName, isDraw = false) => {
    if (isDraw) return;
    if (winnerName && winnerName !== "Stockfish AI") {
      const { data } = await supabase.from('treasury').select('coins').eq('username', winnerName).single();
      await supabase.from('treasury').update({ coins: (data?.coins || 0) + 10 }).eq('username', winnerName);
    }
    if (loserName && loserName !== "Stockfish AI") {
      const { data } = await supabase.from('treasury').select('coins').eq('username', loserName).single();
      await supabase.from('treasury').update({ coins: Math.max(0, (data?.coins || 0) - 5) }).eq('username', loserName);
    }
    fetchData();
  };

  const checkGameOver = (gameInstance) => {
    if (gameInstance.isCheckmate()) {
      const winner = gameInstance.turn() === "w" ? player2.username : player1.username;
      const loser = gameInstance.turn() === "w" ? player1.username : player2.username;
      const msg = `CHECKMATE! ${winner} wins!`;
      setGameOverMessage(msg);
      updateCoins(winner, loser);
      return true;
    }
    if (gameInstance.isDraw() || gameInstance.isStalemate() || gameInstance.isThreefoldRepetition()) {
      setGameOverMessage("GAME OVER: Draw/Stalemate");
      return true;
    }
    return false;
  };

  const handleClearGame = async (white, black) => {
    await supabase.from('games').delete().match({ white_player: white, black_player: black });
    fetchData();
  };

  const handleResign = async () => {
    const winner = assignedRole === 'w' ? player2?.username : player1?.username;
    const loser = assignedRole === 'w' ? player1?.username : player2?.username;
    const msg = `${assignedRole === 'w' ? "White" : "Black"} Resigned. ${winner} wins!`;
    setGameOverMessage(msg);
    updateCoins(winner, loser);
    if (gameMode === "pvp") {
      await supabase.from('games').update({ fen: "RESIGNED:" + msg }).or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
    }
  };

  const handleOfferDraw = async () => {
    setDrawOfferedBy(assignedRole);
    if (gameMode === "pvp") {
      await supabase.from('games').update({ turn: "DRAW_OFFERED_BY_" + assignedRole }).or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
    }
  };

  const handleAcceptDraw = async () => {
    setGameOverMessage("Game Drawn by Agreement");
    if (gameMode === "pvp") {
      await supabase.from('games').update({ fen: "DRAWN_BY_AGREEMENT" }).or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
    }
  };

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
            if (payload.new.fen.startsWith("RESIGNED:")) {
               setGameOverMessage(payload.new.fen.replace("RESIGNED:", ""));
            } else if (payload.new.fen === "DRAWN_BY_AGREEMENT") {
               setGameOverMessage("Game Drawn by Agreement");
            } else if (payload.new.turn.startsWith("DRAW_OFFERED_BY_")) {
               setDrawOfferedBy(payload.new.turn.replace("DRAW_OFFERED_BY_", ""));
            } else if (payload.new.fen !== game.fen()) {
              const nextGame = new Chess(payload.new.fen);
              setGame(nextGame);
              setDbHistory(payload.new.move_history || []);
              playSound("move.mp3");
              setDrawOfferedBy(null);
              checkGameOver(nextGame);
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
  }, [gameMode, currentTheme]);

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === "b" && !game.isGameOver()) {
      stockfish.current.postMessage(`position fen ${game.fen()}`);
      stockfish.current.postMessage(`go depth ${difficulty}`);
    }
  }, [game, gameMode, difficulty]);

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
      const newFen = gameCopy.fen();
      const updatedHistory = [...dbHistory, move.san];
      setGame(gameCopy);
      setDbHistory(updatedHistory); 
      setOptionSquares({});
      if (move.captured) playSound(turnBefore === 'w' ? "black_capture.mp3" : "white_capture.mp3");
      else playSound("move.mp3");

      checkGameOver(gameCopy);

      if (gameMode === "pvp") {
        await supabase.from('games').update({ fen: newFen, move_history: updatedHistory, turn: gameCopy.turn() })
        .or(`and(white_player.eq.${player1.username},black_player.eq.${player2.username}),and(white_player.eq.${player2.username},black_player.eq.${player1.username})`);
      }
      return true;
    } catch (e) { return false; }
  }

  const handleResumeActiveGame = async (activeGame, role) => {
    setAudioUnlocked(true);
    setGameMode("pvp");
    setAssignedRole(role === "white" ? "w" : "b");
    const resGame = new Chess(activeGame.fen);
    setGame(resGame);
    setDbHistory(activeGame.move_history || []);
    if (role === "white") {
      setPlayer1({ username: activeGame.white_player });
      setPlayer2({ username: activeGame.black_player });
    } else {
      setPlayer1({ username: activeGame.black_player });
      setPlayer2({ username: activeGame.white_player });
    }
    checkGameOver(resGame);
  };

  const handleStartGame = async (e) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true); setAssignedRole("w");
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
        if (!g) await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen(), move_history: [], turn: 'w' }]);
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
        <img src="/iconBackgroundRemoved.png" alt="Logo" style={{ width: "120px", marginBottom: "10px" }} />
        <h1 style={{ fontSize: "3rem", color: currentTheme.light, letterSpacing: "4px", margin: "0" }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: "40px", flexWrap: "wrap", margin: "40px 0" }}>
          <img src="/Sorcerer.png" alt="Sorcerer" style={{ width: "250px", height: "auto", objectFit: "contain" }} />
          <div style={{ padding: "30px", backgroundColor: "#111", borderRadius: "20px", border: `4px solid ${currentTheme.light}`, width: "400px" }}>
              <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
                <button onClick={() => setGameMode("ai")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "ai" ? currentTheme.light : "#333", fontWeight: "bold", border: "none", cursor: "pointer" }}>VS AI</button>
                <button onClick={() => setGameMode("pvp")} style={{ flex: 1, padding: "10px", backgroundColor: gameMode === "pvp" ? currentTheme.light : "#333", fontWeight: "bold", border: "none", cursor: "pointer" }}>VS PLAYER</button>
              </div>
              <form onSubmit={handleStartGame} style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                {/* Updated input with list attribute */}
                <input 
                  placeholder="Your Name" 
                  value={inputs.p1} 
                  onChange={(e) => setInputs({...inputs, p1: e.target.value})} 
                  style={{ padding: "12px", borderRadius: "5px", border: "none" }} 
                  list="treasury-names"
                  required 
                />
                <datalist id="treasury-names">
                  {treasury.map((user, idx) => (
                    <option key={idx} value={user.username} />
                  ))}
                </datalist>

                {gameMode === "pvp" && (
                  <input 
                    placeholder="Opponent Name" 
                    value={inputs.p2} 
                    onChange={(e) => setInputs({...inputs, p2: e.target.value})} 
                    style={{ padding: "12px", borderRadius: "5px", border: "none" }} 
                    list="treasury-names"
                  />
                )}
                
                {gameMode === "ai" && (
                  <div style={{ textAlign: "left", display: "flex", flexDirection: "column", gap: "5px" }}>
                    <label style={{ fontSize: "12px", color: currentTheme.light }}>Quest Level: {difficulty}</label>
                    <input type="range" min="1" max="20" value={difficulty} onChange={(e) => setDifficulty(parseInt(e.target.value))} style={{ cursor: "pointer", accentColor: currentTheme.light }} />
                  </div>
                )}
                <button type="submit" style={{ padding: "15px", backgroundColor: currentTheme.light, fontWeight: "bold", cursor: "pointer", border: "none" }}>ENTER CLUB</button>
              </form>
          </div>
          <div style={{ width: "400px", textAlign: "left" }}>
            <h2 style={{ color: currentTheme.light, borderBottom: `2px solid ${currentTheme.light}` }}>ACTIVE GAMES</h2>
            <div style={{ height: "300px", overflowY: "auto", marginTop: "10px" }}>
              {liveGames.map((g, i) => (
                <div key={i} style={{ background: "#111", padding: "15px", marginBottom: "10px", borderRadius: "10px", borderLeft: `5px solid ${currentTheme.light}` }}>
                  <p style={{ fontWeight: "bold" }}>{g.white_player} vs {g.black_player}</p>
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <button onClick={() => handleResumeActiveGame(g, "white")} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "#fff", color: "#000", cursor: "pointer", border: "none" }}>Join as {g.white_player}</button>
                    <button onClick={() => handleResumeActiveGame(g, "black")} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "#444", color: "#fff", cursor: "pointer", border: "none" }}>Join as {g.black_player}</button>
                    <button onClick={() => handleClearGame(g.white_player, g.black_player)} style={{ padding: "5px 10px", fontSize: "11px", backgroundColor: "red", color: "white", cursor: "pointer", border: "none" }}>Clear</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: "50px", maxWidth: "800px", margin: "50px auto", padding: "20px", background: "#111", borderRadius: "15px", border: `2px solid ${currentTheme.light}` }}>
          <h2 style={{ color: "gold", marginBottom: "20px" }}>👑 CLUBHOUSE TREASURY 👑</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "15px" }}>
            {treasury.map((user, idx) => (
              <div key={idx} style={{ background: "#222", padding: "10px", borderRadius: "10px", border: "1px solid #444" }}>
                <div style={{ fontWeight: "bold", color: currentTheme.light }}>{user.username}</div>
                <div style={{ color: "gold", fontSize: "1.1rem" }}>🪙 {user.coins}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px", backgroundColor: "#000", minHeight: "100vh", color: "white" }}>
      <div style={{ margin: "0 40px", textAlign: "center" }}>
        {gameOverMessage && (
          <div style={{ position: "fixed", top: "20%", left: "50%", transform: "translateX(-50%)", backgroundColor: "rgba(0,0,0,0.9)", padding: "20px", border: `2px solid ${currentTheme.light}`, zIndex: 10, borderRadius: "10px" }}>
            <h2 style={{ color: "gold" }}>{gameOverMessage}</h2>
            <button onClick={() => window.location.reload()} style={{ padding: "10px 20px", cursor: "pointer" }}>BACK TO LOBBY</button>
          </div>
        )}
        <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", alignItems: "center", gap: "15px" }}>
          <div style={{ padding: "10px 20px", borderRadius: "10px", border: `2px solid ${game.turn() === 'w' ? currentTheme.light : "#444"}`, backgroundColor: game.turn() === 'w' ? currentTheme.light : "transparent", color: game.turn() === 'w' ? "#000" : "#fff", fontWeight: "bold" }}>
            WHITE'S TURN {game.turn() === 'w' && "⚡"}
          </div>
          <div style={{ fontSize: "24px" }}>VS</div>
          <div style={{ padding: "10px 20px", borderRadius: "10px", border: `2px solid ${game.turn() === 'b' ? currentTheme.light : "#444"}`, backgroundColor: game.turn() === 'b' ? currentTheme.light : "transparent", color: game.turn() === 'b' ? "#000" : "#fff", fontWeight: "bold" }}>
            BLACK'S TURN {game.turn() === 'b' && "⚡"}
          </div>
        </div>
        <h2 style={{ marginBottom: "10px" }}>{player1.username} ({assignedRole === 'w' ? 'White' : 'Black'}) <span style={{ margin: "0 10px", color: currentTheme.light }}>vs</span> {player2?.username}</h2>
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", marginBottom: "20px" }}>
           <button onClick={() => { const gc = new Chess(game.fen()); gc.undo(); setGame(gc); }} style={{ padding: "8px 15px", backgroundColor: "#333", color: "#fff", borderRadius: "5px", border: "none", cursor: "pointer" }}>UNDO</button>
           <button onClick={handleResign} style={{ padding: "8px 15px", backgroundColor: "#422", color: "#fff", borderRadius: "5px", border: "none", cursor: "pointer" }}>RESIGN</button>
           {drawOfferedBy && drawOfferedBy !== assignedRole ? (
             <button onClick={handleAcceptDraw} style={{ padding: "8px 15px", backgroundColor: "gold", color: "#000", fontWeight: "bold", borderRadius: "5px", border: "none", cursor: "pointer" }}>ACCEPT DRAW?</button>
           ) : (
             <button onClick={handleOfferDraw} disabled={!!drawOfferedBy} style={{ padding: "8px 15px", backgroundColor: "#334", color: "#fff", borderRadius: "5px", border: "none", cursor: drawOfferedBy ? "not-allowed" : "pointer" }}>
               {drawOfferedBy === assignedRole ? "DRAW OFFERED..." : "OFFER DRAW"}
             </button>
           )}
        </div>
        <div style={{ width: "min(550px, 90vw)", border: `12px solid ${currentTheme.dark}`, borderRadius: "5px" }}>
          <Chessboard position={game.fen()} onPieceDrop={onDrop} onSquareClick={onSquareClick} customSquareStyles={optionSquares} boardOrientation={assignedRole === 'w' ? 'white' : 'black'} customPieces={customPieces} customDarkSquareStyle={{ backgroundColor: currentTheme.dark }} customLightSquareStyle={{ backgroundColor: currentTheme.light }} />
        </div>
        <button onClick={() => window.location.reload()} style={{ marginTop: "20px", padding: "10px 20px", backgroundColor: "#444", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}>EXIT TO LOBBY</button>
      </div>
    </div>
  );
}
