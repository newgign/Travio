import { useState } from 'react';
import './FaqSection.css';
const questions=[
  ['Как работает поиск?','Выберите направление, дату заезда, количество ночей и состав гостей. Asedeliya покажет доступные TEST варианты проживания.'],
  ['Что означает тестовая цена?','Цена получена из Hotelbeds TEST. Реальное бронирование и оплата сейчас отключены.'],
  ['Почему цена может измениться?','Доступность и цена зависят от дат и выбранного тарифа. Перед будущим оформлением их потребуется проверить повторно.'],
  ['Что входит в стоимость?','Состав зависит от тарифа: тип номера, питание, количество ночей и гостей показаны в карточке и деталях. Перелёт не включён. Если условия не указаны, они не считаются включёнными.'],
];
export default function FaqSection() {
  const [open,setOpen]=useState(null);
  return <section id="faq" className="faq-section"><div className="section-header"><h2>Часто задаваемые вопросы</h2><p>Что полезно знать перед поиском</p></div><div className="faq-list">{questions.map(([question,answer],index)=><div className="faq-item" key={question}>
    <button type="button" id={`faq-question-${index}`} className="faq-question" aria-expanded={open===index} aria-controls={`faq-answer-${index}`} onClick={()=>setOpen(open===index?null:index)}><span>{question}</span><span aria-hidden="true">{open===index?'−':'+'}</span></button>
    <div id={`faq-answer-${index}`} className="faq-answer" role="region" aria-labelledby={`faq-question-${index}`} hidden={open!==index}>{answer}</div>
  </div>)}</div></section>;
}
