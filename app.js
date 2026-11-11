const currency = document.querySelector('#currency');
const amount = document.querySelector('#amount');
const months = document.querySelector('#months');
const money = (value) => new Intl.NumberFormat(undefined, { style: 'currency', currency: currency.value, maximumFractionDigits: 0 }).format(value);
function updateEstimate() {
  const principal = Number(amount.value);
  const term = Number(months.value);
  const total = principal * (1 + 0.16 * term / 12);
  document.querySelector('#amountOut').textContent = money(principal);
  document.querySelector('#monthsOut').textContent = `${term} months`;
  document.querySelector('#monthly').textContent = money(total / term);
  document.querySelector('#principal').textContent = money(principal);
  document.querySelector('#total').textContent = money(total);
  document.querySelector('#term').textContent = `${term} months`;
}
[currency, amount, months].forEach((control) => control.addEventListener('input', updateEstimate));
updateEstimate();

