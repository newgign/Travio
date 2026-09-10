import { formatMoney } from '../utils/money';
export default function RateConditions({ offer }) {
  const policies = offer.cancellationPolicies || [];
  const taxes = offer.taxes?.taxes || [];
  return <div className="cancellation-note">
    <p>{offer.rateClass === 'NRF' ? 'Невозвратный тариф' : 'Отмена по условиям выбранного тарифа'}</p>
    {policies.length ? policies.map((policy, index) => <p key={index}>
      С {policy.from}: штраф {formatMoney(policy.amount, offer.currency)}
    </p>) : <p>Условия отмены уточняются перед подтверждением.</p>}
    {taxes.map((tax, index) => <p key={index}>{tax.type || 'Налог'}: {formatMoney(tax.amount, tax.currency || offer.currency)} — {tax.included ? 'включён' : 'не включён, оплачивается отдельно'}</p>)}
    {!offer.taxBreakdownAvailable && <p>Детализация налогов не предоставлена. Дополнительные сборы могут оплачиваться в отеле согласно условиям тарифа.</p>}
    {offer.rateComments && <p>{offer.rateComments}</p>}
  </div>;
}
