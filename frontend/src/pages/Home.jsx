import Navbar from "../components/Navbar";
import HeroBanner from "../components/HeroBanner";
import PopularDestinations from "../components/PopularDestinations";
import HotTours from "../components/HotTours";
import CountrySection from "../components/CountrySection";
import Advantages from "../components/Advantages";
import FaqSection from "../components/FaqSection";
import Footer from "../components/Footer";
import "../styles/Home.css";
import "../styles/HomeCollections.css";

export default function Home() {
  return <div className="app">
    <Navbar /><HeroBanner /><PopularDestinations /><HotTours />
    <CountrySection /><Advantages /><FaqSection /><Footer />
  </div>;
}
