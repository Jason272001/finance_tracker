(function(){
  'use strict';if(document.documentElement.dataset.demo!=='workspace')return;
  window.DemoProductAssistant={
    online:['keeperbma.com','www.keeperbma.com'].includes(location.hostname),
    async ask(message,history=[]){
      if(String(message||'').length>2000)throw Error('Please keep your question under 2000 characters.');
      const fallback=()=>({...ProductGuide.answer(message,history),notice:'Product guide · AI is not connected.'});
      if(!this.online)return fallback();
      try{
        const response=await fetch('/api/product-assistant',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',signal:AbortSignal.timeout(25000),body:JSON.stringify({message,history:(history||[]).slice(-6).map(x=>({role:x.role,content:String(x.content||'').slice(0,1500)}))})});
        if(!response.ok)throw Error('unavailable');const data=await response.json();if(typeof data.reply!=='string')throw Error('invalid');return data;
      }catch(_){return {...fallback(),notice:'AI is unavailable. Showing product-guide information.'};}
    }
  };
})();
