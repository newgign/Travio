import { useState } from 'react';
import { Link } from 'react-router-dom';
import { faqItems } from '../content/helpContent';
import './FaqSection.css';
export default function FaqSection({ full = false }) {
  const questions = full ? faqItems : faqItems.slice(0, 4);
  const [open,setOpen]=useState(null);
  return <section id="faq" className="faq-section"><div className="section-header"><h2>Часто задаваемые вопросы</h2><p>Что полезно знать перед поиском</p></div><div className="faq-list">{questions.map(([question,answer],index)=><div className="faq-item" key={question}>
    <button type="button" id={`faq-question-${index}`} className="faq-question" aria-expanded={open===index} aria-controls={`faq-answer-${index}`} onClick={()=>setOpen(open===index?null:index)}><span>{question}</span><span aria-hidden="true">{open===index?'−':'+'}</span></button>
    <div id={`faq-answer-${index}`} className="faq-answer" role="region" aria-labelledby={`faq-question-${index}`} hidden={open!==index}>{answer}</div>
  </div>)}</div>{!full && <Link to="/help">Все вопросы и помощь</Link>}</section>;
}
