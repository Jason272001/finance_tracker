(function () {
  'use strict';
  if (document.documentElement.dataset.demo !== 'workspace') return;
  document.addEventListener('DOMContentLoaded', () => {
    const hub = document.getElementById('demoBusinessHub');
    if (!hub) return;
    const button = document.createElement('button');
    button.type = 'button'; button.dataset.hubTab = 'accounting'; button.textContent = 'Accounting'; button.setAttribute('aria-pressed', 'false');
    hub.querySelector('nav[aria-label="Business hub sections"]').append(button);
    const panel = document.createElement('section'); panel.dataset.hubPanel = 'accounting'; panel.hidden = true;
    panel.innerHTML = '<h3>Accounting overview</h3><p>Connected sample reports from POS sales, supplier purchases and operating expenses. Shared across branches. Refresh resets everything.</p><div class="row"><button type="button" id="accountingExport">Download accounting CSV</button><button type="button" class="secondary" data-hub-tab="budgets">Record an expense</button></div><div id="accountingSummary" class="pos-metrics"></div><h4>Profit &amp; loss</h4><div id="accountingProfit" class="pos-table-wrap"></div><h4>Activity ledger</h4><p>Tax collected is shown separately from revenue. Purchases increase inventory; product costs enter profit when products sell. Voided sales are excluded from totals. Collection less spending is a movement estimate, not a bank balance. Supplier purchases and expenses are assumed paid; payroll, receivables, payables, refunds, depreciation and tax filing are not modeled.</p><div id="accountingLedger" class="pos-table-wrap"></div><p>Demo reports only. These are not a complete set of books or tax documents.</p>';
    hub.append(panel);
    const cash = n => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(n/100);
    const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const table = (headers,rows) => '<table><thead><tr>'+headers.map(s=>'<th scope="col">'+esc(s)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(s=>'<td>'+esc(s)+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
    function report() {
      const data = window.PosDemo.snapshot(), expenses = window.BusinessHubDemo.expenses(), sales = data.sales.filter(s=>s.status==='completed');
      const sum = (rows,fn) => rows.reduce((n,r)=>n+fn(r),0);
      const gross=sum(sales,s=>s.subtotal), discount=sum(sales,s=>s.discount), tax=sum(sales,s=>s.tax), collected=sum(sales,s=>s.total);
      const cost=sum(sales,s=>sum(s.items,i=>i.quantity*i.unitCost)), operating=sum(expenses,e=>e.amount), purchases=sum(data.purchases,p=>p.total), net=gross-discount-cost-operating;
      const rows=[['Gross sales',gross],['Sales discounts',-discount],['Net sales',gross-discount],['Cost of goods sold',-cost],['Gross profit',gross-discount-cost],['Operating expenses',-operating],['Estimated operating profit',net],['Tax collected (not revenue)',tax],['Supplier purchases (inventory)',purchases],['Collections less purchases and expenses',collected-purchases-operating],['Current inventory at cost',sum(data.products,p=>p.stock*p.cost)]];
      const ledger=[...data.sales.map(s=>[s.date.slice(0,10),s.id,s.status==='completed'?'Sale':'Voided sale',s.customer,s.status==='completed'?s.total:0,s.promotion?.code||'']),...data.purchases.map(p=>[p.date.slice(0,10),p.id,'Inventory purchase',p.supplier,-p.total,p.reference]),...expenses.map(e=>[e.date,'EXP-'+e.id,'Operating expense',e.description,-e.amount,e.category])].sort((a,b)=>b[0].localeCompare(a[0]));
      return {rows,ledger,net,tax,collected};
    }
    function render() {
      const r=report();
      document.getElementById('accountingSummary').innerHTML=[['Net sales',r.rows[2][1]],['Operating profit',r.net],['Tax collected',r.tax],['Sales collected',r.collected]].map(([k,v])=>'<article><span>'+k+'</span><strong>'+cash(v)+'</strong></article>').join('');
      document.getElementById('accountingProfit').innerHTML=table(['Account','Amount (USD)'],r.rows.map(([k,v])=>[k,cash(v)]));
      document.getElementById('accountingLedger').innerHTML=table(['Date','Reference','Activity','Description','Movement (USD)','Promotion / note'],r.ledger.map(r=>r.map((v,i)=>i===4?cash(v):v)));
    }
    document.getElementById('accountingExport').onclick=()=>{
      const r=report(), cell=s=>typeof s==='number'?String(s):'"'+String(s).replace(/^\s*[=+@\-]/,"'$&").replace(/"/g,'""')+'"';
      const csv=[['DEMO ONLY - accounting overview'],['Account','USD'],...r.rows.map(([k,v])=>[k,Number((v/100).toFixed(2))]),[],['Date','Reference','Activity','Description','Movement USD','Promotion / note'],...r.ledger.map(r=>r.map((v,i)=>i===4?Number((v/100).toFixed(2)):v))].map(r=>r.map(cell).join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='sample-accounting-DEMO.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    };
    document.addEventListener('keeper-pos-change',render); document.addEventListener('keeper-expense-change',render); render();
  });
})();
