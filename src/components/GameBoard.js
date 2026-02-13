"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { supabase } from "../lib/supabase";

export default function GameBoard({ themeKey }) {
  const [player1, setPlayer1] = useState(null);
  const [player2, setPlayer2] = useState(null);
  const [gameMode, setGameMode] = useState("ai");
  const [inputs, setInputs] = useState({ p1: "", p2: "" });
  const [treasury, setTreasury] = useState([]);
  const [liveGames, setLiveGames] = useState([]);
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

  // --- SOUND SYSTEM ---
  const playSound = (soundFile) => {
    if (!audioUnlocked) return;
    const path = `${currentTheme.audioPath}${soundFile}`;
    const audio = new Audio(path);
    audio.play().catch(err => console.error("Audio Error:", path, err));
  };

  const handleMoveSounds = (move, gameInstance) => {
    if (gameInstance.isCheckmate()) {
      playSound(themeKey === "miraculous" ? "blackking_capture.mp3" : "white_capture.mp3");
    } else if (move && move.captured) {
      playSound(move.color === 'w' ? "white_capture.mp3" : "black_capture.mp3");
    }
  };

  // --- STOCKFISH ENGINE ---
  useEffect(() => {
    console.log("Initializing Stockfish...");
    try {
      stockfish.current = new Worker('/stockfish.js');
      stockfish.current.onmessage = (e) => {
        if (e.data.startsWith("bestmove") && gameMode === "ai") {
          const moveStr = e.data.split(" ")[1];
          if (moveStr && moveStr !== "(none)") {
            const moveObj = { from: moveStr.substring(0, 2), to: moveStr.substring(2, 4), promotion: "q" };
            setGame((prev) => {
              const next = new Chess(prev.fen());
              const m = next.move(moveObj);
              handleMoveSounds(m, next);
              checkGameOver(next);
              return next;
            });
          }
        }
      };
      stockfish.current.postMessage("uci");
    } catch (err) {
      console.error("Stockfish Worker Failed:", err);
    }
    return () => stockfish.current?.terminate();
  }, [gameMode]);

  useEffect(() => {
    if (gameMode === "ai" && game.turn() === 'b' && !game.isGameOver() && player1) {
      console.log("AI Thinking...");
      stockfish.current?.postMessage(`position fen ${game.fen()}`);
      stockfish.current?.postMessage(`go depth 10`);
    }
  }, [game, gameMode, player1]);

  // --- DATA & REALTIME ---
  const fetchData = async () => {
    const { data: members } = await supabase.from('treasury').select('*').order('coins', { ascending: false });
    if (members) setTreasury(members);
    const { data: games } = await supabase.from('games').select('*').limit(5);
    if (games) setLiveGames(games);
  };

  useEffect(() => {
    fetchData();
    const sub = supabase.channel('lobby').on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, fetchData).subscribe();
    return () => supabase.removeChannel(sub);
  }, []);

  const updateCoins = async (user, diff) => {
    if (!user || user === "Stockfish AI") return;
    const { data } = await supabase.from('treasury').select('coins').eq('username', user).single();
    if (data) {
      const newTotal = Math.max(0, (data.coins || 0) + diff);
      await supabase.from('treasury').update({ coins: newTotal }).eq('username', user);
      fetchData();
    }
  };

  const checkGameOver = async (gameInstance) => {
    if (!gameInstance.isGameOver() || gameOverMessage) return;
    let msg = gameInstance.isCheckmate() ? "Checkmate!" : "Draw!";
    if (gameInstance.isCheckmate()) {
      const winner = gameInstance.turn() === 'w' ? player2?.username : player1?.username;
      const loser = gameInstance.turn() === 'w' ? player1?.username : player2?.username;
      msg = `${winner} Wins! (+3)`;
      await updateCoins(winner, 3);
      await updateCoins(loser, -3);
    } else {
      await updateCoins(player1?.username, 1);
      await updateCoins(player2?.username, 1);
    }
    setGameOverMessage(msg);
  };

  // --- MATCHMAKING ---
  const handleStartGame = async (e, existingOpponent = null) => {
    if (e) e.preventDefault();
    setAudioUnlocked(true);
    if (!inputs.p1 || isJoining) return;
    setIsJoining(true);

    const p1 = inputs.p1.toLowerCase().trim();
    const p2 = (existingOpponent || inputs.p2 || "").toLowerCase().trim();

    try {
      let { data: u1 } = await supabase.from('treasury').select('*').eq('username', p1).maybeSingle();
      if (!u1) {
        const { data: n1 } = await supabase.from('treasury').insert([{ username: p1, coins: 50 }]).select().single();
        u1 = n1;
      }
      setPlayer1(u1);

      if (gameMode === "pvp" && p2) {
        let { data: g } = await supabase.from('games').select('*').or(`and(white_player.eq.${p1},black_player.eq.${p2}),and(white_player.eq.${p2},black_player.eq.${p1})`).maybeSingle();
        if (g) { setGame(new Chess(g.fen)); } 
        else { await supabase.from('games').insert([{ white_player: p1, black_player: p2, fen: new Chess().fen() }]); }
        setPlayer2({ username: p2 });
      } else {
        setPlayer2({ username: "Stockfish AI" });
      }
    } catch (err) { console.error(err); } finally { setIsJoining(false); }
  };

  async function onDrop(source, target) {
    const move = game.move({ from: source, to: target, promotion: "q" });
    if (!move) return false;
    setGame(new Chess(game.fen()));
    handleMoveSounds(move, game);
    if (gameMode === "pvp") {
      await supabase.from('games').update({ fen: game.fen() })
        .or(`and(white_player.eq.${player1.username},black_player.eq.${player2?.username}),and(white_player.eq.${player2?.username},black_player.eq.${player1.username})`);
    }
    checkGameOver(game);
    return true;
  }

  // --- THEME MUSIC ---
  useEffect(() => {
    if (player1 && audioUnlocked) {
      if (bgMusic.current) bgMusic.current.pause();
      bgMusic.current = new Audio(`${currentTheme.audioPath}theme.mp3`);
      bgMusic.current.loop = true;
      bgMusic.current.play().catch(() => {});
    }
    return () => bgMusic.current?.pause();
  }, [player1, audioUnlocked, themeKey]);

  if (!player1) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#000", color: "white", padding: "20px", textAlign: "center" }}>
        <h1 style={{ color: currentTheme.light }}>THE TREASURE CHESS CLUB</h1>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", margin: "40px" }}>
          <img src="/themes/mickey/pieces/wk.png" style={{ width: "100px" }} alt="M" />
          <div style={{ padding: "30px", background: "#111", border: `3px solid ${currentTheme.light}`, width: "350px" }}>
            <div style={{ marginBottom: "15px" }}>
              <button onClick={() => setGameMode("ai")} style={{ background: gameMode === "ai" ? currentTheme.light : "#444", padding: "10px" }}>AI</button>
              <button onClick={() => setGameMode("pvp")} style={{ background: gameMode === "pvp" ? currentTheme.light : "#444", padding: "10px" }}>PVP</button>
            </div>
            <form onSubmit={handleStartGame}>
              <input placeholder="Your Name" value={inputs.p1} onChange={e => setInputs({...inputs, p1: e.target.value})} style={{ width: "80%", padding: "10px", margin: "5px" }} />
              {gameMode === "pvp" && <input placeholder="Opponent Name" value={inputs.p2} onChange={e => setInputs({...inputs, p2: e.target.value})} style={{ width: "80%", padding: "10px", margin: "5px" }} />}
              <button type="submit" style={{ width: "80%", padding: "10px", marginTop: "10px", background: currentTheme.light }}>ENTER</button>
            </form>
          </div>
          <img src="/themes/miraculous/pieces/wq.png" style={{ width: "100px" }} alt="L" />
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: "10px", flexWrap: "wrap" }}>
          {treasury.map((u, i) => <div key={i} style={{ padding: "5px 10px", background: "#222", borderRadius: "10px", border: `1px solid ${currentTheme.light}` }}>{u.username} 🪙{u.coins}</div>)}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minHeight: "100vh", background: "#000", color: "#fff" }}>
      <h2>{player1.username} vs {player2?.username}</h2>
      <div style={{ width: "min(500px, 90vw)", border: `10px solid ${currentTheme.dark}` }}>
        <Chessboard position={game.fen()} onPieceDrop={onDrop} />
      </div>
      <button onClick={() => window.location.reload()} style={{ marginTop: "20px", color: "#444" }}>Exit</button>
    </div>
  );
}
