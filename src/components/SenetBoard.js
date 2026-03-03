"use client";
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function SenetBoard({ player1, gameId = "default-room" }) {
  // --- 1. STATE MANAGEMENT ---
  const [board, setBoard] = useState(Array(30).fill(null));
  const [turn, setTurn] = useState("white"); 
  const [lastThrow, setLastThrow] = useState(0);
  const [isRolling, setIsRolling] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [borneOff, setBorneOff] = useState({ white: 0, black: 0 });
  const [message, setMessage] = useState("The sticks await your command.");
  const [difficulty, setDifficulty] = useState("Pharaoh");
  const [gameMode, setGameMode] = useState("𓄿𓇋"); 
  const [gameOver, setGameOver] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [raGlow, setRaGlow] = useState(null);
  
  // NEW: Treasury and Entry Logic
  const [username, setUsername] = useState("𓋴𓈖𓏏");
  const [treasury, setTreasury] = useState([]);
  const [pvpJoined, setPvpJoined] = useState(false);
  const [tempUsername, setTempUsername] = useState("");

  const colors = {
    gold: "#ffcc00",
    darkSand: "#8b7355",
    obsidian: "rgba(0,0,0,0.6)", 
    raOrange: "#ff4500",
    papyrus: "#f4e4bc"
  };

  // --- 2. INITIALIZATION & SYNC ---
  // Fetch Treasury for the datalist (Mirrors GameBoard.js)
  useEffect(() => {
    async function fetchTreasury() {
      const { data } = await supabase.from("treasury").select("username");
      if (data) setTreasury(data);
    }
    fetchTreasury();
  }, []);

  // Fetch username from treasury based on player1.id (Auto-login if exists)
  useEffect(() => {
    async function getTreasuryName() {
      if (!player1?.id) return;
      const { data } = await supabase
        .from("treasury")
        .select("username")
        .eq("id", player1.id)
        .single();
      
      if (data?.username) {
        setUsername(data.username);
        setTempUsername(data.username);
      }
    }
    getTreasuryName();
  }, [player1]);

  const initializeGame = () => {
    const initialBoard = Array(30).fill(null);
    for (let i = 0; i < 10; i++) {
      initialBoard[i] = i % 2 === 0 ? "white" : "black";
    }
    setBoard(initialBoard);
    setTurn("white");
    setLastThrow(0);
    setBorneOff({ white: 0, black: 0 });
    setGameOver(false);
    setMessage("Board reset. May the gods be with you.");
    setSelectedSquare(null);
    setRaGlow(null);
  };

  useEffect(() => {
    if (gameMode !== "PvP" || !pvpJoined) return;

    const channel = supabase
      .channel(`game:${gameId}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: 'senet_games', 
        filter: `id=eq.${gameId}` 
      }, (payload) => {
        const data = payload.new;
        setBoard(data.board_state);
        setTurn(data.turn);
        setLastThrow(data.last_throw);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [gameMode, gameId, pvpJoined]);

  useEffect(() => {
    initializeGame();
  }, []);

  // --- 3. DATABASE UPDATE ---
  const updateRemoteGame = async (newBoard, nextTurn, score) => {
    if (gameMode !== "PvP") return;
    await supabase
      .from('senet_games')
      .update({
        board_state: newBoard,
        turn: nextTurn,
        last_throw: score
      })
      .eq('id', gameId);
  };

  // --- 4. PvP JOIN HANDLER ---
  const handlePvpJoin = (e) => {
    e.preventDefault();
    if (!tempUsername) return;
    setUsername(tempUsername);
    setPvpJoined(true);
    initializeGame();
  };

  // --- 5. CASTING STICKS ---
  const throwSticks = () => {
    if (gameOver || isRolling) return;
    if (gameMode === "PvP" && turn === "black") return; 

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
            updateRemoteGame(board, turn, finalScore);
        }
      }
    }, 70);
  };

  // --- 6. MOVEMENT LOGIC ---
  const handleSquareClick = (index) => {
    if (lastThrow === 0 || isRolling || gameOver) return;
    if (gameMode === "PvP" && turn === "black") return; 
    if (gameMode === "AI" && turn === "black") return;

    if (board[index] === turn) {
      setSelectedSquare(index);
    } else if (selectedSquare !== null) {
      const targetIndex = selectedSquare + lastThrow;
      if (index === targetIndex) {
        executeMove(selectedSquare, targetIndex);
      }
    }
  };

  const handleAfterlifeExit = () => {
    if (selectedSquare === null || lastThrow === 0) return;
    const targetIndex = selectedSquare + lastThrow;
    if (targetIndex >= 30) {
      executeMove(selectedSquare, targetIndex);
    }
  };

  const executeMove = async (from, to) => {
    let newBoard = [...board];

    if (to >= 30) {
      if (from < 20) {
        setMessage("Complete the first rows first!");
        return;
      }
      newBoard[from] = null;
      const newBorneOff = { ...borneOff, [turn]: borneOff[turn] + 1 };
      setBorneOff(newBorneOff);
      
      if (newBorneOff[turn] === 5) {
        setGameOver(true);
        handleWin(turn);
      } else {
        finalizeTurn(newBoard);
      }
      return;
    }

    if (from < 25 && to > 25) {
      setMessage("Stop at Square 26 exactly!");
      return;
    }

    const occupant = newBoard[to];
    if (occupant === turn) return; 

    if (occupant && occupant !== turn) {
      const isProtected = (newBoard[to + 1] === occupant) || (newBoard[to - 1] === occupant);
      if (isProtected && to < 25) {
        setMessage("Protected by a neighbor!");
        return;
      }
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

    finalizeTurn(newBoard);
  };

  const finalizeTurn = (newBoard) => {
    const extraTurn = [1, 4, 5].includes(lastThrow);
    const nextTurn = extraTurn ? turn : (turn === "white" ? "black" : "white");
    
    setBoard(newBoard);
    setSelectedSquare(null);
    setLastThrow(0);
    setTurn(nextTurn);
    
    if (extraTurn) setMessage("Extra turn granted!");

    if (gameMode === "PvP") {
        updateRemoteGame(newBoard, nextTurn, 0);
    }
  };

  const handleWin = async (winner) => {
    if (winner === "white" && player1?.id) {
      let prize = difficulty === "Scribe" ? 5 : (difficulty === "Pharaoh" ? 20 : 50);
      setMessage(`VICTORY! You enter the afterlife.`);
      await supabase.rpc('increment_coins', { row_id: player1.id, x: prize });
    } else {
      setMessage(`${difficulty} has triumphed.`);
    }
  };

  // --- 7. AI LOGIC ---
  useEffect(() => {
    if (gameMode === "AI" && turn === "black" && !gameOver && !isRolling) {
      if (lastThrow === 0) setTimeout(throwSticks, 1500);
      else {
        const move = getAiMove();
        setTimeout(() => {
          if (move) {
            if (difficulty === "Ra") { setRaGlow(move.to); setTimeout(() => setRaGlow(null), 800); }
            executeMove(move.from, move.to);
          } else { 
            setTurn("white"); 
            setLastThrow(0); 
          }
        }, 1200);
      }
    }
  }, [turn, lastThrow, isRolling, gameMode]);

  const getAiMove = () => {
    const moves = [];
    board.forEach((p, i) => {
      if (p === "black") {
        const target = i + lastThrow;
        if (target < 30) {
          const occ = board[target];
          const prot = (board[target+1] === "white") || (board[target-1] === "white");
          if (occ !== "black" && !(occ === "white" && prot && target < 25)) {
            if (!(i < 25 && target > 25)) moves.push({ from: i, to: target });
          }
        } else if (i >= 20) moves.push({ from: i, to: 30 });
      }
    });
    if (moves.length === 0) return null;
    return moves.sort((a, b) => b.to - a.to)[0];
  };

  // --- 8. RENDER HELPERS ---
  const renderSquare = (idx) => {
    const isSelected = selectedSquare === idx;
    const isRaActive = raGlow === idx;
    const num = idx + 1;
    const paddedNum = num.toString().padStart(2, '0');
    const ext = (num === 28) ? 'jpeg' : 'png';

    return (
      <div 
        key={idx} onClick={() => handleSquareClick(idx)}
        style={{
          width: "60px", height: "60px",
          border: isSelected ? "3px solid gold" : isRaActive ? "3px solid #ff4500" : "1px solid rgba(255,255,255,0.1)",
          backgroundImage: `url(/themes/sq${paddedNum}.${ext})`,
          backgroundSize: "cover",
          backgroundColor: colors.obsidian,
          display: "flex", alignItems: "center", justifyContent: "center",
          position: "relative", cursor: "pointer",
          boxShadow: isRaActive ? "0 0 25px #ff4500" : "none",
          zIndex: isRaActive ? 10 : 1
        }}
      >
        <span style={{ position: "absolute", bottom: "2px", right: "2px", fontSize: "8px", color: "rgba(255,255,255,0.2)" }}>{num}</span>
        {board[idx] === "white" && <img src="/themes/white_piece.png" style={{ width: "45px", zIndex: 2 }} />}
        {board[idx] === "black" && <img src="/themes/black_piece.png" style={{ width: "45px", zIndex: 2 }} />}
      </div>
    );
  };

  const canExit = selectedSquare !== null && (selectedSquare + lastThrow >= 30) && selectedSquare >= 20;

  // --- PvP Entry Hall View ---
  if (gameMode === "PvP" && !pvpJoined) {
    return (
      <div style={{ padding: "40px", textAlign: "center", backgroundColor: "#000", minHeight: "60vh", borderRadius: "20px", border: `4px solid ${colors.gold}` }}>
        <h2 style={{ color: colors.gold, letterSpacing: "2px" }}>ENTER RIVALRY</h2>
        <form onSubmit={handlePvpJoin} style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "300px", margin: "40px auto" }}>
          <input 
            placeholder="Your Name" 
            value={tempUsername} 
            onChange={(e) => setTempUsername(e.target.value)} 
            style={{ padding: "12px", borderRadius: "5px", border: "none" }} 
            list="treasury-names"
            required 
          />
          <datalist id="treasury-names">
            {treasury.map((user, idx) => (
              <option key={idx} value={user.username} />
            ))}
          </datalist>
          <button type="submit" style={{ padding: "12px", backgroundColor: colors.gold, color: "#000", fontWeight: "bold", border: "none", cursor: "pointer", borderRadius: "5px" }}>JOIN CHAMBER</button>
          <button type="button" onClick={() => setGameMode("𓄿𓇋")} style={{ background: "none", color: "#666", border: "none", cursor: "pointer" }}>Back to AI</button>
        </form>
      </div>
    );
  }

  // --- Main Board View ---
  return (
    <div style={{ color: "#fff", textAlign: "center", fontFamily: "serif" }}>
      
      <div style={{ marginBottom: "20px", display: "flex", justifyContent: "center", gap: "10px", alignItems: "center" }}>
        <button onClick={() => { setGameMode(gameMode === "AI" ? "PvP" : "AI"); setPvpJoined(false); initializeGame(); }} 
            style={{ background: colors.obsidian, color: colors.gold, border: `1px solid ${colors.gold}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>
          MODE: {gameMode === "AI" ? "𓄿𓇋" : "PvP"}
        </button>

        <button onClick={() => setShowRules(true)} style={{ background: "none", color: colors.darkSand, border: `1px solid ${colors.darkSand}`, padding: "5px 12px", borderRadius: "20px", cursor: "pointer", fontSize: "12px" }}>
          📜 SCROLLS
        </button>
        {gameMode === "AI" && ["Scribe", "Pharaoh", "Ra"].map(lvl => (
          <button key={lvl} onClick={() => setDifficulty(lvl)} style={{ 
            padding: "5px 15px", borderRadius: "20px", cursor: "pointer", border: `1px solid ${lvl === "Ra" ? colors.raOrange : colors.gold}`,
            background: difficulty === lvl ? (lvl === "Ra" ? colors.raOrange : colors.gold) : "transparent", color: difficulty === lvl ? "#000" : "#fff", fontWeight: "bold", fontSize: "12px"
          }}>{lvl}</button>
        ))}
      </div>

      <p style={{ color: difficulty === "Ra" ? colors.raOrange : colors.gold, minHeight: "24px" }}>{message}</p>

      <div style={{ margin: "10px auto", height: "100px", display: "flex", justifyContent: "center", alignItems: "center" }}>
        {lastThrow > 0 && <img src={`/themes/${lastThrow}.png`} alt="Throw" style={{ height: "90px" }} />}
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: "15px", marginBottom: "20px", height: "50px" }}>
        <button onClick={throwSticks} disabled={isRolling || lastThrow > 0 || (gameMode === "PvP" && turn === "black") || (gameMode === "AI" && turn === "black") || gameOver} style={{
          padding: "12px 35px", background: colors.gold, border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000"
        }}>
          {isRolling ? "TOSSING..." : "CAST STICKS"}
        </button>

        {canExit && (
          <button onClick={handleAfterlifeExit} style={{
            padding: "12px 35px", background: "linear-gradient(to right, #ffcc00, #ff4500)", border: "none", fontWeight: "bold", cursor: "pointer", borderRadius: "50px", color: "#000", boxShadow: "0 0 15px gold"
          }}>
            𓂀 AFTERLIFE
          </button>
        )}
      </div>

      <div style={{ 
        display: "grid", gridTemplateColumns: "repeat(10, 60px)", margin: "0 auto", width: "624px", padding: "12px",
        backgroundImage: "url(/themes/boardtexture.png)", backgroundSize: "cover",
        border: `8px solid ${colors.darkSand}`, boxShadow: "0 0 50px rgba(0,0,0,0.8)", borderRadius: "8px"
      }}>
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i))}
        {[19, 18, 17, 16, 15, 14, 13, 12, 11, 10].map(i => renderSquare(i))}
        {Array.from({ length: 10 }).map((_, i) => renderSquare(i + 20))}
      </div>

      <div style={{ marginTop: "20px" }}>
        <div style={{ display: "flex", justifyContent: "center", gap: "50px", color: colors.gold }}>
          <div style={{ textTransform: "uppercase" }}>{username}: {borneOff.white}/5</div>
          <div>{gameMode === "AI" ? difficulty.toUpperCase() : "BLACK"}: {borneOff.black}/5</div>
        </div>
        <button onClick={initializeGame} style={{ color: colors.darkSand, background: "none", border: "1px dotted #8b7355", padding: "5px 15px", cursor: "pointer", marginTop: "15px", borderRadius: "4px", fontSize: "11px" }}>RESET JOURNEY</button>
      </div>

      {showRules && (
         <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.85)", zIndex: 9999, display: "flex", justifyContent: "center", alignItems: "center" }}>
         <div style={{ 
           backgroundColor: colors.papyrus, 
           backgroundImage: "url('https://www.transparenttextures.com/patterns/papyros.png')",
           color: "#4a3b2a", 
           padding: "35px", 
           borderRadius: "5px", 
           maxWidth: "500px", 
           textAlign: "left", 
           boxShadow: "0 0 40px rgba(0,0,0,0.5)",
           border: "2px solid #8b7355",
           fontFamily: "'Courier New', Courier, monospace"
         }}>
           <h2 style={{ textAlign: "center", borderBottom: "1px solid #8b7355", paddingBottom: "10px", marginTop: 0 }}>𓁹 THE SCROLLS OF SENET 𓁹</h2>
           <div style={{ fontSize: "14px", lineHeight: "1.6" }}>
             <p><strong>1. THE PATH:</strong> Move pieces in an 'S' shape.</p>
             <p><strong>2. PROTECTION:</strong> Two pieces together cannot be swapped.</p>
             <p><strong>3. THE TRAPS:</strong> Sq 26 (Happiness) is required; Sq 27 (Water) resets to 15.</p>
             <p><strong>4. THE AFTERLIFE:</strong> Exit all 5 pieces to win.</p>
           </div>
           <button onClick={() => setShowRules(false)} style={{ width: "100%", padding: "12px", background: "#8b7355", color: "#fff", border: "none", fontWeight: "bold", cursor: "pointer", marginTop: "20px" }}>RETURN TO TOMB</button>
         </div>
       </div>
      )}
    </div>
  );
}
