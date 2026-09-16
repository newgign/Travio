import Navbar from "../components/Navbar";
import HeroBanner from "../components/HeroBanner";
import PopularDestinations from "../components/PopularDestinations";
import HotTours from "../components/HotTours";
import { useEffect, useState } from 'react';
import { loadHomeCatalog } from '../services/homeCatalog';
import Advantages from "../components/Advantages";
import FaqSection from "../components/FaqSection";
import Footer from "../components/Footer";
import "../styles/Home.css";
import "../styles/HomeCollections.css";

export default function Home() {
  const [catalog,setCatalog]=useState({destinations:[],catalogState:'loading'});
  useEffect(()=>{
    const controller=new AbortController();
    loadHomeCatalog(controller.signal).then(destinations=>{
      if(!controller.signal.aborted)setCatalog({destinations,catalogState:'ready'});
    }).catch(()=>{if(!controller.signal.aborted)setCatalog({destinations:[],catalogState:'error'});});
    return ()=>controller.abort();
  },[]);
  return <div className="app home-page">
    <Navbar /><main><HeroBanner {...catalog} /><PopularDestinations {...catalog} /><HotTours />
    <Advantages /><FaqSection /></main><Footer />
  </div>;
}
