/* ... inside the page.tsx return ... */
<div style={{ marginBottom: "30px", display: "flex", flexDirection: "column", alignItems: "center", gap: "10px" }}>
  <div style={{ display: "flex", justifyContent: "center", gap: "30px", marginBottom: "10px" }}>
    <img src="/assets/Sorcerer.png" style={{ height: "80px", width: "auto" }} alt="Mickey" />
    <img src="/assets/iconBackgroundRemoved.png" style={{ height: "80px", width: "auto" }} alt="Miraculous" />
  </div>
  
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
