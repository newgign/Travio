import { changeGuestCount } from '../utils/homeSearch';
import { useLayoutEffect, useRef } from 'react';
import { guestPanelLayout } from '../utils/guestPanelLayout';
function GuestPanelLayer({children}) {
  const panel=useRef(null);
  useLayoutEffect(()=>{
    const node=panel.current;
    const parent=node.parentElement;
    const trigger=parent.querySelector('#home-guests');
    if(!trigger)return;
    const update=()=>{
      if(window.matchMedia('(max-width:600px)').matches) {
        for(const key of ['top','bottom','maxHeight'])node.style[key]='';
        return;
      }
      Object.assign(node.style,guestPanelLayout(trigger.getBoundingClientRect(),parent.getBoundingClientRect(),document.documentElement.clientHeight));
    };
    update();
    window.addEventListener('resize',update);
    window.addEventListener('scroll',update,true);
    return ()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);};
  },[]);
  return <div ref={panel} className="home-guest-panel home-guest-floating" id="home-guest-panel" role="group" aria-label="Состав гостей">{children}</div>;
}
export default function GuestPanel({form,onChange,onClose}) {
  return <GuestPanelLayer>
    {['adults','children'].map(field=><div className="home-guest-row" key={field}>
      <span>{field==='adults' ? 'Взрослые' : 'Дети'}<small>{field==='adults' ? 'От 1 до 6' : 'До 3 детей, возраст 0–17'}</small></span>
      <div><button type="button" aria-label={field==='adults' ? 'Уменьшить число взрослых' : 'Уменьшить число детей'} disabled={form[field]<=(field==='adults'?1:0)} onClick={()=>onChange(changeGuestCount(form,field,-1))}>−</button>
        <output aria-live="polite">{form[field]}</output>
        <button type="button" aria-label={field==='adults' ? 'Увеличить число взрослых' : 'Увеличить число детей'} disabled={form[field]>=(field==='adults'?6:3)} onClick={()=>onChange(changeGuestCount(form,field,1))}>+</button></div>
    </div>)}
    <div className="home-guest-row"><span>Номера<small>Сейчас доступен поиск одного номера</small></span><div>
      <output aria-label="Количество номеров">1</output>
    </div></div>
    {form.childrenAges.map((age,index)=><div className="home-child-age" key={index}><label htmlFor={`home-child-${index}`}>Возраст ребёнка {index+1}</label>
      <select id={`home-child-${index}`} name={`childAge${index}`} value={age} required onChange={event=>onChange({...form,childrenAges:form.childrenAges.map((value,i)=>i===index?event.target.value:value)})}>
        <option value="">Укажите возраст</option>{Array.from({length:18},(_,n)=><option value={n} key={n}>{n}</option>)}
      </select></div>)}
    <button type="button" className="home-guest-done" onClick={onClose}>Готово</button>
  </GuestPanelLayer>;
}
