import { changeGuestCount } from '../utils/homeSearch';
export default function GuestPanel({form,onChange,onClose}) {
  return <div className="home-guest-panel" id="home-guest-panel" role="group" aria-label="Состав гостей">
    {['adults','children'].map(field=><div className="home-guest-row" key={field}>
      <span>{field==='adults' ? 'Взрослые' : 'Дети'}<small>{field==='adults' ? 'От 1 до 6' : 'До 3 детей, возраст 0–17'}</small></span>
      <div><button type="button" aria-label={field==='adults' ? 'Уменьшить число взрослых' : 'Уменьшить число детей'} disabled={form[field]<=(field==='adults'?1:0)} onClick={()=>onChange(changeGuestCount(form,field,-1))}>−</button>
        <output aria-live="polite">{form[field]}</output>
        <button type="button" aria-label={field==='adults' ? 'Увеличить число взрослых' : 'Увеличить число детей'} disabled={form[field]>=(field==='adults'?6:3)} onClick={()=>onChange(changeGuestCount(form,field,1))}>+</button></div>
    </div>)}
    {form.childrenAges.map((age,index)=><div className="home-child-age" key={index}><label htmlFor={`home-child-${index}`}>Возраст ребёнка {index+1}</label>
      <select id={`home-child-${index}`} name={`childAge${index}`} value={age} required onChange={event=>onChange({...form,childrenAges:form.childrenAges.map((value,i)=>i===index?event.target.value:value)})}>
        <option value="">Укажите возраст</option>{Array.from({length:18},(_,n)=><option value={n} key={n}>{n}</option>)}
      </select></div>)}
    <button type="button" className="home-guest-done" onClick={onClose}>Готово</button>
  </div>;
}
