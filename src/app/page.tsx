/* ... inside the ArcadeApp return ... */
<div style={{ marginBottom: "30px", display: "flex", alignItems: "center", justifyContent: "center", gap: "20px" }}>
  {/* Visual Icon based on selection */}
  <img 
    src={`/themes/${selectedTheme}/pieces/wk.png`} 
    style={{ height: "60px", width: "60px", filter: "drop-shadow(2px 2px 5px rgba(0,0,0,0.2))" }} 
    alt="Theme Preview"
    onError={(e) => e.target.style.display = 'none'} // Hides if file path doesn't exist
  />

  <div>
    <label style={{ fontWeight: "bold", marginRight: "10px" }}>Select Your Theme: </label>
    <select 
      value={selectedTheme} 
      onChange={(e) => setSelectedTheme(e.target.value)}
      style={{ padding: "8px", borderRadius: "5px", fontSize: "16px" }}
    >
      <option value="mickey">Mickey Mouse</option>
      <option value="miraculous">Miraculous</option>
      <option value="beast_quest">Beast Quest</option>
      <option value="moana">Moana Ocean Adventure</option>
    </select>
  </div>
</div>
