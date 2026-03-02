"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1 }) {
  // --- 1. LOBBY & MATCHMAKING STATE ---
  const [gameId, setGameId] = useState(null);
  const [myColor, setMyColor] = useState("white"); 
  const [isJoined, setIsJoined] = useState(false);
  const [opponentJoined, setOpponentJoined] = useState(false);
  const [inputRoom, setInputRoom] = useState("");
  const [username] = useState(player1?.email?.split('@')[0] || "Traveler");

  // --- 2. CORE GAME STATE ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The sticks await your command.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameMode, setGameMode] = useState("AI"); 
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);

  // Use Ref to handle the "5/5 pieces" victory check without React state delay
  const borneOffRef = useRef({ white: 0, black: 0 });

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.8)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 3. RECONNECTION LOGIC (The "Refresh-Proof" Hook) ---
  useEffect(() => {
    const attemptRejoin = async () => {
      if (!username || isJoined) return;

      const { data, error } = await supabase
        .from('senet_games')
        .select('*')
        .or(`player_white.eq.${username},player_black.eq.${username}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data && !error) {
        setGameId(data.id);
        setMyColor(data.player_white === username ? "white" : "black");
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw || 0);
        const currentScore = data.borne_off || { white: 0, black: 0 };
        setBorneOff(currentScore);
        borneOffRef.current = currentScore;
        
        setGameMode("PvP");
        setIsJoined(true);
        setOpponentJoined(!!data.player_black); 
        setMessage("Welcome back to the tomb.");
      }
    };

    attemptRejoin();
  }, [username, isJoined]);

  // --- 4. LOBBY & MATCHMAKING LOGIC ---
  const hostGame = async () => {
    const newRoomId = Math.random().toString(36).substring(2, 7).toUpperCase();
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    
    const { error } = await supabase.from('senet_games').insert([{ 
      id: newRoomId, 
      player_white: username,
      player_black: null,
      board_state: initialBoard,
      turn: 'white',
      borne_off: { white: 0, black: 0 },
      last_throw: 0
    }]);

    if (!error) {
      setGameId(newRoomId);
      setMyColor("white");
      setGameMode("PvP");
      setIsJoined(true);
      setOpponentJoined(false); 
    } else {
      alert("Error: " + error.message);
    }
  };

  const joinGame = async () => {
    if (!inputRoom) return alert("Enter a room code.");
    const { data, error } = await supabase
      .from('senet_games')
      .select('*')
      .eq('id', inputRoom.toUpperCase())
      .single();

    if (data) {
      if (data.player_black && data.player_black !== username) return alert("Room full.");
      
      await supabase
        .from('senet_games')
        .update({ player_black: username })
        .eq('id', data.id);

      setGameId(data.id);
      setMyColor("black");
      setGameMode("PvP");
      setIsJoined(true);
      setOpponentJoined(true);
    } else {
      alert("Room not found.");
    }
  };

  // --- 5. REALTIME SYNC ---
  useEffect(() => {
    if (!isJoined || gameMode !== "PvP") return;

    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'senet_games', 
        filter: `id=eq.${gameId}` 
      }, (payload) => {
        const data = payload.new;
        
        if (myColor === "white" && data.player_black && !opponentJoined) {
          setOpponentJoined(true);
        }

        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
        if (data.borne_off) {
          setBorneOff(data.borne_off);
          borneOffRef.current = data.borne_off;
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [isJoined, gameMode, gameId, myColor, opponentJoined]);

  // --- 6. INITIALIZATION (AI Mode) ---
  const initializeAiGame = () => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
    setTurn("white");
    setLastThrow(0);
    setBorneOff({ white: 0, black: 0 });
    borneOffRef.current = { white: 0, black: 0 };
    setGameOver(false);
    setGameMode("AI");
    setIsJoined(true);
    setOpponentJoined(true);
    setMessage("Challenge the Pharaoh.");
  };

  // --- 7. CORE GAMEPLAY MECHANICS ---
  const updateRemoteGame = async (nb, nt, lt, cbo) => {
    if (gameMode !== "PvP") return;
    await supabase.from('senet_games').update({
      board_state: nb, turn: nt, last_throw: lt, borne_off: cbo
    }).eq('id', gameId);
  };

  const throwSticks = () => {
    if (gameOver || isRolling) return;
    if (gameMode === "PvP" && turn !== myColor) return; 

    setIsRolling(true);
    setMessage("Casting the sticks...");
    
    let count = 0;
    const interval = setInterval(() => {
      setLastThrow(Math.floor(Math.random() * 5) + 1);
      count++;
      
      if (count > 12) {
        clearInterval(interval);
        const sticks = Array.from({ length: 4 }, () => Math.round(Math.random()));
        const flats = sticks.reduce((a, b) => a + b, 0);
        const finalScore = flats === 0 ? 5 : flats;
        
        setLastThrow(finalScore);
        setIsRolling(false);
        setMessage(`You threw a ${finalScore}!`);

        if (gameMode === "PvP") {
            updateRemoteGame(board, turn, finalScore, borneOff);
        }
      }
    }, 70);
  };

  const handleSquareClick = (idx) => {
    if (lastThrow === 0 || isRolling || gameOver) return;
    if (gameMode === "PvP" && turn !== myColor) return;
    if (gameMode === "AI" && turn === "black") return;

    if (board[idx] === turn) {
      setSelectedSquare(idx);
    } else if (selectedSquare !== null) {
      const target = selectedSquare + lastThrow;
      if (idx === target) executeMove(selectedSquare, target);
    }
  };

  const handleAfterlifeExit = () => {
    if (selectedSquare === null || lastThrow === 0) return;
    if (gameMode === "PvP" && turn !== myColor) return;
    const targetIndex = selectedSquare + lastThrow;
    if (targetIndex >= 30) {
      executeMove(selectedSquare, targetIndex);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    if (to >= 30) {
      if (from < 20) { setMessage("Complete the first rows first!"); return; }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      
      setBorneOff(newBorneOff);
      borneOffRef.current = newBorneOff;
      
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
        if (gameMode === "PvP") updateRemoteGame(newBoard, turn, 0, newBorneOff);
      } else {
        finalizeTurn(newBoard, newBorneOff);
      }
      return;
    }

    if (from < 25 && to > 25 && to !== 26) {
      setMessage("Stop at Square 26 exactly!");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; 

    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) { setMessage("Protected!"); return; }
      newBoard[from] = occupant;
      newBoard[to] = turn;
    } else {
      newBoard[from] = null;
      newBoard[to] = turn;
    }

    if (to === 26) {
      setMessage("Drowned! Reset to 15.");
      newBoard[26] = null;
      if (!newBoard[14]) newBoard[14] = turn;
      else newBoard[0] = turn;
    }

    finalizeTurn(newBoard, borneOff);
  };

  const finalizeTurn = (nb, cbo) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    
    setBoard(nb);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextTurn);
    
    if (gameMode === "PvP") {
        updateRemoteGame(nb, nextTurn, 0, cbo);
    }
  };

  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      let prize = difficulty === "Scribe" ? 5 : (difficulty === "Pharaoh" ? 20 : 50);
      setMessage(`VICTORY! You enter the afterlife. +${prize} coins.`);
      await supabase.rpc('increment_coins', { row_id: player1.id, x: prize });
    } else {
      setMessage(`${winner.toUpperCase()} has triumphed.`);
    }
  };

  // --- 8. AI LOGIC ---
  useEffect(() => {
    if (gameMode === "AI" && turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1500);
      else {
        const moves = [];
        board.forEach((p, i) => {
          if (p === "black") {
            const target = i + lastThrow;
            if (target < 30) {
              const occ = board[target];
              const prot = (board[target+1] === "white") || (board[target-1] === "white");
              if (occ !== "black" && !(occ === "white" && prot && target < 25)) {
                if (!(i < 25 && target > 25 && target !== 26)) moves.push({ from: i, to: target });
              }
            } else if (i >= 20) moves.push({ from: i, to: 30 });
          }
        });
        const move = moves.sort((a, b) => b.to - a.to)[0];
        setTimeout(() => {
          if (move) executeMove(move.from, move.to);
          else { setTurn("white"); setLastThrow(0); }
        }, 1200);
      }
    }
  }, [turn, lastThrow, isRolling, gameMode]);

  // --- 9. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    const ext = (num === 28) ? 'jpeg' : 'png';

    return (
      <div key={idx} onClick={() => handleSquareClick(idx)} style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.${ext})`,
          backgroundSize: "cover", backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer"
        }}>
        <span style={{ position: "absolute", bottom: "2px", right: "2px", fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{num}</span>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px" }} alt="W" />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px" }} alt="B" />}
      </div>
    );
  };

  // --- UI VIEWS ---
  if (!isJoined) {
    return (
      <div style={{ padding: "40px", background: "#111", borderRadius: "15px", border: "1px solid #ffcc00", maxWidth: "400px", margin: "0 auto" }}>
        <h3 style={{ color: "#ffcc00", marginBottom: "20px" }}>WELCOME, {username}</h3>
        <button onClick={initializeAiGame} style={{ width: "100%", padding: "15px", marginBottom: "15px", background: "#ffcc00", color: "#000", fontWeight: "bold", border: "none", cursor: "pointer" }}>PLAY VS AI</button>
        <div style={{ height: "1px", background: "#333", margin: "20px 0" }} />
        <button onClick={hostGame} style={{ width: "100%", padding: "12px", marginBottom: "10px", background: "none", color: "#ffcc00", border: "1px solid #ffcc00", cursor: "pointer" }}>HOST PvP MATCH</button>
        <input type="text" placeholder="ENTER CODE" value={inputRoom} onChange={(e) => setInputRoom(e.target.value)} style={{ width: "100%", padding: "12px", background: "#000", color: "#fff", border: "1px solid #333", marginBottom: "10px", textAlign: "center" }} />
        <button onClick={joinGame} style={{ width: "100%", padding: "12px", background: "#333", color: "#fff", border: "none", cursor: "pointer" }}>JOIN PvP MATCH</button>
      </div>
    );
  }

  if (gameMode === "PvP" && !opponentJoined && myColor === "white") {
    return (
      <div style={{ padding: "60px", textAlign: "center", background: "#111", borderRadius: "20px", border: "2px dashed #ffcc00", maxWidth: "500px", margin: "40px auto" }}>
        <h2 style={{ color: "#ffcc00" }}>𓀀 WAITING FOR OPPONENT 𓁟</h2>
        <p style={{ color: "#8b7355", margin: "20px 0" }}>Secret Room Code:</p>
        <div style={{ fontSize: "40px", fontWeight: "bold", background: "#000", padding: "20px", border: "1px solid #444", color: "#fff", letterSpacing: "5px" }}>{gameId}</div>
        <p style={{ marginTop: "20px", color: "#555", fontSize: "12px" }}>The board will reveal when they arrive.</p>
      </div>
    );
  }

  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      <p style={{ color: colors.gold, minHeight: "24px", fontSize: "18px" }}>{message}</p>
      
      <div style={{ margin: "10px auto", height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} alt="Throw" style={{ height: "90px" }} />}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginBottom: "20px" }}>
        <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || (gameMode === "PvP" && turn !== myColor) || (gameMode === "AI" && turn === "black") || gameOver} style={{
          padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000"
        }}>
          {isRolling ? "TOSSING..." : "CAST STICKS"}
        </button>
        {selectedSquare !== null && selectedSquare + lastThrow >= 30 && (
           <button onClick={handleAfterlifeExit} style={{ padding: "12px 35px", background: "orange", border: "none", fontWeight: "bold", borderRadius: "50px", cursor: "pointer" }}>𓂀 AFTERLIFE</button>
        )}
      </div>

      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "624px", padding: "12px", 
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover", border: `8px solid ${colors.darkSand}`, borderRadius: "8px" 
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "20px", color: colors.gold }}>
        WHITE: {borneOff.white}/5 | BLACK: {borneOff.black}/5
        {gameMode === "PvP" && <div style={{ fontSize: "12px", marginTop: "10px", color: "#555" }}>ROOM: {gameId} | ROLE: {myColor.toUpperCase()}</div>}
      </div>
    </div>
  );
}
