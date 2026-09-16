const rate = (key, price, extra={}) => ({rateKey:`offline-3o-${key}`,rateType:'BOOKABLE',net:price,
  paymentType:'AT_WEB',packaging:false,rateClass:'NOR',boardCode:'BB',boardName:'Breakfast',
  rooms:1,adults:2,children:0,...extra});
const hotel = (code, rates, roomCode='DBL') => ({code,name:'Same hotel name',currency:'EUR',
  rooms:[{code:roomCode,name:'  Superior   DOUBLE  ',rates}]});
function response() {
  return {hotels:{hotels:[
    hotel(101,[rate('expensive','500.00'),rate('cheap','318.29'),rate('middle','400.00')]),
    hotel(102,[rate('invalid',null),rate('valid','75.74',{boardCode:'XZ',boardName:'Provider special board'})]),
    hotel(101,[rate('duplicate','350.00')]),
  ]}};
}
module.exports={rate,hotel,response};
