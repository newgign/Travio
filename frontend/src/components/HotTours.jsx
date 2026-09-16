import { useEffect, useState } from 'react';
import API_URL from '../services/api';
import HotToursSection from './HotToursSection';
export default function HotTours() {
  const [tours,setTours]=useState([]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch(`${API_URL}/special-offers`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)return;
      const result=await response.json();
      if(!controller.signal.aborted)setTours(Array.isArray(result.data)?result.data:[]);
    }).catch(()=>{});
    return ()=>controller.abort();
  },[]);
  return <HotToursSection tours={tours} />;
}
