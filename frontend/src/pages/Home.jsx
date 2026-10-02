import Navbar from "../components/Navbar";
import HeroBanner from "../components/HeroBanner";
import PopularDestinations from "../components/PopularDestinations";
import useHomeLoad from '../hooks/useHomeLoad';
import { loadHomeCatalog } from '../services/homeCatalog';
import Advantages from "../components/Advantages";
import FaqSection from "../components/FaqSection";
import Footer from "../components/Footer";
import "../styles/Home.css";
import "../styles/HomeCollections.css";

export default function Home() {
  const {items:destinations,status:catalogState,onRetry}=useHomeLoad(loadHomeCatalog);
  const catalog={destinations,catalogState,onRetry};
  return <div className="app home-page">
    <Navbar /><main><HeroBanner {...catalog} /><PopularDestinations {...catalog} />
    <Advantages /><FaqSection /></main><Footer />
  </div>;
}
