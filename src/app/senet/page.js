import SenetBoard from "../../components/SenetBoard"; // Adjust path to where your JS file is
import Navbar from "../../components/Navbar";

export default function SenetPage() {
  return (
    <main style={{ backgroundColor: "#000", minHeight: "100vh" }}>
      <Navbar />
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", paddingTop: "50px" }}>
        <SenetBoard />
      </div>
    </main>
  );
}
