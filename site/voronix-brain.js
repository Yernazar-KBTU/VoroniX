/* VoroniX AI brain 5aebaad, built from https://github.com/Yernazar-KBTU/VoroniX-AI (MIT). */
"use strict";(()=>{var Ie=Object.defineProperty;var ze=(n,e,t)=>e in n?Ie(n,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):n[e]=t;var x=(n,e,t)=>ze(n,typeof e!="symbol"?e+"":e,t);var ue=()=>"";var v=["greeting","price","booking","cancel","complaint","address","hours","confirm","thanks","other"],E=["ru","kk","en"],dt=ue(new URL("../data/phrases.tsv","https://voronix.local/src/"));function me(n){return n.split(/\r?\n/).filter(t=>t.trim()&&!t.startsWith("#")).slice(1).map((t,s)=>{let[r,o,i]=t.split("	"),l=o?.split(",").map(d=>d.trim())??[];if(!E.includes(r)||!i||!l.length||l.some(d=>!v.includes(d)))throw new Error(`phrases.tsv line ${s+2} is not valid: ${t}`);return{text:i.trim(),lang:r,labels:l}})}var _e={\u04D9:"\u0430",\u0493:"\u0433",\u049B:"\u043A",\u04A3:"\u043D",\u04E9:"\u043E",\u04B1:"\u0443",\u04AF:"\u0443",\u04BB:"\u0445",\u0456:"\u0438"};function P(n){let e=n.filter(t=>t.lang==="kk"&&/[әғқңөұүһі]/i.test(t.text)).map(t=>({...t,text:t.text.replace(/[әғқңөұүһі]/gi,s=>_e[s.toLowerCase()]??s)}));return[...n,...e]}var qe={\u04D9:"\u0430",\u0493:"\u0433",\u049B:"\u043A",\u04A3:"\u043D",\u04E9:"\u043E",\u04B1:"\u0443",\u04AF:"\u0443",\u04BB:"\u0445",\u0456:"\u0438"},O=n=>n.toLowerCase().replace(/ё/g,"\u0435").replace(/[әғқңөұүһі]/g,e=>qe[e]),Q=n=>` ${O(n).replace(/[^\p{L}\p{N}:.\/+ ]+/gu," ").replace(/\s+/g," ").trim()} `,We=/[әғқңөұүһі]|(^|[^а-я])(сәлем|салем|салеметсиз|рахмет|канша|кашан|бола ма|жазыл|ертен|бугин|келеди|жок|ия|макул|жарайды|уакыт)/i,fe=n=>We.test(n)?"kk":/[а-яё]/i.test(n)?"ru":/[a-z]{2}/i.test(n)?"en":null,B=n=>String(n).padStart(2,"0"),A=n=>`${n.getFullYear()}-${B(n.getMonth()+1)}-${B(n.getDate())}`,W=(n,e)=>{let t=new Date(n);return t.setDate(t.getDate()+e),t},He=[[/воскресень|sunday|жексенби/,0],[/понедельник|monday|дуйсенби/,1],[/вторник|tuesday|сейсенби/,2],[/сред[уаы]|wednesday|сарсенби/,3],[/четверг|thursday|бейсенби/,4],[/пятниц|friday| жума/,5],[/суббот|saturday|(^|\s)сенби/,6]];function he(n,e){let t=Q(n);if(/послезавтра|day after tomorrow|бурсигуни/.test(t))return A(W(e,2));if(/завтра|tomorrow|ертен/.test(t))return A(W(e,1));if(/сегодня|today|tonight|бугин/.test(t))return A(e);let s=/(?:^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s)/.exec(t);if(s){let r=+s[1],o=+s[2];if(r>=1&&r<=31&&o>=1&&o<=12){let i=e.getFullYear();return new Date(i,o-1,r)<new Date(e.getFullYear(),e.getMonth(),e.getDate())&&(i+=1),`${i}-${B(o)}-${B(r)}`}}if(/выходн|weekend|демалыс кун/.test(t))return de(e,6);for(let[r,o]of He)if(r.test(t))return de(e,o);return null}function de(n,e){return A(W(n,(e-n.getDay()+7)%7))}function ge(n){let e=Q(n),t=/(?:^|\s)(\d{1,2})[:.](\d{2})(?=\s)/.exec(e);if(t&&+t[1]<=23&&+t[2]<60&&!/\d[./]\d{1,2}[./]/.test(e))return{exact:`${B(+t[1])}:${t[2]}`};let s=/(?:^|\s)(\d{1,2})\s?(am|pm)(?=\s)/.exec(e);if(s){let i=+s[1]%12;if(s[2]==="pm"&&(i+=12),i>=9&&i<=21)return{exact:`${B(i)}:00`}}let r=/после\s+(\d{1,2})|after\s+(\d{1,2})|(\d{1,2})\s?-?(?:дан|ден|тан|тен) кейин/.exec(e);if(r){let i=+(r[1]??r[2]??r[3]);return i<9&&(i+=12),{from:i*60}}let o=/(?:^|\s)(?:в|к|на|at|сагат)\s+(\d{1,2})(?:\s?(?:часов|часа|час|ч)(?=\s))?(?=\s|-)/.exec(e)??/(?:^|\s)(\d{1,2})\s?-?(?:де|да|те|та|ге|га|ке|ка)(?=\s)/.exec(e);if(o&&!/(?:^|\s)(?:в|на)\s+\d{1,2}\s+(?:числ|январ|феврал|март|апрел|ма[йя]|июн|июл|август|сентяб|октяб|ноябр|декабр)/.test(e)){let i=+o[1];if(i>=1&&i<=8&&(i+=12),i>=9&&i<=21)return{exact:`${B(i)}:00`}}return/после работы|вечер|evening|after work|tonight|кешке|кешки|жумыстан кейин/.test(e)?{from:1020}:/после обеда|днем|afternoon|тустен кейин/.test(e)?{from:780,to:1020}:/утр|morning|танерте|тангы/.test(e)?{to:720}:null}var Ve=new Set(["\u0434\u0430","\u043D\u0435\u0442","\u043E\u043A","\u043E\u043A\u0435\u0439","\u0445\u043E\u0440\u043E\u0448\u043E","\u0441\u043F\u0430\u0441\u0438\u0431\u043E","\u0434\u0430\u0432\u0430\u0439\u0442\u0435","yes","no","ok","okay","thanks","\u0437\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435","\u043F\u0440\u0438\u0432\u0435\u0442","hello","hi","\u0438\u04D9","\u0438\u044F","\u0436\u043E\u049B","\u0440\u0430\u0445\u043C\u0435\u0442","\u0436\u0430\u0440\u0430\u0439\u0434\u044B","\u0431\u043E\u043B\u0430\u0434\u044B","\u0441\u04D9\u043B\u0435\u043C","\u043C\u0430\u049B\u04B1\u043B"]),Ke=n=>n.charAt(0).toUpperCase()+n.slice(1);function pe(n){let e=/(?:меня зовут|зовут меня|my name is|i am|i'm|менің атым|атым|есімім)\s+([\p{L}-]{2,20})/iu.exec(n);return e&&!Ve.has(e[1].toLowerCase())?Ke(e[1]):null}var be=n=>/(жалоб|ужас|отвратит|верните деньги|возврат|недовол|испортил|криво|косяк|аллерги|ожог|refund|complain|terrible|awful|ruined|шағым|наразы|сұмдық|ақшамды қайтар|бүлдір|күйіп)/i.test(n),ye=n=>/^(да|ага|давайте|давай|подходит|хорошо|ок|окей|отлично|супер|go|yes|yep|ok|okay|sure|sounds good|perfect|works|иә|ия|иа|жарайды|болады|мақұл|келістік|жақсы|керемет)(?=$|[\s,.!)])/i.test(n.trim());function we(n){let e=O(n).trim();return/перв|first|1-?й|биринши|^1\b/.test(e)?0:/втор|second|2-?й|екинши|^2\b/.test(e)?1:/трет|third|3-?й|ушинши|^3\b/.test(e)?2:null}function ke(n,e){let t=Q(n),s=null;for(let r of e){let o=r.stems.filter(i=>t.includes(O(i))).length;Object.values(r.names).some(i=>i&&t.includes(` ${O(i)} `))&&(o+=2),o>0&&(!s||o>s.score)&&(s={s:r,score:o})}return s?.s??null}var Fe={\u0430:"a",\u0431:"b",\u0432:"v",\u0433:"g",\u0434:"d",\u0435:"e",\u0451:"yo",\u0436:"zh",\u0437:"z",\u0438:"i",\u0439:"y",\u043A:"k",\u043B:"l",\u043C:"m",\u043D:"n",\u043E:"o",\u043F:"p",\u0440:"r",\u0441:"s",\u0442:"t",\u0443:"u",\u0444:"f",\u0445:"kh",\u0446:"ts",\u0447:"ch",\u0448:"sh",\u0449:"shch",\u044A:"",\u044B:"y",\u044C:"",\u044D:"e",\u044E:"yu",\u044F:"ya",\u04D9:"a",\u0493:"gh",\u049B:"q",\u04A3:"ng",\u04E9:"o",\u04B1:"u",\u04AF:"u",\u04BB:"h",\u0456:"i"},xe=n=>n.replace(/[\u0400-\u04ff]/g,e=>{let t=Fe[e.toLowerCase()]??e;return e===e.toLowerCase()?t:t.charAt(0).toUpperCase()+t.slice(1)});var $e={name:"Barberista",city:"Almaty",address:{ru:"\u0410\u043B\u043C\u0430\u0442\u044B, \u0443\u043B. \u041F\u0430\u043D\u0444\u0438\u043B\u043E\u0432\u0430 98 (\u0434\u0435\u043C\u043E-\u0430\u0434\u0440\u0435\u0441)",kk:"\u0410\u043B\u043C\u0430\u0442\u044B, \u041F\u0430\u043D\u0444\u0438\u043B\u043E\u0432 \u043A-\u0441\u0456 98 (\u0434\u0435\u043C\u043E \u043C\u0435\u043A\u0435\u043D\u0436\u0430\u0439)",en:"98 Panfilov St, Almaty (demo address)"},from:"10:00",to:"21:00",phone:"+7 700 000 0000",currency:"\u20B8",services:[{id:"HC-01",names:{ru:"\u041C\u0443\u0436\u0441\u043A\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430",kk:"\u0415\u0440\u043B\u0435\u0440 \u0448\u0430\u0448 \u049B\u0438\u044E",en:"Men's haircut"},minutes:60,price:7e3,stems:["\u0441\u0442\u0440\u0438\u0436","\u043F\u043E\u0434\u0441\u0442\u0440\u0438","\u043F\u043E\u0441\u0442\u0440\u0438","haircut","hair cut","\u0448\u0430\u0448 \u043A\u0438","\u0448\u0430\u0448\u044B\u043C\u0434\u044B \u043A\u0438","\u043C\u0443\u0436\u0441\u043A","\u0431\u0430\u0440\u0431\u0435\u0440"," men"]},{id:"HC-02",names:{ru:"\u0421\u0442\u0440\u0438\u0436\u043A\u0430 \u043C\u0430\u0448\u0438\u043D\u043A\u043E\u0439",kk:"\u041C\u0430\u0448\u0438\u043D\u043A\u0430\u043C\u0435\u043D \u049B\u0438\u044E",en:"Clipper cut"},minutes:30,price:4e3,stems:["\u043C\u0430\u0448\u0438\u043D\u043A","\u043F\u043E\u0434 \u043D\u043E\u043B\u044C","clipper","buzz","\u0441\u0442\u0440\u0438\u0436","\u0448\u0430\u0448 \u043A\u0438"]},{id:"KD-03",names:{ru:"\u0414\u0435\u0442\u0441\u043A\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430",kk:"\u0411\u0430\u043B\u0430\u043B\u0430\u0440 \u0448\u0430\u0448 \u049B\u0438\u044E",en:"Kids haircut"},minutes:45,price:5e3,stems:["\u0434\u0435\u0442\u0441\u043A","\u0440\u0435\u0431\u0435\u043D"," \u0441\u044B\u043D","\u0434\u043E\u0447\u043A"," kid","child"," son ","\u0431\u0430\u043B\u0430","\u0443\u043B\u044B\u043C","\u0441\u0442\u0440\u0438\u0436","haircut","\u0448\u0430\u0448 \u043A\u0438"]},{id:"BD-04",names:{ru:"\u041E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0438\u0435 \u0431\u043E\u0440\u043E\u0434\u044B",kk:"\u0421\u0430\u049B\u0430\u043B \u0442\u04AF\u0437\u0435\u0442\u0443",en:"Beard trim"},minutes:45,price:5e3,stems:["\u0431\u043E\u0440\u043E\u0434","beard","\u0441\u0430\u043A\u0430\u043B"," \u0443\u0441\u044B","\u0431\u043E\u0440\u043E\u0434\u0443"]},{id:"CB-05",names:{ru:"\u0421\u0442\u0440\u0438\u0436\u043A\u0430 \u0438 \u0431\u043E\u0440\u043E\u0434\u0430",kk:"\u0428\u0430\u0448 \u043F\u0435\u043D \u0441\u0430\u049B\u0430\u043B",en:"Haircut and beard"},minutes:90,price:11e3,stems:["\u0441\u0442\u0440\u0438\u0436","\u0431\u043E\u0440\u043E\u0434","haircut","beard","\u0448\u0430\u0448","\u0441\u0430\u043A\u0430\u043B"]},{id:"SH-06",names:{ru:"\u041A\u043E\u0440\u043E\u043B\u0435\u0432\u0441\u043A\u043E\u0435 \u0431\u0440\u0438\u0442\u044C\u0451",kk:"\u041A\u043E\u0440\u043E\u043B\u044C\u0434\u0456\u043A \u049B\u044B\u0440\u044B\u043D\u0443",en:"Royal shave"},minutes:45,price:6e3,stems:["\u0431\u0440\u0438\u0442\u044C","\u0431\u0440\u0438\u0442\u044C\u0435","\u043F\u043E\u0431\u0440\u0438","shave","\u043A\u044B\u0440\u044B\u043D","\u0443\u0441\u0442\u0430\u0440"]},{id:"VP-07",names:{ru:"VIP-\u0440\u0438\u0442\u0443\u0430\u043B",kk:"VIP-\u0440\u04D9\u0441\u0456\u043C",en:"VIP ritual"},minutes:150,price:22e3,stems:["\u0432\u0438\u043F"," vip","\u0440\u0438\u0442\u0443\u0430\u043B","\u0440\u0430\u0441\u0438\u043C"]},{id:"CM-08",names:{ru:"\u041A\u0430\u043C\u0443\u0444\u043B\u044F\u0436 \u0441\u0435\u0434\u0438\u043D\u044B",kk:"\u0410\u049B \u0448\u0430\u0448\u0442\u044B \u0431\u043E\u044F\u0443",en:"Grey camouflage"},minutes:30,price:5e3,stems:["\u043A\u0430\u043C\u0443\u0444\u043B","\u0441\u0435\u0434\u0438\u043D","grey","gray","\u0430\u043A \u0448\u0430\u0448","\u0430\u0433\u0430\u0440\u0433\u0430\u043D","\u0431\u043E\u044F\u0443","\u043E\u043A\u0440\u0430\u0448","\u043F\u043E\u043A\u0440\u0430\u0441"]}],staff:[{id:"MS-01",name:"\u0422\u0438\u043C\u0443\u0440 \u0411.",role:"Senior barber",from:"10:00",to:"21:00",days:[1,2,3,4,5,6],services:["HC-01","BD-04","CB-05","VP-07","CM-08"]},{id:"MS-02",name:"\u0410\u0440\u043C\u0430\u043D \u041A.",role:"Barber",from:"10:00",to:"21:00",days:[1,2,3,4,5,6],services:["HC-01","HC-02","KD-03","CB-05"]},{id:"MS-03",name:"\u0414\u0430\u043D\u0438\u044F\u0440 \u0421.",role:"Barber",from:"12:00",to:"21:00",days:[0,2,3,4,5,6],services:["HC-01","HC-02","BD-04","KD-03"]},{id:"MS-04",name:"\u0415\u0440\u0436\u0430\u043D \u041C.",role:"Shave master",from:"10:00",to:"19:00",days:[1,2,3,4,5],services:["SH-06","BD-04","VP-07"]}]},K=n=>{let[e,t]=n.split(":").map(Number);return e*60+t},X=n=>`${B(Math.floor(n/60))}:${B(n%60)}`,H=n=>{let[e,t]=n.split("T"),[s,r,o]=e.split("-").map(Number),[i,l]=(t??"00:00").split(":").map(Number);return new Date(s,r-1,o,i,l)};function ve(n,e,t,s,r){let o=n.services.find(f=>f.id===t);if(!o)return[];let l=H(`${s}T00:00`).getDay(),c=s===A(r.now)?r.now.getHours()*60+r.now.getMinutes()+30:0,a=[],u=n.staff.filter(f=>f.services.includes(t)&&f.days.includes(l)).sort((f,m)=>f.id===r.staff?-1:m.id===r.staff?1:0);for(let f of u){let m=e.filter(p=>p.staff===f.id&&p.status==="booked"&&p.start.startsWith(s)).map(p=>[K(p.start.slice(11)),K(p.start.slice(11))+p.minutes]);for(let p=Math.max(K(f.from),Math.ceil(c/30)*30);p+o.minutes<=K(f.to);p+=30){if(m.some(([L,g])=>p<g&&p+o.minutes>L))continue;let k=r.pref;k?.exact&&X(p)!==k.exact||k?.from!==void 0&&p<k.from||k?.to!==void 0&&p>=k.to||a.push({staff:f.id,start:`${s}T${X(p)}`})}}let h=new Set;return a.sort((f,m)=>(f.staff===r.staff?0:1)-(m.staff===r.staff?0:1)||f.start.localeCompare(m.start)).filter(f=>h.has(f.start)?!1:(h.add(f.start),!0)).slice(0,r.limit??3).sort((f,m)=>f.start.localeCompare(m.start))}function Me(n,e,t,s,r){let o=s?H(`${s}T00:00`):r.now;for(let i=0;i<7;i++){let l=A(W(o,i)),d=ve(n,e,t,l,r);if(!d.length&&r.pref?.exact&&i===0&&(d=ve(n,e,t,l,{...r,pref:null})),d.length)return d}return[]}var Ye={ru:["\u0432\u0441","\u043F\u043D","\u0432\u0442","\u0441\u0440","\u0447\u0442","\u043F\u0442","\u0441\u0431"],kk:["\u0436\u0441","\u0434\u0441","\u0441\u0441","\u0441\u0440","\u0431\u0441","\u0436\u043C","\u0441\u0431"],en:["Sun","Mon","Tue","Wed","Thu","Fri","Sat"]};function I(n,e){let t=H(n);return`${Ye[e][t.getDay()]} ${B(t.getDate())}.${B(t.getMonth()+1)}, ${n.slice(11,16)}`}var z=(n,e,t)=>n.services.find(s=>s.id===e)?.names[t]??e,_=(n,e,t)=>{let s=n.staff.find(r=>r.id===e)?.name??e;return t==="en"?xe(s):s},N=(n,e)=>`${e.toLocaleString("ru-RU").replace(/ /g," ")} ${n.currency}`;function Se(n,e,t){let s=`${A(t)}T${X(t.getHours()*60+t.getMinutes())}`;return n.filter(r=>r.client===e&&r.status==="booked"&&r.start>=s).sort((r,o)=>r.start.localeCompare(o.start))}function Le(n,e,t,s){let r=`SV-${Date.now().toString(36).slice(-5).toUpperCase()}`,o=n.toLowerCase().split(/\s+/).filter(i=>i.length>2).map(i=>i.slice(0,Math.max(4,Math.min(i.length-1,6))));return{id:r,names:{ru:n,kk:n,en:n,[s]:n},minutes:t,price:e,stems:o.length?o:[n.toLowerCase()]}}function Ce(n,e,t,s,r,o){return{id:n,name:e,channel:t,handle:s,lang:r,first:o,last:o,messages:0,intents:{},services:{},staff:{},times:{morning:0,day:0,evening:0},bookings:0,cancels:0,complaints:0,thanks:0,mood:0,history:[],dialog:{stage:"idle"}}}var Ue={thanks:1,confirm:.4,greeting:.2,complaint:-1,cancel:-.2};function ee(n,e,t){let s={...n,last:e.at,history:[...n.history,e].slice(-14)};if(e.from==="client"){s.messages=n.messages+1,t&&(s.lang=t);let r={...n.intents},o=0;for(let i of e.labels??[])r[i]=(r[i]??0)+1,o+=Ue[i]??0;s.intents=r,s.mood=Math.round((n.mood*.7+Math.max(-1,Math.min(1,o))*.3)*100)/100,e.labels?.includes("thanks")&&(s.thanks=n.thanks+1),e.labels?.includes("complaint")&&(s.complaints=n.complaints+1)}return s}function te(n,e,t=!1){if(t)return{...n,cancels:n.cancels+1};let s=H(e.start).getHours(),r=s<12?"morning":s<17?"day":"evening";return{...n,bookings:n.bookings+1,services:{...n.services,[e.service]:(n.services[e.service]??0)+1},staff:{...n.staff,[e.staff]:(n.staff[e.staff]??0)+1},times:{...n.times,[r]:n.times[r]+1}}}var Z=n=>Object.entries(n).sort((e,t)=>t[1]-e[1])[0]?.[0];function Ee(n){let e=Z(n.times);return{service:Z(n.services),staff:Z(n.staff),time:e&&n.times[e]>0?e:void 0}}var Ge=.7,M={hello:n=>({ru:`\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435${n?`, ${n}`:""}!`,kk:`\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437 \u0431\u0435${n?`, ${n}`:""}!`,en:`Hello${n?`, ${n}`:""}!`}),help:{ru:"\u0427\u0435\u043C \u043C\u043E\u0433\u0443 \u043F\u043E\u043C\u043E\u0447\u044C? \u041C\u043E\u0433\u0443 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u0430\u0441, \u043F\u043E\u0434\u0441\u043A\u0430\u0437\u0430\u0442\u044C \u0446\u0435\u043D\u044B, \u0430\u0434\u0440\u0435\u0441 \u0438 \u0447\u0430\u0441\u044B \u0440\u0430\u0431\u043E\u0442\u044B.",kk:"\u049A\u0430\u043B\u0430\u0439 \u043A\u04E9\u043C\u0435\u043A\u0442\u0435\u0441\u0435 \u0430\u043B\u0430\u043C\u044B\u043D? \u0416\u0430\u0437\u044B\u043F \u049B\u043E\u044F\u043C\u044B\u043D, \u0431\u0430\u0493\u0430\u0441\u044B\u043D, \u043C\u0435\u043A\u0435\u043D\u0436\u0430\u0439\u0434\u044B \u0436\u04D9\u043D\u0435 \u0436\u04B1\u043C\u044B\u0441 \u0443\u0430\u049B\u044B\u0442\u044B\u043D \u0430\u0439\u0442\u0430\u043C\u044B\u043D.",en:"How can I help? I can book you in and tell you prices, the address and opening hours."},welcomeBack:(n,e)=>({ru:`\u0420\u0430\u0434\u044B \u0441\u043D\u043E\u0432\u0430 \u0432\u0438\u0434\u0435\u0442\u044C! \u041A\u0430\u043A \u043E\u0431\u044B\u0447\u043D\u043E, ${n} \u0443 \u043C\u0430\u0441\u0442\u0435\u0440\u0430 ${e}?`,kk:`\u049A\u0430\u0439\u0442\u0430 \u043A\u04E9\u0440\u0433\u0435\u043D\u0456\u043C\u0456\u0437\u0433\u0435 \u049B\u0443\u0430\u043D\u044B\u0448\u0442\u044B\u043C\u044B\u0437! \u04D8\u0434\u0435\u0442\u0442\u0435\u0433\u0456\u0434\u0435\u0439, ${n}, \u0448\u0435\u0431\u0435\u0440 ${e}?`,en:`Good to see you again! The usual ${n} with ${e}?`}),askService:n=>({ru:`\u041D\u0430 \u043A\u0430\u043A\u0443\u044E \u0443\u0441\u043B\u0443\u0433\u0443 \u0432\u0430\u0441 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C? \u041D\u0430\u043F\u0440\u0438\u043C\u0435\u0440: ${n}.`,kk:`\u049A\u0430\u0439 \u049B\u044B\u0437\u043C\u0435\u0442\u043A\u0435 \u0436\u0430\u0437\u0430\u0439\u044B\u043D? \u041C\u044B\u0441\u0430\u043B\u044B: ${n}.`,en:`Which service would you like? For example: ${n}.`}),offer:(n,e)=>({ru:`${n}: \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E ${e}. \u041A\u0430\u043A\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0443\u0434\u043E\u0431\u043D\u043E?`,kk:`${n}: \u0431\u043E\u0441 \u0443\u0430\u049B\u044B\u0442 ${e}. \u049A\u0430\u0439\u0441\u044B\u0441\u044B \u044B\u04A3\u0493\u0430\u0439\u043B\u044B?`,en:`${n}: free times ${e}. Which one suits you?`}),booked:(n,e,t,s)=>({ru:`\u0413\u043E\u0442\u043E\u0432\u043E! \u0412\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u043D\u044B: ${n}, ${e}, \u043C\u0430\u0441\u0442\u0435\u0440 ${t}. \u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C ${s}. \u0416\u0434\u0451\u043C \u0432\u0430\u0441!`,kk:`\u0414\u0430\u0439\u044B\u043D! \u0421\u0456\u0437 \u0436\u0430\u0437\u044B\u043B\u0434\u044B\u04A3\u044B\u0437: ${n}, ${e}, \u0448\u0435\u0431\u0435\u0440 ${t}. \u0411\u0430\u0493\u0430\u0441\u044B ${s}. \u041A\u04AF\u0442\u0435\u043C\u0456\u0437!`,en:`Done! You're booked: ${n}, ${e} with ${t}. Price ${s}. See you!`}),noSlots:{ru:"\u041A \u0441\u043E\u0436\u0430\u043B\u0435\u043D\u0438\u044E, \u043D\u0430 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0443\u044E \u043D\u0435\u0434\u0435\u043B\u044E \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u043D\u0435\u0442. \u042F \u043F\u0435\u0440\u0435\u0434\u0430\u043B \u0432\u043E\u043F\u0440\u043E\u0441 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443.",kk:"\u04E8\u043A\u0456\u043D\u0456\u0448\u043A\u0435 \u049B\u0430\u0440\u0430\u0439, \u0436\u0430\u049B\u044B\u043D \u0430\u043F\u0442\u0430\u0434\u0430 \u0431\u043E\u0441 \u0443\u0430\u049B\u044B\u0442 \u0436\u043E\u049B. \u0421\u04B1\u0440\u0430\u0493\u044B\u04A3\u044B\u0437\u0434\u044B \u04D9\u043A\u0456\u043C\u0448\u0456\u0433\u0435 \u0436\u0456\u0431\u0435\u0440\u0434\u0456\u043C.",en:"Sorry, there is no free time in the coming week. I've passed this to the manager."},cancelled:(n,e)=>({ru:`\u0412\u0430\u0448\u0430 \u0437\u0430\u043F\u0438\u0441\u044C \u043E\u0442\u043C\u0435\u043D\u0435\u043D\u0430: ${n}, ${e}. \u0417\u0430\u0445\u043E\u0442\u0438\u0442\u0435 \u043F\u0440\u0438\u0439\u0442\u0438 \u0432 \u0434\u0440\u0443\u0433\u043E\u0439 \u0434\u0435\u043D\u044C, \u043F\u0440\u043E\u0441\u0442\u043E \u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435.`,kk:`\u0416\u0430\u0437\u044B\u043B\u0443\u044B\u04A3\u044B\u0437 \u0431\u043E\u043B\u0434\u044B\u0440\u044B\u043B\u043C\u0430\u0434\u044B: ${n}, ${e}. \u0411\u0430\u0441\u049B\u0430 \u043A\u04AF\u043D\u0456 \u043A\u0435\u043B\u0433\u0456\u04A3\u0456\u0437 \u043A\u0435\u043B\u0441\u0435, \u0436\u0430\u0437\u044B\u04A3\u044B\u0437.`,en:`Your booking is cancelled: ${n}, ${e}. Message us any time to book another day.`}),noBooking:{ru:"\u041D\u0435 \u043D\u0430\u0448\u0451\u043B \u0432\u0430\u0448\u0438\u0445 \u0431\u0443\u0434\u0443\u0449\u0438\u0445 \u0437\u0430\u043F\u0438\u0441\u0435\u0439. \u0412\u043E\u0437\u043C\u043E\u0436\u043D\u043E, \u0437\u0430\u043F\u0438\u0441\u044C \u043E\u0444\u043E\u0440\u043C\u043B\u0435\u043D\u0430 \u043D\u0430 \u0434\u0440\u0443\u0433\u043E\u0435 \u0438\u043C\u044F?",kk:"\u0421\u0456\u0437\u0434\u0456\u04A3 \u0430\u043B\u0434\u0430\u0493\u044B \u0436\u0430\u0437\u044B\u043B\u0443\u044B\u04A3\u044B\u0437 \u0442\u0430\u0431\u044B\u043B\u043C\u0430\u0434\u044B. \u0411\u0430\u0441\u049B\u0430 \u0430\u0442\u049B\u0430 \u0436\u0430\u0437\u044B\u043B\u0493\u0430\u043D \u0431\u043E\u043B\u0443\u044B \u043C\u04AF\u043C\u043A\u0456\u043D \u0431\u0435?",en:"I can't find an upcoming booking for you. Could it be under another name?"},price:(n,e,t)=>({ru:`${n} \u0441\u0442\u043E\u0438\u0442 ${e}, \u0434\u043B\u0438\u0442\u0441\u044F ${t} \u043C\u0438\u043D. \u0417\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0432\u0430\u0441?`,kk:`${n} \u0431\u0430\u0493\u0430\u0441\u044B ${e}, \u04B1\u0437\u0430\u049B\u0442\u044B\u0493\u044B ${t} \u043C\u0438\u043D\u0443\u0442. \u0416\u0430\u0437\u044B\u043F \u049B\u043E\u044F\u0439\u044B\u043D \u0431\u0430?`,en:`${n} costs ${e} and takes ${t} min. Shall I book you in?`}),priceList:n=>({ru:`\u041D\u0430\u0448\u0438 \u0446\u0435\u043D\u044B: ${n}.`,kk:`\u0411\u0456\u0437\u0434\u0456\u04A3 \u0431\u0430\u0493\u0430\u043B\u0430\u0440: ${n}.`,en:`Our prices: ${n}.`}),address:n=>({ru:`\u041C\u044B \u043D\u0430\u0445\u043E\u0434\u0438\u043C\u0441\u044F \u043F\u043E \u0430\u0434\u0440\u0435\u0441\u0443: ${n}.`,kk:`\u0411\u0456\u0437\u0434\u0456\u04A3 \u043C\u0435\u043A\u0435\u043D\u0436\u0430\u0439: ${n}.`,en:`We're at ${n}.`}),hours:(n,e)=>({ru:`\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u043C \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0441 ${n} \u0434\u043E ${e}.`,kk:`\u041A\u04AF\u043D \u0441\u0430\u0439\u044B\u043D ${n}-\u0434\u0435\u043D ${e}-\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u043C\u0456\u0437.`,en:`We're open every day from ${n} to ${e}.`}),thanks:{ru:"\u041F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430! \u0411\u0443\u0434\u0435\u043C \u0440\u0430\u0434\u044B \u0432\u0430\u0441 \u0432\u0438\u0434\u0435\u0442\u044C.",kk:"\u041E\u049B\u0430\u0441\u044B \u0436\u043E\u049B! \u0421\u0456\u0437\u0434\u0456 \u043A\u04AF\u0442\u0435\u043C\u0456\u0437.",en:"You're welcome! See you soon."},complaint:{ru:"\u041C\u043D\u0435 \u043E\u0447\u0435\u043D\u044C \u0436\u0430\u043B\u044C, \u0447\u0442\u043E \u0442\u0430\u043A \u0432\u044B\u0448\u043B\u043E. \u0412\u0430\u0448\u0435 \u0441\u043E\u043E\u0431\u0449\u0435\u043D\u0438\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0443, \u043E\u043D \u0441\u0432\u044F\u0436\u0435\u0442\u0441\u044F \u0441 \u0432\u0430\u043C\u0438 \u0432 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043C\u044F.",kk:"\u041E\u0441\u044B\u043D\u0434\u0430\u0439 \u0436\u0430\u0493\u0434\u0430\u0439 \u0431\u043E\u043B\u0493\u0430\u043D\u044B\u043D\u0430 \u04E9\u0442\u0435 \u04E9\u043A\u0456\u043D\u0435\u043C\u0456\u043D. \u0425\u0430\u0431\u0430\u0440\u044B\u04A3\u044B\u0437 \u043C\u0435\u043D\u0435\u0434\u0436\u0435\u0440\u0433\u0435 \u0436\u0456\u0431\u0435\u0440\u0456\u043B\u0434\u0456, \u043E\u043B \u0436\u0430\u049B\u044B\u043D \u0430\u0440\u0430\u0434\u0430 \u0445\u0430\u0431\u0430\u0440\u043B\u0430\u0441\u0430\u0434\u044B.",en:"I'm really sorry about this. Your message is with our manager, who will contact you shortly."},ok:{ru:"\u0425\u043E\u0440\u043E\u0448\u043E!",kk:"\u0416\u0430\u049B\u0441\u044B!",en:"Great!"},unknown:{ru:"\u0425\u043E\u0440\u043E\u0448\u0438\u0439 \u0432\u043E\u043F\u0440\u043E\u0441. \u0423\u0442\u043E\u0447\u043D\u044E \u0443 \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430 \u0438 \u0441\u0440\u0430\u0437\u0443 \u0432\u0430\u043C \u043D\u0430\u043F\u0438\u0448\u0443.",kk:"\u0416\u0430\u049B\u0441\u044B \u0441\u04B1\u0440\u0430\u049B. \u04D8\u043A\u0456\u043C\u0448\u0456\u0434\u0435\u043D \u043D\u0430\u049B\u0442\u044B\u043B\u0430\u043F, \u0441\u0456\u0437\u0433\u0435 \u0431\u0456\u0440\u0434\u0435\u043D \u0436\u0430\u0437\u0430\u043C\u044B\u043D.",en:"Good question. Let me check with the manager and get back to you."}},ne=n=>n.channel==="crm"?{}:{channel:n.channel},Je=n=>/[әғқңөұүһі]/i.test(n)?"kk":/[а-яё]/i.test(n)?"ru":"en";function Be(n,e){let t=n.split(/(?<=[.!?])\s+/).filter(s=>Je(s)===e);return t.length?t.join(" "):n}function Qe(n,e,t){return e.map(s=>`${I(s.start,t)} (${_(n,s.staff,t)})`).join("; ")}function Re(n,e,t,s){let{business:r,now:o}=n,i=n.model.predict(t),l=t.trim().length<=5?fe(t)==="kk"?"kk":e.lang:i.lang,d=i.intents[0],c=new Set(i.intents.map(b=>b.label));be(t)&&!c.has("complaint")&&c.add("complaint");let a={...e.dialog},u=we(t),h=a.stage==="offer"&&!c.has("cancel")&&(c.has("confirm")||ye(t)||u!==null);h&&c.add("confirm"),c.size>1&&c.delete("other");let f=ke(t,r.services)?.id,m=he(t,o),p=ge(t),k=pe(t),L={text:t,lang:l,labels:[...c]},g={prediction:i,lang:l,labels:[...c],unsure:!h&&d.score<Ge,reply:"",actions:[],learn:[],queue:[],client:e,entities:{service:f,day:m,time:p,name:k}},y={...e,name:k??e.name},C=[],$=b=>C.push(b[l]),q=Ee(y);if(c.has("greeting")&&$(M.hello(y.name.split(" ")[0])),h&&a.offers?.length){let b=a.offers[Math.min(u??0,a.offers.length-1)],w=r.services.find(D=>D.id===a.service),S={id:n.newId("bk"),client:y.id,clientName:y.name,service:w.id,staff:b.staff,start:b.start,minutes:w.minutes,price:w.price,status:"booked",source:y.channel,at:s};g.booking=S,y=te(y,S),$(M.booked(w.names[l],I(b.start,l),_(r,b.staff,l),N(r,w.price))),g.actions.push({type:"book",text:`Booked ${w.names.en}, ${I(b.start,"en")}, ${_(r,b.staff)}`}),a.started&&g.learn.push({...a.started,labels:a.started.labels.includes("booking")?a.started.labels:[...a.started.labels.filter(D=>D!=="other"),"booking"],why:"The client booked, so this message meant \xABbook\xBB"}),g.learn.push({...L,labels:L.labels.filter(D=>D!=="other"),why:"The client agreed to the offered time"}),Object.assign(a,{stage:"idle",offers:void 0,service:void 0,started:void 0})}else if(c.has("cancel")){let b=Se(n.bookings,y.id,o)[0];b?(g.cancelled={...b,status:"cancelled"},y=te(y,b,!0),$(M.cancelled(z(r,b.service,l),I(b.start,l))),g.actions.push({type:"cancel",text:`Cancelled ${z(r,b.service,"en")}, ${I(b.start,"en")}`}),d.score>=.5&&g.learn.push({...L,why:"The client had a booking and cancelled it"})):($(M.noBooking),g.actions.push({type:"answer",text:"No upcoming booking to cancel"})),a.stage="idle"}else if(c.has("complaint"))$(M.complaint),g.actions.push({type:"handoff",text:"Handed over to the manager"}),g.queue.push({kind:"complaint",text:t,lang:l,guess:[...c],score:d.score,client:y.id,clientName:y.name,...ne(y)}),a.stage="idle";else if(c.has("booking")||a.stage==="service"&&f){let b=f??a.service??q.service;if(a.started||(a.started=L),b){let w=Me(r,n.bookings,b,m,{now:o,pref:p,staff:q.staff}),S=r.services.find(D=>D.id===b);!f&&!a.service&&q.service&&q.staff&&c.has("booking")&&$(M.welcomeBack(S.names[l].toLowerCase(),_(r,q.staff,l))),w.length?($(M.offer(S.names[l],Qe(r,w,l))),g.actions.push({type:"offer",text:`Offered ${w.length} free time${w.length>1?"s":""} for ${S.names.en}`}),Object.assign(a,{stage:"offer",offers:w,service:b})):($(M.noSlots),g.actions.push({type:"handoff",text:"No free time, passed to the manager"}),a.stage="idle")}else{let w=r.services.slice(0,4).map(S=>S.names[l].toLowerCase()).join(", ");$(M.askService(w)),g.actions.push({type:"ask",text:"Asked which service"}),a.stage="service"}}else if(c.has("price")||c.has("address")||c.has("hours")){let b=n.knowledge.answer(t);if(b&&!b.entry.id.startsWith("biz-")&&b.score>=3&&!(c.has("price")&&f))C.push(Be(b.chunk,l)),g.hit=b,g.actions.push({type:"knowledge",text:`Answered from \xAB${b.entry.title}\xBB`});else{if(c.has("price")){let w=r.services.find(S=>S.id===f);$(w?M.price(w.names[l],N(r,w.price),w.minutes):M.priceList(r.services.slice(0,6).map(S=>`${S.names[l].toLowerCase()} ${N(r,S.price)}`).join(", "))),w&&Object.assign(a,{stage:"service",service:w.id})}c.has("address")&&$(M.address(r.address[l])),c.has("hours")&&$(M.hours(r.from,r.to)),g.actions.push({type:"answer",text:`Answered: ${[...c].filter(w=>["price","address","hours"].includes(w)).join(", ")}`})}a.answered=L,a.stage!=="service"&&(a.stage="idle")}else if(c.has("thanks"))$(M.thanks),a.answered&&g.learn.push({...a.answered,why:"The client thanked for the answer, so the AI had understood the question"}),g.actions.push({type:"answer",text:"Said you're welcome"}),a.answered=void 0;else if(c.has("confirm"))$(M.ok),g.actions.push({type:"answer",text:"Acknowledged"});else if(!c.has("greeting")||c.size>1||t.length>25){let b=n.knowledge.answer(t);g.hit=b;let w=r.services.find(S=>S.id===f);b?.entry.id.startsWith("biz-prices")&&w?($(M.price(w.names[l],N(r,w.price),w.minutes)),g.actions.push({type:"answer",text:`Answered the price of ${w.names.en} from the CRM data`})):b?(C.push(Be(b.chunk,l)),g.actions.push({type:"knowledge",text:`Answered from \xAB${b.entry.title}\xBB`})):($(M.unknown),g.actions.push({type:"unknown",text:"No answer in the knowledge yet, asked a person"}),g.queue.push({kind:"unanswered",text:t,lang:l,guess:[...c],score:d.score,client:y.id,clientName:y.name,...ne(y)}))}else $(M.help),g.actions.push({type:"answer",text:"Greeted the client"});return g.unsure&&!g.queue.length&&g.queue.push({kind:"unsure",text:t,lang:l,guess:[...c],score:d.score,client:y.id,clientName:y.name,...ne(y)}),g.reply=C.join(" ").replace(/\.\.(?!\.)/g,"."),y=ee(y,{at:s,from:"client",text:t,labels:[...c]},l),y=ee(y,{at:s+1,from:"ai",text:g.reply}),g.client={...y,dialog:JSON.parse(JSON.stringify(a))},g}var Xe=new Set(["\u0438 \u0432 \u0432\u043E \u043D\u0430 \u0441 \u0441\u043E \u043A \u043A\u043E \u0443 \u043E \u043E\u0431 \u043E\u0442 \u0434\u043E \u043F\u043E \u0437\u0430 \u0438\u0437 \u0434\u043B\u044F \u0447\u0435\u0440\u0435\u0437 \u043D\u0435 \u043D\u0438 \u0434\u0430 \u043D\u0435\u0442 \u0430 \u043D\u043E \u0438\u043B\u0438 \u043B\u0438 \u0436\u0435 \u0431\u044B \u0447\u0442\u043E \u044D\u0442\u043E \u043A\u0430\u043A \u0442\u0430\u043A \u0432\u044B \u043C\u044B \u044F \u0442\u044B \u043E\u043D \u043E\u043D\u0430 \u043E\u043D\u0438 \u0432\u0430\u0441 \u043D\u0430\u043C \u0432\u0430\u043C \u043C\u043D\u0435 \u043C\u0435\u043D\u044F \u0435\u0441\u0442\u044C \u043C\u043E\u0436\u043D\u043E \u0432\u0430\u0448 \u0432\u0430\u0448\u0430 \u0432\u0430\u0448\u0435 \u0432\u0430\u0448\u0438 \u043C\u043E\u0439 \u043C\u043E\u044F \u043D\u0430\u0448 \u0437\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435 \u043F\u0440\u0438\u0432\u0435\u0442 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430 \u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u0433\u0434\u0435 \u043A\u043E\u0433\u0434\u0430 \u043A\u0430\u043A\u043E\u0439 \u043A\u0430\u043A\u0430\u044F \u043A\u0430\u043A\u0438\u0435 \u043A\u0442\u043E","the a an to of in on at for is are be do does can could would i you we it my your our there this that and or not with please hi hello hey tell me what when where which who how","\u043C\u0435\u043D \u0441\u0435\u043D \u0441\u0438\u0437 \u0431\u0438\u0437 \u043E\u043B \u0431\u0430\u0440 \u0436\u043E\u043A \u043C\u0430 \u043C\u0435 \u0431\u0430 \u0431\u0435 \u043F\u0430 \u043F\u0435 \u0433\u043E\u0439 \u0436\u0430\u043D\u0435 \u0434\u0435 \u0442\u0430 \u0431\u043E\u043B\u0430"].join(" ").split(" ")),Ze=/^(пере|при|про|под|по|за|вы|от|до|на|раз|рас)(?=[а-я]{5})/;function se(n){let e=[];for(let t of O(n).split(/[^\p{L}\p{N}]+/u)){if(t.length<2||Xe.has(t))continue;e.push(t),t.length>5&&e.push(`~${t.slice(0,5)}`);let s=t.replace(Ze,"");s!==t&&s.length>5&&e.push(`~${s.slice(0,5)}`)}return e}function et(n,e=360){let t=n.split(/\n\s*\n|\n(?=[-•*\d])/).map(r=>r.replace(/\s+/g," ").trim()).filter(Boolean),s=[];for(let r of t){if(r.length<=e){s.push(r);continue}let o="";for(let i of r.split(/(?<=[.!?])\s+/))o&&(o+" "+i).length>e?(s.push(o),o=i):o=o?`${o} ${i}`:i;o&&s.push(o)}return s}var F=class{constructor(){x(this,"items",[]);x(this,"df",new Map);x(this,"avg",1);x(this,"entries",[])}set(e,t){this.entries=[...e].sort((s,r)=>r.at-s.at),this.items=[],this.df.clear();for(let s of[...this.entries,...tt(t)])for(let r of et(`${s.title}. ${s.text}`)){let o=se(r),i=new Map;for(let l of o)i.set(l,(i.get(l)??0)+1);this.items.push({entry:s,text:r.startsWith(`${s.title}. `)?r.slice(s.title.length+2):r,tf:i,len:o.length});for(let l of i.keys())this.df.set(l,(this.df.get(l)??0)+1)}this.avg=this.items.reduce((s,r)=>s+r.len,0)/Math.max(this.items.length,1)||1}get size(){return this.items.length}search(e,t=3){let s=[...new Set(se(e))],r=this.items.length,o=[];for(let i of this.items){let l=0,d=[];for(let c of s){let a=i.tf.get(c);if(!a)continue;let u=this.df.get(c)??0,h=Math.log(1+(r-u+.5)/(u+.5));l+=h*a*2.4/(a+1.4*(.25+.75*i.len/this.avg)),c.startsWith("~")?d.some(f=>f.startsWith(c.slice(1)))||d.push(c.slice(1)+"\u2026"):d.push(c)}l>0&&o.push({entry:i.entry,chunk:i.text,score:Math.round(l*100)/100,matched:d})}return o.sort((i,l)=>l.score-i.score).slice(0,t)}answer(e){let t=this.search(e,1)[0],s=new Set(se(e).filter(r=>!r.startsWith("~"))).size;return t&&t.score>=2.2&&t.matched.length>=(s>=3?2:1)?t:null}};function tt(n){let t={ru:"\u043C\u0438\u043D",kk:"\u043C\u0438\u043D",en:"min"},s=o=>n.services.map(i=>`${i.names[o]} ${N(n,i.price)} (${i.minutes} ${t[o]})`).join(", "),r=o=>n.staff.map(i=>`${i.name}: ${i.services.map(l=>z(n,l,o)).join(", ")}`).join("; ");return[{id:"biz-prices-ru",title:"\u0426\u0435\u043D\u044B \u0438 \u0443\u0441\u043B\u0443\u0433\u0438",text:`\u0426\u0435\u043D\u044B: ${s("ru")}.`,source:"business",at:0},{id:"biz-prices-kk",title:"\u0411\u0430\u0493\u0430\u043B\u0430\u0440 \u043C\u0435\u043D \u049B\u044B\u0437\u043C\u0435\u0442\u0442\u0435\u0440",text:`\u0411\u0430\u0493\u0430\u043B\u0430\u0440: ${s("kk")}.`,source:"business",at:0},{id:"biz-prices-en",title:"Prices and services",text:`Prices: ${s("en")}.`,source:"business",at:0},{id:"biz-address-ru",title:"\u0410\u0434\u0440\u0435\u0441",text:`\u041D\u0430\u0448 \u0430\u0434\u0440\u0435\u0441: ${n.address.ru}.`,source:"business",at:0},{id:"biz-address-kk",title:"\u041C\u0435\u043A\u0435\u043D\u0436\u0430\u0439",text:`\u0411\u0456\u0437\u0434\u0456\u04A3 \u043C\u0435\u043A\u0435\u043D\u0436\u0430\u0439: ${n.address.kk}.`,source:"business",at:0},{id:"biz-address-en",title:"Address",text:`Our address: ${n.address.en}.`,source:"business",at:0},{id:"biz-hours-ru",title:"\u0427\u0430\u0441\u044B \u0440\u0430\u0431\u043E\u0442\u044B",text:`\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u043C \u043A\u0430\u0436\u0434\u044B\u0439 \u0434\u0435\u043D\u044C \u0441 ${n.from} \u0434\u043E ${n.to}.`,source:"business",at:0},{id:"biz-hours-kk",title:"\u0416\u04B1\u043C\u044B\u0441 \u0443\u0430\u049B\u044B\u0442\u044B",text:`\u041A\u04AF\u043D \u0441\u0430\u0439\u044B\u043D ${n.from}-\u0434\u0435\u043D ${n.to}-\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u043C\u0456\u0437.`,source:"business",at:0},{id:"biz-hours-en",title:"Opening hours",text:`Open every day from ${n.from} to ${n.to}.`,source:"business",at:0},{id:"biz-staff-ru",title:"\u041C\u0430\u0441\u0442\u0435\u0440\u0430",text:`\u041C\u0430\u0441\u0442\u0435\u0440\u0430: ${r("ru")}.`,source:"business",at:0},{id:"biz-staff-en",title:"Barbers",text:`Barbers: ${r("en")}.`,source:"business",at:0}]}function nt(n){return n.toLowerCase().replace(/ё/g,"\u0435").replace(/\d{1,2}[:.]\d{2}/g," 00:00 ").replace(/\+?\d[\d\s()-]{8,}\d/g," phone ").replace(/[^\p{L}\p{N}: ]+/gu," ").replace(/\s+/g," ").trim()}function R(n){let e=nt(n).split(" ").filter(Boolean),t=new Set;return e.forEach((s,r)=>{t.add(`w:${s}`),r>0&&t.add(`b:${e[r-1]}_${s}`);let o=`<${s}>`;s.length>4&&t.add(`p:${s.slice(0,4)}`);for(let i=3;i<=5;i++)for(let l=0;l+i<=o.length;l++)t.add(`c:${o.slice(l,l+i)}`)}),e.length||t.add("empty"),e.length<=2&&t.add("short"),[...t]}var V=n=>1/(1+Math.exp(-n));function ie(n){let e=n>>>0;return()=>{e=e+1831565813>>>0;let t=e;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296}}function oe(n,e){let t=[...n],s=ie(e);for(let r=t.length-1;r>0;r--){let o=Math.floor(s()*(r+1));[t[r],t[o]]=[t[o],t[r]]}return t}var j=class n{constructor(e){x(this,"json",e);x(this,"index");this.index=new Map(e.vocab.map((t,s)=>[t,s]))}static train(e,t={}){let s=n.trainer(e,t);for(;;){let r=s.next();if(r.done)return r.value}}static async trainAsync(e,t={}){let s=n.trainer(e,t);for(;;){let r=s.next();if(r.done)return r.value;await new Promise(o=>setTimeout(o,0))}}static*trainer(e,t={}){let{epochs:s=60,learningRate:r=1,l2:o=1e-4,seed:i=7,positiveWeight:l=4,onEpoch:d}=t,c=[...new Set(e.flatMap(m=>R(m.text)))].sort(),a=new Map(c.map((m,p)=>[m,p])),u=e.map(m=>({x:R(m.text).map(p=>a.get(p)),e:m})),h={iw:Array.from({length:v.length},()=>new Array(c.length).fill(0)),ib:new Array(v.length).fill(0),lw:Array.from({length:E.length},()=>new Array(c.length).fill(0)),lb:new Array(E.length).fill(0)};for(let m=0;m<s;m++){let p=r/(1+m*.05),k=0;for(let{x:L,e:g}of oe(u,i+m))k+=je(h,L,g,p,o,l);k/=u.length*v.length,d?.(m+1,k,new n({version:"1",vocab:c,intent:{w:h.iw,b:h.ib},lang:{w:h.lw,b:h.lb}})),yield{epoch:m+1,loss:k}}let f=m=>m.map(p=>Math.round(p*1e5)/1e5);return new n({version:"1",vocab:c,intent:{w:h.iw.map(f),b:f(h.ib)},lang:{w:h.lw.map(f),b:f(h.lb)}})}learn(e,t={}){let{learningRate:s=.5,l2:r=1e-4,positiveWeight:o=4}=t,i=this.json,l=0;for(let c of e)for(let a of R(c.text))if(!this.index.has(a)){this.index.set(a,i.vocab.length),i.vocab.push(a);for(let u of i.intent.w)u.push(0);for(let u of i.lang.w)u.push(0);l++}let d={iw:i.intent.w,ib:i.intent.b,lw:i.lang.w,lb:i.lang.b};for(let c of e)je(d,R(c.text).map(a=>this.index.get(a)),c,s,r,o);return l}weight(e,t){let s=this.index.get(e);return s===void 0?0:this.json.intent.w[v.indexOf(t)][s]}forward(e){let t=R(e).map(d=>({f:d,index:this.index.get(d)??null})),s=t.flatMap(d=>d.index===null?[]:[d.index]),r=s.length?1/Math.sqrt(s.length):0,o=(d,c)=>{let a=d.map(u=>s.map(h=>u[h]*r));return{bias:[...c],contrib:a,z:c.map((u,h)=>a[h].reduce((f,m)=>f+m,u))}},i=o(this.json.intent.w,this.json.intent.b),l=o(this.json.lang.w,this.json.lang.b);return{features:t,scale:r,intent:{...i,score:i.z.map(V)},lang:{...l,p:re(l.z)}}}clone(){return new n(JSON.parse(JSON.stringify(this.json)))}toJSON(){return this.json}get vocabularySize(){return this.json.vocab.length}explain(e){let t=R(e),s=t.filter(c=>this.index.has(c)),r=s.length?1/Math.sqrt(s.length):0,o=c=>c.startsWith("w:")?"word":c.startsWith("b:")?"pair":c.startsWith("p:")?"start":"piece",i=s.map(c=>v.map((a,u)=>this.json.intent.w[u][this.index.get(c)]*r)),l=[...this.json.intent.b],d=v.map((c,a)=>V(l[a]+i.reduce((u,h)=>u+h[a],0)));return{features:s.map(c=>({feature:c.replace(/^[wbpc]:/,""),kind:o(c),known:!0})),contributions:i,bias:l,scores:d,unknown:t.length-s.length}}get weightCount(){return(this.json.intent.w.length+this.json.lang.w.length)*this.json.vocab.length+this.json.intent.b.length+this.json.lang.b.length}predict(e,t=.5){let s=R(e).map(a=>this.index.get(a)).filter(a=>a!==void 0),r=s.length?1/Math.sqrt(s.length):0,o={};v.forEach((a,u)=>{let h=this.json.intent.b[u];for(let f of s)h+=this.json.intent.w[u][f]*r;o[a]=V(h)});let i=v.filter(a=>o[a]>=t).map(a=>({label:a,score:o[a]}));if(i.length>1&&(i=i.filter(a=>a.label!=="other")),!i.length){let a=v.reduce((u,h)=>o[h]>o[u]?h:u);i=[{label:o[a]>=.3?a:"other",score:o[a]>=.3?o[a]:o.other}]}i.sort((a,u)=>u.score-a.score);let l=re(E.map((a,u)=>s.reduce((h,f)=>h+this.json.lang.w[u][f]*r,this.json.lang.b[u]))),d=Object.fromEntries(E.map((a,u)=>[a,l[u]])),c=E[l.indexOf(Math.max(...l))];return/[әғқңөұүһі]/i.test(e)&&(c="kk"),{intents:i,scores:o,lang:c,lang_scores:d}}};function je(n,e,t,s,r,o){let i=1/Math.sqrt(e.length),l=0;for(let a=0;a<v.length;a++){let u=n.ib[a];for(let p of e)u+=n.iw[a][p]*i;let h=t.labels.includes(v[a]),f=Math.min(Math.max(V(u),1e-9),1-1e-9);l-=Math.log(h?f:1-f);let m=(V(u)-(h?1:0))*(h?o:1);n.ib[a]-=s*m;for(let p of e)n.iw[a][p]-=s*(m*i+r*n.iw[a][p])}let d=E.map((a,u)=>e.reduce((h,f)=>h+n.lw[u][f]*i,n.lb[u])),c=re(d);for(let a=0;a<E.length;a++){let u=c[a]-(E[a]===t.lang?1:0);n.lb[a]-=s*u;for(let h of e)n.lw[a][h]-=s*(u*i+r*n.lw[a][h])}return l}function re(n){let e=Math.max(...n),t=n.map(r=>Math.exp(r-e)),s=t.reduce((r,o)=>r+o,0);return t.map(r=>r/s)}var T=n=>Math.round(n*1e3)/1e3,Pe=(n,e)=>n+e?2*n*e/(n+e):0;function ae(n,e){var f;let t={},s={},r={};for(let m of v)t[m]=s[m]=r[m]=0;let o=0,i=0,l={},d=[];for(let m of e){let p=n.predict(m.text),k=p.intents.map(g=>g.label);for(let g of v){let y=m.labels.includes(g),C=k.includes(g);y&&C?t[g]++:C?s[g]++:y&&r[g]++}let L=k.length===m.labels.length&&k.every(g=>m.labels.includes(g));l[f=m.lang]??(l[f]={n:0,ok:0}),l[m.lang].n++,L?(o++,l[m.lang].ok++):d.push({text:m.text,expected:m.labels,got:k}),p.lang===m.lang&&i++}let c=m=>Object.values(m).reduce((p,k)=>p+k,0),a=c(t)/(c(t)+c(s)||1),u=c(t)/(c(t)+c(r)||1),h=Object.fromEntries(v.map(m=>{let p=t[m]/(t[m]+s[m]||1),k=t[m]/(t[m]+r[m]||1);return[m,{precision:T(p),recall:T(k),f1:T(Pe(p,k)),support:t[m]+r[m]}]}));return{examples:e.length,exact_match:T(o/e.length),micro:{precision:T(a),recall:T(u),f1:T(Pe(a,u))},per_label:h,language_accuracy:T(i/e.length),exact_match_by_language:Object.fromEntries(E.filter(m=>l[m]).map(m=>[m,T(l[m].ok/l[m].n)])),mistakes:d}}function Te(n,e,t=42){let s=new Map;for(let i of n){let l=`${i.lang}:${i.labels[0]}`;s.set(l,[...s.get(l)??[],i])}let r=Array.from({length:e},()=>[]),o=0;for(let i of[...s.keys()].sort())for(let l of oe(s.get(i),t))r[o++%e].push(l);return r}var Y={epochs:60,learningRate:1,l2:1e-4,seed:7,positiveWeight:4},Oe=50,st=(n,e)=>n.length===e.length&&n.every(t=>e.includes(t)),Ae=n=>[...n].reduce((e,t)=>Math.imul(e,31)+t.charCodeAt(0)>>>0,7),De=n=>({exact:n.exact_match,f1:n.micro.f1,lang:n.language_accuracy}),Ne=(n,e)=>n.at-e.at||n.id.localeCompare(e.id),le=(n,e)=>st(n.intents.map(t=>t.label),e),U=class{constructor(e,t){x(this,"seed",e);x(this,"model");x(this,"frozen");x(this,"phrases",[]);x(this,"versions",[]);x(this,"known",new Set);this.frozen=t??j.train(P(e),Y),this.model=this.frozen.clone()}get live(){return[...this.versions].reverse().find(e=>e.status==="live")??null}get pending(){let e=this.versions.at(-1)?.upto??0;return this.phrases.filter(t=>t.at>e).length}has(e){return this.known.has(e)}async load(e,t){this.phrases=[...e].sort(Ne),this.known=new Set(this.phrases.map(r=>r.id)),this.versions=[...t].sort((r,o)=>r.n-o.n);let s=this.live;this.model=s?await j.trainAsync(P(this.dataset(s.upto)),Y):this.frozen.clone();for(let r of this.phrases)r.at>(s?.upto??0)&&this.step(r)}dataset(e=1/0){return[...this.seed,...this.phrases.filter(t=>t.at<=e).map(({text:t,lang:s,labels:r})=>({text:t,lang:s,labels:r}))]}learn(e){let t=this.model.predict(e.text),s=le(t,e.labels),r=le(this.frozen.predict(e.text),e.labels),i=R(e.text).flatMap(a=>v.map(u=>({f:a,l:u,w:this.model.weight(a,u)})));this.phrases.push(e),this.phrases.sort(Ne),this.known.add(e.id);let{steps:l,added:d}=this.step(e),c=i.map(({f:a,l:u,w:h})=>({feature:a.replace(/^[wbpc]:/,""),label:u,from:h,to:this.model.weight(a,u)})).filter(a=>Math.abs(a.to-a.from)>1e-6).sort((a,u)=>Math.abs(u.to-u.from)-Math.abs(a.to-a.from)).slice(0,8);return{phrase:e,before:t,after:this.model.predict(e.text).scores,correct:s,frozenCorrect:r,steps:l,newFeatures:d,changes:c}}step(e){let t=P([{text:e.text,lang:e.lang,labels:e.labels}]),s=this.phrases.slice(0,this.phrases.indexOf(e)+1),r=[...this.seed,...s.map(({text:d,lang:c,labels:a})=>({text:d,lang:c,labels:a}))],o=ie(Ae(e.id)),i=0,l=0;for(;l<8;){let d=Array.from({length:4},()=>r[Math.floor(o()*r.length)]);if(i+=this.model.learn([...t,...d],{learningRate:.5}),l++,l>=2&&le(this.model.predict(e.text),e.labels))break}return this.known.add(e.id),{steps:l,added:i}}async retrain(e,t){let s=Date.now(),r=this.phrases.at(-1)?.at??0,o=new Set(Te(this.seed,5)[0]),i=y=>Ae(y.id)%5===0,l=[...o,...this.phrases.filter(i)],d=y=>[...this.seed.filter(C=>!o.has(C)),...this.phrases.filter(C=>C.at<=y&&!i(C))],c=y=>({...Y,onEpoch:(C,$)=>t?.(y,C,$)}),a=this.live,u=await j.trainAsync(P(d(a?.upto??0)),c("old")),h=await j.trainAsync(P(d(r)),c("new")),f=De(ae(u,l)),m=De(ae(h,l)),p=m.exact>=f.exact-Math.max(.005,1/l.length)-1e-9,k=(this.versions.at(-1)?.n??0)+1,L=null;return p&&(L=await j.trainAsync(P(this.dataset(r)),c("final"))),{version:{id:`v${String(k).padStart(4,"0")}`,n:k,at:Date.now(),upto:r,phrases:this.phrases.filter(y=>y.at<=r).length,metrics:m,prev:f,status:p?"live":"rejected",trigger:e,ms:Date.now()-s,holdout:l.length},accepted:p,model:L}}async apply(e,t){if(!this.versions.some(s=>s.id===e.id)){if(e.status==="live")for(let s of this.versions)s.status==="live"&&(s.status="old");if(this.versions.push(e),this.versions.sort((s,r)=>s.n-r.n),e.status==="live"){this.model=t??await j.trainAsync(P(this.dataset(e.upto)),Y);for(let s of this.phrases)s.at>e.upto&&this.step(s)}}}};var ce=n=>`${n}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`,rt=n=>{let e=(n??"").toLowerCase();return e==="instagram"||e==="telegram"||e==="whatsapp"?e:"crm"},it=n=>n.replace(" ","T").slice(0,16);function G(n){let e=new Map($e.services.map(t=>[t.id,t]));return{name:n.name,city:n.city??"",address:{ru:n.address,kk:n.address,en:n.address},from:n.from,to:n.to,phone:n.phone??"",currency:n.currency??"\u20B8",services:n.services.filter(t=>t.active!==!1).map(t=>{let s=e.get(t.id);return{...s??{...Le(t.name,t.price,t.minutes,"en"),id:t.id},id:t.id,minutes:t.minutes,price:t.price,names:s?s.names:{ru:t.name,kk:t.name,en:t.name}}}),staff:n.staff.filter(t=>t.active!==!1).map(t=>({id:t.id,name:t.name,role:t.role??"",days:t.days,from:t.from,to:t.to,services:t.services}))}}var J=class n{constructor(e,t){x(this,"learner");x(this,"knowledge",new F);x(this,"clients",{});x(this,"questions",[]);x(this,"retrainEvery",Oe);x(this,"retraining",!1);x(this,"job");x(this,"onChange",()=>{});this.learner=new U(e,t)}static fromPhrases(e,t){return new n(me(e),t)}get model(){return this.learner.model}async load(e){e&&(await this.learner.load(e.phrases??[],e.versions??[]),this.clients={...e.clients??{}},this.questions=[...e.questions??[]])}state(){return{v:1,phrases:this.learner.phrases,versions:this.learner.versions,clients:this.clients,questions:this.questions}}stats(){let e=this.learner.live;return{phrases:this.learner.phrases.length,pending:this.learner.pending,retrainEvery:this.retrainEvery,version:e?.id??"v0000",versions:this.learner.versions.length,metrics:e?.metrics??null,clients:Object.keys(this.clients).length,questions:this.questions.length,retraining:this.retraining}}read(e){return this.model.predict(e)}setKnowledge(e,t){this.knowledge.set(e.map((s,r)=>({id:s.id,title:s.title,text:s.text,source:"operator",at:e.length-r})),t)}reply(e){let t=e.now??new Date,s=t.getTime(),r=G(e.business);this.setKnowledge(e.knowledge,r);let o=e.bookings.map(u=>({id:u.id,client:u.client,clientName:u.clientName??"",service:u.service,staff:u.staff,start:it(u.start),minutes:u.minutes??r.services.find(h=>h.id===u.service)?.minutes??60,price:u.price??0,status:u.cancelled?"cancelled":"booked",source:"crm",at:0})),i=this.clients[e.client.id],l=i?{...i,name:e.client.name||i.name}:Ce(e.client.id,e.client.name,rt(e.client.channel),e.client.handle??"","ru",s),d=Re({model:this.model,knowledge:this.knowledge,business:r,bookings:o,now:t,newId:ce},l,e.text,s);this.clients[e.client.id]=d.client;let c={outcome:d,lessons:[]};d.booking&&(c.book={service:d.booking.service,staff:d.booking.staff,start:d.booking.start.replace("T"," "),name:d.client.name}),d.cancelled&&(c.cancel={id:d.cancelled.id});let a=d.actions.find(u=>u.type==="handoff");a&&(c.handoff=a.text);for(let u of d.queue){let h={id:ce("q"),at:s,...u,kind:u.kind};u.kind!=="complaint"&&!this.questions.some(f=>f.text===u.text)&&(this.questions.unshift(h),this.questions=this.questions.slice(0,200)),u.kind==="unanswered"&&(c.question=h)}for(let u of d.learn)c.lessons.push(this.lesson({text:u.text,lang:u.lang,labels:u.labels,why:u.why,source:"client",client:e.client.id},s));return c.retrain=this.maybeRetrain(),this.onChange(this.state()),c}teach(e,t,s="Taught by a person",r="operator"){let o=this.model.predict(e).lang,i=this.lesson({text:e,lang:o,labels:t,why:s,source:r},Date.now());return this.maybeRetrain(),this.onChange(this.state()),i}answer(e,t){let s=this.questions.find(o=>o.id===e);if(!s||!t.trim())return null;this.questions=this.questions.filter(o=>o.id!==e);let r=s.guess.filter(o=>o!=="other");return s.kind==="unsure"&&r.length&&this.lesson({text:s.text,lang:s.lang,labels:r,why:"A person confirmed the reading",source:"operator"},Date.now()),this.onChange(this.state()),{title:s.text.slice(0,80),text:t.trim()}}dismiss(e){this.questions=this.questions.filter(t=>t.id!==e),this.onChange(this.state())}ask(e,t,s){let r=G(t);return this.setKnowledge(s,r),this.knowledge.answer(e)??this.knowledge.search(e,1)[0]??null}lesson(e,t){return this.learner.learn({...e,id:ce("ph"),at:t+this.learner.phrases.length/1e3})}maybeRetrain(e=!1){if(this.retraining)return this.job;if(!(!e&&this.learner.pending<this.retrainEvery))return this.retraining=!0,this.job=(async()=>{try{let t=await this.learner.retrain(e?"by hand":`auto: ${this.learner.pending} new phrases`);return await this.learner.apply(t.version,t.model),this.onChange(this.state()),t.version}finally{this.retraining=!1}})()}};var ot={version:"5aebaad",labels:v,toBusiness:G,async create(n){await new Promise(t=>setTimeout(t,0));let e=J.fromPhrases(`# VoroniX AI training data: what clients of a barbershop or beauty salon write in chats.
# Columns: language (ru, kk, en) <TAB> labels separated by commas <TAB> message.
# Labels: greeting, price, booking, cancel, complaint, address, hours, confirm, thanks, other.
# A message can have several labels, for example "Hello! How much is a haircut?" is greeting,price.
lang	labels	text
ru	greeting	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435
ru	greeting	\u041F\u0440\u0438\u0432\u0435\u0442
ru	greeting	\u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C!
ru	greeting	\u0434\u043E\u0431\u0440\u044B\u0439 \u0432\u0435\u0447\u0435\u0440
ru	greeting,hours	\u0414\u043E\u0431\u0440\u043E\u0435 \u0443\u0442\u0440\u043E, \u0432\u044B \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435?
ru	greeting	\u0437\u0434\u0440\u0430\u0441\u044C\u0442\u0435
ru	greeting	\u041F\u0440\u0438\u0432\u0435\u0442\u0441\u0442\u0432\u0443\u044E
ru	greeting	\u0441\u0430\u043B\u0430\u043C
ru	price	\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u0441\u0442\u0440\u0438\u0436\u043A\u0430?
ru	price	\u041A\u0430\u043A\u0430\u044F \u0446\u0435\u043D\u0430 \u043D\u0430 \u043C\u0443\u0436\u0441\u043A\u0443\u044E \u0441\u0442\u0440\u0438\u0436\u043A\u0443
ru	price	\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u043F\u043E\u043A\u0440\u0430\u0441\u043A\u0430 \u0432\u043E\u043B\u043E\u0441
ru	price	\u041F\u0440\u0430\u0439\u0441 \u043C\u043E\u0436\u043D\u043E?
ru	price	\u0421\u043A\u0438\u043D\u044C\u0442\u0435 \u043F\u0440\u0430\u0439\u0441 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430
ru	price	\u041A\u0430\u043A\u0438\u0435 \u0443 \u0432\u0430\u0441 \u0446\u0435\u043D\u044B?
ru	price	\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0431\u0443\u0434\u0435\u0442 \u0441\u0442\u043E\u0438\u0442\u044C \u0431\u043E\u0440\u043E\u0434\u0430 \u0438 \u0441\u0442\u0440\u0438\u0436\u043A\u0430 \u0432\u043C\u0435\u0441\u0442\u0435
ru	price	\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u043C\u0430\u043D\u0438\u043A\u044E\u0440\u0430?
ru	price	\u0410 \u043F\u043E \u0434\u0435\u043D\u044C\u0433\u0430\u043C \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0432\u044B\u0439\u0434\u0435\u0442
ru	price	\u043F\u043E\u0447\u0435\u043C \u0434\u0435\u0442\u0441\u043A\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430
ru	price	\u0426\u0435\u043D\u0430 \u043D\u0430 \u043E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u043D\u0438\u0435 \u0441\u0435\u0434\u0438\u043D\u044B
ru	price	\u0432\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u043E\u0439\u0434\u0435\u0442\u0441\u044F VIP \u0440\u0438\u0442\u0443\u0430\u043B
ru	price	\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442?
ru	price	\u0430 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u044D\u0442\u043E \u0441\u0442\u043E\u0438\u0442
ru	booking	\u0425\u043E\u0447\u0443 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0441\u0442\u0440\u0438\u0436\u043A\u0443
ru	booking	\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430?
ru	booking	\u0417\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043C\u0435\u043D\u044F \u043D\u0430 \u043F\u044F\u0442\u043D\u0438\u0446\u0443 \u0432 18:00
ru	booking	\u0415\u0441\u0442\u044C \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0432 \u0441\u0443\u0431\u0431\u043E\u0442\u0443?
ru	booking	\u0445\u043E\u0447\u0443 \u043A \u0422\u0438\u043C\u0443\u0440\u0443 \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430
ru	booking	\u041C\u043E\u0436\u043D\u043E \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0432\u0435\u0447\u0435\u0440\u043E\u043C?
ru	booking	\u0415\u0441\u0442\u044C \u043E\u043A\u043E\u0448\u043A\u043E \u043F\u043E\u0441\u043B\u0435 19?
ru	booking	\u0445\u043E\u0447\u0443 \u043F\u043E\u0434\u0441\u0442\u0440\u0438\u0447\u044C\u0441\u044F \u0432 \u0441\u0440\u0435\u0434\u0443 \u043F\u043E\u0441\u043B\u0435 \u0440\u0430\u0431\u043E\u0442\u044B
ru	booking	\u0417\u0430\u043F\u0438\u0441\u044C \u043D\u0430 \u043C\u0430\u043D\u0438\u043A\u044E\u0440 \u0435\u0441\u0442\u044C \u043D\u0430 \u044D\u0442\u043E\u0439 \u043D\u0435\u0434\u0435\u043B\u0435?
ru	booking	\u043A\u043E\u0433\u0434\u0430 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u0438\u0439\u0442\u0438 \u043D\u0430 \u0431\u043E\u0440\u043E\u0434\u0443
ru	booking	\u041C\u043D\u0435 \u043D\u0443\u0436\u043D\u0430 \u0441\u0442\u0440\u0438\u0436\u043A\u0430 \u043C\u0430\u0448\u0438\u043D\u043A\u043E\u0439, \u043A\u043E\u0433\u0434\u0430 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0435\u0435 \u0432\u0440\u0435\u043C\u044F?
ru	booking	\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u043D\u0430 17:30
ru	booking	\u041C\u043E\u0436\u043D\u043E \u0432 \u0447\u0435\u0442\u0432\u0435\u0440\u0433 \u0443\u0442\u0440\u043E\u043C?
ru	booking	\u0445\u043E\u0447\u0443 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C \u0441\u044B\u043D\u0430 \u043D\u0430 \u0434\u0435\u0442\u0441\u043A\u0443\u044E \u0441\u0442\u0440\u0438\u0436\u043A\u0443
ru	booking	\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u043E \u043B\u0438 \u0437\u0430\u0432\u0442\u0440\u0430 \u0432 12?
ru	booking	\u0437\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043D\u0430 \u0431\u0440\u0438\u0442\u044C\u0435
ru	booking	\u0415\u0441\u0442\u044C \u043C\u0435\u0441\u0442\u0430 \u043D\u0430 \u0432\u044B\u0445\u043E\u0434\u043D\u044B\u0445?
ru	booking	\u041C\u043D\u0435 \u0431\u044B \u043F\u043E\u0441\u0442\u0440\u0438\u0447\u044C\u0441\u044F
ru	greeting,price	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u0441\u0442\u0440\u0438\u0436\u043A\u0430?
ru	greeting,booking	\u041F\u0440\u0438\u0432\u0435\u0442, \u0445\u043E\u0447\u0443 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430
ru	greeting,price,booking	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435! \u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 VIP-\u0440\u0438\u0442\u0443\u0430\u043B? \u041C\u043E\u0436\u043D\u043E \u0432 \u0441\u0440\u0435\u0434\u0443 \u0432\u0435\u0447\u0435\u0440\u043E\u043C?
ru	price,booking	\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u043C\u0430\u043D\u0438\u043A\u044E\u0440 \u0438 \u0435\u0441\u0442\u044C \u043B\u0438 \u0432\u0440\u0435\u043C\u044F \u0432 \u043F\u044F\u0442\u043D\u0438\u0446\u0443?
ru	greeting,booking	\u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C, \u043C\u043E\u0436\u043D\u043E \u043A \u043C\u0430\u0441\u0442\u0435\u0440\u0443 \u043D\u0430 \u0441\u0443\u0431\u0431\u043E\u0442\u0443?
ru	cancel	\u0425\u043E\u0447\u0443 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C
ru	cancel	\u041E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430 \u043C\u043E\u044E \u0437\u0430\u043F\u0438\u0441\u044C
ru	cancel	\u044F \u043D\u0435 \u0441\u043C\u043E\u0433\u0443 \u043F\u0440\u0438\u0439\u0442\u0438 \u0437\u0430\u0432\u0442\u0440\u0430
ru	cancel	\u041D\u0435 \u043F\u0440\u0438\u0434\u0443, \u043E\u0442\u043C\u0435\u043D\u044F\u0439\u0442\u0435
ru	cancel	\u043C\u043E\u0436\u043D\u043E \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0432\u0438\u0437\u0438\u0442
ru	cancel	\u041A \u0441\u043E\u0436\u0430\u043B\u0435\u043D\u0438\u044E \u043F\u043B\u0430\u043D\u044B \u043F\u043E\u043C\u0435\u043D\u044F\u043B\u0438\u0441\u044C, \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435
ru	cancel	\u0443\u0431\u0435\u0440\u0438\u0442\u0435 \u043C\u043E\u044E \u0437\u0430\u043F\u0438\u0441\u044C \u043D\u0430 \u043F\u044F\u0442\u043D\u0438\u0446\u0443
ru	cancel	\u041E\u0442\u043C\u0435\u043D\u0430 \u0437\u0430\u043F\u0438\u0441\u0438
ru	complaint	\u041C\u043D\u0435 \u0438\u0441\u043F\u043E\u0440\u0442\u0438\u043B\u0438 \u0441\u0442\u0440\u0438\u0436\u043A\u0443, \u044F \u043E\u0447\u0435\u043D\u044C \u043D\u0435\u0434\u043E\u0432\u043E\u043B\u0435\u043D
ru	complaint	\u042D\u0442\u043E \u0443\u0436\u0430\u0441, \u0432\u0435\u0440\u043D\u0438\u0442\u0435 \u0434\u0435\u043D\u044C\u0433\u0438
ru	complaint	\u0425\u043E\u0447\u0443 \u043E\u0441\u0442\u0430\u0432\u0438\u0442\u044C \u0436\u0430\u043B\u043E\u0431\u0443 \u043D\u0430 \u043C\u0430\u0441\u0442\u0435\u0440\u0430
ru	complaint	\u043F\u043E\u0441\u043B\u0435 \u043F\u043E\u043A\u0440\u0430\u0441\u043A\u0438 \u043E\u0436\u043E\u0433 \u043D\u0430 \u043A\u043E\u0436\u0435
ru	complaint	\u0443 \u043C\u0435\u043D\u044F \u0430\u043B\u043B\u0435\u0440\u0433\u0438\u044F \u043F\u043E\u0441\u043B\u0435 \u043F\u0440\u043E\u0446\u0435\u0434\u0443\u0440\u044B
ru	complaint	\u041E\u0442\u0432\u0440\u0430\u0442\u0438\u0442\u0435\u043B\u044C\u043D\u043E\u0435 \u043E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435
ru	complaint	\u043C\u0430\u0441\u0442\u0435\u0440 \u043E\u043F\u043E\u0437\u0434\u0430\u043B \u043D\u0430 \u0447\u0430\u0441, \u044F \u043D\u0435\u0434\u043E\u0432\u043E\u043B\u0435\u043D
ru	complaint	\u0445\u043E\u0447\u0443 \u0432\u043E\u0437\u0432\u0440\u0430\u0442 \u0434\u0435\u043D\u0435\u0433
ru	complaint	\u043D\u043E\u0433\u043E\u0442\u044C \u0441\u043B\u043E\u043C\u0430\u043B\u0438 \u043D\u0430 \u043C\u0430\u043D\u0438\u043A\u044E\u0440\u0435, \u043A\u0442\u043E \u043E\u0442\u0432\u0435\u0442\u0438\u0442?
ru	complaint	\u041F\u043E\u0447\u0435\u043C\u0443 \u043C\u043D\u0435 \u043D\u0430\u0445\u0430\u043C\u0438\u043B\u0438 \u043D\u0430 \u0440\u0435\u0441\u0435\u043F\u0448\u0435\u043D\u0435?
ru	address	\u0413\u0434\u0435 \u0432\u044B \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0435\u0441\u044C?
ru	address	\u041A\u0430\u043A\u043E\u0439 \u0443 \u0432\u0430\u0441 \u0430\u0434\u0440\u0435\u0441
ru	address	\u043A\u0430\u043A \u0434\u043E \u0432\u0430\u0441 \u0434\u043E\u0431\u0440\u0430\u0442\u044C\u0441\u044F
ru	address	\u0415\u0441\u0442\u044C \u043F\u0430\u0440\u043A\u043E\u0432\u043A\u0430 \u0440\u044F\u0434\u043E\u043C?
ru	address	\u0441\u043A\u0438\u043D\u044C\u0442\u0435 \u043B\u043E\u043A\u0430\u0446\u0438\u044E
ru	address	\u0412\u044B \u0432 \u043A\u0430\u043A\u043E\u043C \u0440\u0430\u0439\u043E\u043D\u0435?
ru	address	\u0430\u0434\u0440\u0435\u0441 \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0438\u0442\u0435
ru	hours	\u0414\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u0438 \u0432\u044B \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435?
ru	hours	\u041A\u0430\u043A\u043E\u0439 \u0443 \u0432\u0430\u0441 \u0433\u0440\u0430\u0444\u0438\u043A \u0440\u0430\u0431\u043E\u0442\u044B
ru	hours	\u0412\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043E\u0442\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0435\u0441\u044C?
ru	hours	\u0432\u044B \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435 \u0432 \u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435?
ru	hours	\u0447\u0430\u0441\u044B \u0440\u0430\u0431\u043E\u0442\u044B \u043A\u0430\u043A\u0438\u0435
ru	hours	\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435 \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u0434\u043E 21?
ru	hours,address	\u0413\u0434\u0435 \u0432\u044B \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0435\u0441\u044C \u0438 \u0434\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u0438 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435?
ru	confirm	\u0414\u0430
ru	confirm	\u0434\u0430, \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442
ru	confirm	\u0414\u0430\u0432\u0430\u0439\u0442\u0435
ru	confirm	\u043E\u043A
ru	confirm	\u0425\u043E\u0440\u043E\u0448\u043E, \u043F\u0435\u0440\u0432\u044B\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442
ru	confirm	\u041E\u0442\u043B\u0438\u0447\u043D\u043E, \u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0442\u0430\u043A
ru	confirm	\u0410\u0433\u0430
ru	confirm	\u0434\u0430 \u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0432\u0442\u043E\u0440\u043E\u0439
ru	confirm	\u041F\u043E\u0434\u0445\u043E\u0434\u0438\u0442, \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0439\u0442\u0435
ru	thanks	\u0421\u043F\u0430\u0441\u0438\u0431\u043E
ru	thanks	\u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0431\u043E\u043B\u044C\u0448\u043E\u0435!
ru	thanks	\u0431\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u044E
ru	thanks	\u0441\u043F\u0441
ru	thanks	\u0421\u043F\u0430\u0441\u0438\u0431\u043E, \u0434\u043E \u0432\u0441\u0442\u0440\u0435\u0447\u0438
ru	confirm,thanks	\u0434\u0430, \u0441\u043F\u0430\u0441\u0438\u0431\u043E
ru	other	\u0410 \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u0432\u0430\u0439\u0444\u0430\u0439?
ru	other	\u0412\u044B \u043F\u0440\u043E\u0434\u0430\u0435\u0442\u0435 \u0448\u0430\u043C\u043F\u0443\u043D\u0438?
ru	other	\u043C\u043E\u0436\u043D\u043E \u0441 \u0441\u043E\u0431\u0430\u043A\u043E\u0439?
ru	other	\u041C\u0435\u043D\u044F \u0437\u043E\u0432\u0443\u0442 \u0410\u043B\u0438\u044F
ru	other	+7 701 555 11 22
ru	other	\u0410\u0440\u043C\u0430\u043D
ru	other	\u041C\u043E\u0436\u043D\u043E \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u043A\u0430\u0440\u0442\u043E\u0439?
ru	other	\u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u043F\u043E\u0434\u0430\u0440\u043E\u0447\u043D\u044B\u0435 \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u044B?
ru	other	\u041A\u0430\u043A\u043E\u0439 \u043C\u0430\u0441\u0442\u0435\u0440 \u043B\u0443\u0447\u0448\u0435?
ru	other	\u0438\u0449\u0443 \u0440\u0430\u0431\u043E\u0442\u0443 \u0431\u0430\u0440\u0431\u0435\u0440\u043E\u043C
kk	greeting	\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437 \u0431\u0435
kk	greeting	\u0421\u04D9\u043B\u0435\u043C
kk	greeting	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u043A\u04AF\u043D!
kk	greeting	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u043A\u0435\u0448
kk	greeting,hours	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u0442\u0430\u04A3, \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u043F \u0442\u04B1\u0440\u0441\u044B\u0437\u0434\u0430\u0440 \u043C\u0430?
kk	greeting	\u0410\u0441\u0441\u0430\u043B\u0430\u0443\u043C\u0430\u0493\u0430\u043B\u0435\u0439\u043A\u0443\u043C
kk	greeting	\u0441\u0430\u043B\u0435\u043C\u0435\u0442\u0441\u0438\u0437 \u0431\u0435
kk	greeting	\u0441\u0430\u043B\u0435\u043C
kk	price	\u0428\u0430\u0448 \u049B\u0438\u044E \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B?
kk	price	\u0415\u0440 \u0430\u0434\u0430\u043C\u043D\u044B\u04A3 \u0448\u0430\u0448 \u049B\u0438\u044E\u044B \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B
kk	price	\u0411\u0430\u0493\u0430\u0441\u044B \u049B\u0430\u043D\u0448\u0430?
kk	price	\u0428\u0430\u0448\u0442\u044B \u0431\u043E\u044F\u0443 \u049B\u0430\u043D\u0448\u0430 \u0431\u043E\u043B\u0430\u0434\u044B
kk	price	\u041F\u0440\u0430\u0439\u0441 \u0436\u0456\u0431\u0435\u0440\u0456\u04A3\u0456\u0437\u0448\u0456
kk	price	\u0411\u0430\u0493\u0430\u043B\u0430\u0440\u044B\u04A3\u044B\u0437 \u049B\u0430\u043D\u0434\u0430\u0439?
kk	price	\u041C\u0430\u043D\u0438\u043A\u044E\u0440\u0434\u0456\u04A3 \u0431\u0430\u0493\u0430\u0441\u044B \u049B\u0430\u043D\u0434\u0430\u0439?
kk	price	\u0421\u0430\u049B\u0430\u043B \u0442\u04AF\u0437\u0435\u0442\u0443 \u043D\u0435\u0448\u0435 \u0442\u0435\u04A3\u0433\u0435?
kk	price	\u043A\u0430\u043D\u0448\u0430 \u0442\u0443\u0440\u0430\u0434\u044B
kk	price	\u0411\u0430\u043B\u0430\u043B\u0430\u0440 \u0448\u0430\u0448 \u049B\u0438\u044E\u044B \u049B\u0430\u043D\u0448\u0430?
kk	price	VIP \u0440\u0438\u0442\u0443\u0430\u043B \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B?
kk	price	\u0428\u0430\u0448 \u049B\u0438\u044E \u043C\u0435\u043D \u0441\u0430\u049B\u0430\u043B \u0431\u0456\u0440\u0433\u0435 \u049B\u0430\u043D\u0448\u0430 \u0431\u043E\u043B\u0430\u0434\u044B
kk	booking	\u0428\u0430\u0448 \u049B\u0438\u044E\u0493\u0430 \u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0415\u0440\u0442\u0435\u04A3\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0443\u0493\u0430 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	booking	\u0416\u04B1\u043C\u0430 \u043A\u04AF\u043D\u0456 \u0441\u0430\u0493\u0430\u0442 18:00-\u0433\u0435 \u0436\u0430\u0437\u044B\u04A3\u044B\u0437\u0448\u044B
kk	booking	\u0421\u0435\u043D\u0431\u0456\u0434\u0435 \u0431\u043E\u0441 \u0443\u0430\u049B\u044B\u0442 \u0431\u0430\u0440 \u043C\u0430?
kk	booking	\u0411\u04AF\u0433\u0456\u043D \u043A\u0435\u0448\u043A\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	booking	\u0422\u0438\u043C\u0443\u0440\u0493\u0430 \u0435\u0440\u0442\u0435\u04A3\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0430\u0439\u044B\u043D
kk	booking	\u0421\u04D9\u0440\u0441\u0435\u043D\u0431\u0456 \u043A\u04AF\u043D\u0456 \u0436\u04B1\u043C\u044B\u0441\u0442\u0430\u043D \u043A\u0435\u0439\u0456\u043D \u043A\u0435\u043B\u0441\u0435\u043C \u0431\u043E\u043B\u0430 \u043C\u0430
kk	booking	\u041E\u0441\u044B \u0430\u043F\u0442\u0430\u0434\u0430 \u043C\u0430\u043D\u0438\u043A\u044E\u0440\u0433\u0435 \u043E\u0440\u044B\u043D \u0431\u0430\u0440 \u043C\u0430?
kk	booking	\u0421\u0430\u049B\u0430\u043B\u0493\u0430 \u049B\u0430\u0448\u0430\u043D \u043A\u0435\u043B\u0443\u0433\u0435 \u0431\u043E\u043B\u0430\u0434\u044B?
kk	booking	\u0415\u04A3 \u0436\u0430\u049B\u044B\u043D \u0431\u043E\u0441 \u0443\u0430\u049B\u044B\u0442 \u049B\u0430\u0448\u0430\u043D?
kk	booking	\u0411\u0435\u0439\u0441\u0435\u043D\u0431\u0456 \u0442\u0430\u04A3\u0435\u0440\u0442\u0435\u04A3 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	booking	\u04B0\u043B\u044B\u043C\u0434\u044B \u0431\u0430\u043B\u0430\u043B\u0430\u0440 \u0448\u0430\u0448 \u049B\u0438\u044E\u044B\u043D\u0430 \u0436\u0430\u0437\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0415\u0440\u0442\u0435\u04A3 \u0441\u0430\u0493\u0430\u0442 12-\u0434\u0435 \u0431\u043E\u0441 \u043F\u0430?
kk	booking	\u0414\u0435\u043C\u0430\u043B\u044B\u0441 \u043A\u04AF\u043D\u0434\u0435\u0440\u0456 \u043E\u0440\u044B\u043D \u0431\u0430\u0440 \u043C\u0430?
kk	booking	\u0428\u0430\u0448 \u0430\u043B\u0434\u044B\u0440\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0436\u0430\u0437\u044B\u043B\u0433\u044B\u043C \u043A\u0435\u043B\u0435\u0434
kk	booking	17:30-\u0493\u0430 \u0436\u0430\u0437\u044B\u04A3\u044B\u0437
kk	booking	\u0421\u0430\u0493\u0430\u0442 19-\u0434\u0430\u043D \u043A\u0435\u0439\u0456\u043D \u0431\u043E\u0441 \u043E\u0440\u044B\u043D \u0431\u0430\u0440 \u043C\u0430?
kk	greeting,price	\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437 \u0431\u0435! \u0428\u0430\u0448 \u049B\u0438\u044E \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B?
kk	greeting,booking	\u0421\u04D9\u043B\u0435\u043C, \u0435\u0440\u0442\u0435\u04A3\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	greeting,price,booking	\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437 \u0431\u0435! VIP \u0440\u0438\u0442\u0443\u0430\u043B \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B? \u0421\u04D9\u0440\u0441\u0435\u043D\u0431\u0456 \u043A\u0435\u0448\u043A\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	price,booking	\u041C\u0430\u043D\u0438\u043A\u044E\u0440 \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B \u0436\u04D9\u043D\u0435 \u0436\u04B1\u043C\u0430\u0434\u0430 \u0443\u0430\u049B\u044B\u0442 \u0431\u0430\u0440 \u043C\u0430?
kk	greeting,booking	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u043A\u04AF\u043D, \u0441\u0435\u043D\u0431\u0456\u0433\u0435 \u0448\u0435\u0431\u0435\u0440\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0443\u0493\u0430 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	cancel	\u0416\u0430\u0437\u044B\u043B\u0443\u044B\u043C\u0434\u044B \u0431\u043E\u043B\u0434\u044B\u0440\u043C\u0430\u0443\u044B\u04A3\u044B\u0437\u0434\u044B \u0441\u04B1\u0440\u0430\u0439\u043C\u044B\u043D
kk	cancel	\u0416\u0430\u0437\u0431\u0430\u043C\u0434\u044B \u0430\u043B\u044B\u043F \u0442\u0430\u0441\u0442\u0430\u04A3\u044B\u0437\u0448\u044B
kk	cancel	\u0415\u0440\u0442\u0435\u04A3 \u043A\u0435\u043B\u0435 \u0430\u043B\u043C\u0430\u0439\u043C\u044B\u043D
kk	cancel	\u041A\u0435\u043B\u043C\u0435\u0439\u043C\u0456\u043D, \u0436\u0430\u0437\u044B\u043B\u0443\u0434\u044B \u04E9\u0448\u0456\u0440\u0456\u04A3\u0456\u0437
kk	cancel	\u0416\u0430\u0437\u044B\u043B\u0443\u0434\u0430\u043D \u0431\u0430\u0441 \u0442\u0430\u0440\u0442\u0430\u043C\u044B\u043D
kk	cancel	\u0416\u043E\u0441\u043F\u0430\u0440\u044B\u043C \u04E9\u0437\u0433\u0435\u0440\u0434\u0456, \u0436\u0430\u0437\u0431\u0430\u043C\u0434\u044B \u04E9\u0448\u0456\u0440\u0456\u04A3\u0456\u0437\u0448\u0456
kk	cancel	\u0416\u04B1\u043C\u0430\u0434\u0430\u0493\u044B \u0436\u0430\u0437\u0431\u0430\u043C\u0434\u044B \u0430\u043B\u044B\u043F \u0442\u0430\u0441\u0442\u0430\u04A3\u044B\u0437
kk	cancel	\u043E\u0442\u043C\u0435\u043D\u0430 \u0436\u0430\u0441\u0430\u04A3\u044B\u0437\u0448\u044B
kk	complaint	\u0428\u0430\u0448\u044B\u043C\u0434\u044B \u0431\u04AF\u043B\u0434\u0456\u0440\u0456\u043F \u0442\u0430\u0441\u0442\u0430\u0434\u044B, \u043C\u0435\u043D \u04E9\u0442\u0435 \u043D\u0430\u0440\u0430\u0437\u044B\u043C\u044B\u043D
kk	complaint	\u0411\u04B1\u043B \u0441\u04B1\u043C\u0434\u044B\u049B, \u0430\u049B\u0448\u0430\u043C\u0434\u044B \u049B\u0430\u0439\u0442\u0430\u0440\u044B\u04A3\u044B\u0437
kk	complaint	\u0428\u0435\u0431\u0435\u0440 \u0442\u0443\u0440\u0430\u043B\u044B \u0448\u0430\u0493\u044B\u043C \u049B\u0430\u043B\u0434\u044B\u0440\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	complaint	\u0411\u043E\u044F\u0443\u0434\u0430\u043D \u043A\u0435\u0439\u0456\u043D \u0442\u0435\u0440\u0456\u043C \u043A\u04AF\u0439\u0456\u043F \u049B\u0430\u043B\u0434\u044B
kk	complaint	\u041F\u0440\u043E\u0446\u0435\u0434\u0443\u0440\u0430\u0434\u0430\u043D \u043A\u0435\u0439\u0456\u043D \u0430\u043B\u043B\u0435\u0440\u0433\u0438\u044F \u0448\u044B\u049B\u0442\u044B
kk	complaint	\u049A\u044B\u0437\u043C\u0435\u0442 \u043A\u04E9\u0440\u0441\u0435\u0442\u0443 \u04E9\u0442\u0435 \u043D\u0430\u0448\u0430\u0440
kk	complaint	\u0428\u0435\u0431\u0435\u0440 \u0431\u0456\u0440 \u0441\u0430\u0493\u0430\u0442 \u043A\u0435\u0448\u0456\u043A\u0442\u0456, \u043C\u0435\u043D \u043D\u0430\u0440\u0430\u0437\u044B\u043C\u044B\u043D
kk	complaint	\u0410\u049B\u0448\u0430\u043C\u0434\u044B \u049B\u0430\u0439\u0442\u0430\u0440\u0443\u0434\u044B \u0441\u04B1\u0440\u0430\u0439\u043C\u044B\u043D
kk	complaint	\u041C\u0430\u043D\u0438\u043A\u044E\u0440\u0434\u0435 \u0442\u044B\u0440\u043D\u0430\u0493\u044B\u043C\u0434\u044B \u0441\u044B\u043D\u0434\u044B\u0440\u044B\u043F \u0430\u043B\u0434\u044B
kk	complaint	\u041D\u0435\u0433\u0435 \u043C\u0430\u0493\u0430\u043D \u0434\u04E9\u0440\u0435\u043A\u0456 \u0441\u04E9\u0439\u043B\u0435\u0434\u0456\u04A3\u0456\u0437\u0434\u0435\u0440?
kk	address	\u0421\u0456\u0437\u0434\u0435\u0440 \u049B\u0430\u0439\u0434\u0430\u0441\u044B\u0437\u0434\u0430\u0440?
kk	address	\u041C\u0435\u043A\u0435\u043D\u0436\u0430\u0439\u044B\u04A3\u044B\u0437 \u049B\u0430\u043D\u0434\u0430\u0439?
kk	address	\u0421\u0456\u0437\u0434\u0435\u0440\u0433\u0435 \u049B\u0430\u043B\u0430\u0439 \u0436\u0435\u0442\u0443\u0433\u0435 \u0431\u043E\u043B\u0430\u0434\u044B?
kk	address	\u0416\u0430\u043D\u044B\u04A3\u044B\u0437\u0434\u0430 \u043A\u04E9\u043B\u0456\u043A \u0442\u04B1\u0440\u0430\u0493\u044B \u0431\u0430\u0440 \u043C\u0430?
kk	address	\u041B\u043E\u043A\u0430\u0446\u0438\u044F \u0436\u0456\u0431\u0435\u0440\u0456\u04A3\u0456\u0437\u0448\u0456
kk	address	\u049A\u0430\u0439 \u0430\u0443\u0434\u0430\u043D\u0434\u0430 \u043E\u0440\u043D\u0430\u043B\u0430\u0441\u049B\u0430\u043D\u0441\u044B\u0437\u0434\u0430\u0440?
kk	address	\u043C\u0435\u043A\u0435\u043D\u0436\u0430\u0439 \u049B\u0430\u043D\u0434\u0430\u0439
kk	hours	\u0421\u0430\u0493\u0430\u0442 \u043D\u0435\u0448\u0435\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440?
kk	hours	\u0416\u04B1\u043C\u044B\u0441 \u043A\u0435\u0441\u0442\u0435\u04A3\u0456\u0437 \u049B\u0430\u043D\u0434\u0430\u0439?
kk	hours	\u0421\u0430\u0493\u0430\u0442 \u043D\u0435\u0448\u0435\u0434\u0435 \u0430\u0448\u044B\u043B\u0430\u0441\u044B\u0437\u0434\u0430\u0440?
kk	hours	\u0416\u0435\u043A\u0441\u0435\u043D\u0431\u0456 \u043A\u04AF\u043D\u0456 \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440 \u043C\u0435?
kk	hours	\u0411\u04AF\u0433\u0456\u043D 21-\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u0430\u0448\u044B\u049B\u0441\u044B\u0437\u0434\u0430\u0440 \u043C\u0430?
kk	hours	\u0416\u04B1\u043C\u044B\u0441 \u0443\u0430\u049B\u044B\u0442\u044B \u049B\u0430\u043D\u0434\u0430\u0439
kk	hours,address	\u049A\u0430\u0439\u0434\u0430\u0441\u044B\u0437\u0434\u0430\u0440 \u0436\u04D9\u043D\u0435 \u043D\u0435\u0448\u0435\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440?
kk	confirm	\u0418\u04D9
kk	confirm	\u0418\u04D9, \u0441\u04D9\u0439\u043A\u0435\u0441 \u043A\u0435\u043B\u0435\u0434\u0456
kk	confirm	\u0416\u0430\u0440\u0430\u0439\u0434\u044B
kk	confirm	\u0411\u043E\u043B\u0430\u0434\u044B
kk	confirm	\u0416\u0430\u049B\u0441\u044B, \u0431\u0456\u0440\u0456\u043D\u0448\u0456 \u043D\u04B1\u0441\u049B\u0430
kk	confirm	\u041A\u0435\u043B\u0456\u0441\u0442\u0456\u043A
kk	confirm	\u0418\u04D9, \u0435\u043A\u0456\u043D\u0448\u0456\u0441\u0456
kk	confirm	\u0418\u044F, \u0436\u0430\u0437\u0430 \u0431\u0435\u0440\u0456\u04A3\u0456\u0437
kk	confirm	\u041C\u0430\u049B\u04B1\u043B
kk	thanks	\u0420\u0430\u0445\u043C\u0435\u0442
kk	thanks	\u041A\u04E9\u043F \u0440\u0430\u0445\u043C\u0435\u0442!
kk	thanks	\u0420\u0430\u049B\u043C\u0435\u0442
kk	thanks	\u0420\u0430\u0445\u043C\u0435\u0442, \u043A\u0435\u0437\u0434\u0435\u0441\u043A\u0435\u043D\u0448\u0435
kk	thanks	\u0421\u0456\u0437\u0433\u0435 \u0440\u0430\u0445\u043C\u0435\u0442
kk	thanks	\u0410\u043B\u0493\u044B\u0441 \u0430\u0439\u0442\u0430\u043C\u044B\u043D
kk	confirm,thanks	\u0418\u04D9, \u0440\u0430\u0445\u043C\u0435\u0442
kk	other	\u0421\u0456\u0437\u0434\u0435\u0440\u0434\u0435 wifi \u0431\u0430\u0440 \u043C\u0430?
kk	other	\u0428\u0430\u043C\u043F\u0443\u043D\u044C \u0441\u0430\u0442\u0430\u0441\u044B\u0437\u0434\u0430\u0440 \u043C\u0430?
kk	other	\u041C\u0435\u043D\u0456\u04A3 \u0430\u0442\u044B\u043C \u04D8\u043B\u0438\u044F
kk	other	\u0410\u0439\u0433\u0435\u0440\u0456\u043C
kk	other	\u041A\u0430\u0440\u0442\u0430\u043C\u0435\u043D \u0442\u04E9\u043B\u0435\u0443\u0433\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	other	\u0421\u044B\u0439\u043B\u044B\u049B \u0441\u0435\u0440\u0442\u0438\u0444\u0438\u043A\u0430\u0442\u044B \u0431\u0430\u0440 \u043C\u0430?
kk	other	\u049A\u0430\u0439 \u0448\u0435\u0431\u0435\u0440 \u0436\u0430\u049B\u0441\u044B\u0440\u0430\u049B?
kk	other	\u0411\u0430\u0440\u0431\u0435\u0440 \u0431\u043E\u043B\u044B\u043F \u0436\u04B1\u043C\u044B\u0441 \u0456\u0437\u0434\u0435\u043F \u0436\u04AF\u0440\u043C\u0456\u043D
kk	other	\u0418\u0442\u043F\u0435\u043D \u043A\u0435\u043B\u0443\u0433\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
en	greeting	Hello
en	greeting	Hi
en	greeting	Good afternoon!
en	greeting	good evening
en	greeting,hours	Good morning, are you open?
en	greeting	hey there
en	greeting	Hi guys
en	price	How much is a haircut?
en	price	What is the price for a men's haircut
en	price	how much does hair colouring cost
en	price	Can I see the price list?
en	price	Send me your prices please
en	price	What are your rates?
en	price	how much for a beard trim and haircut together
en	price	Manicure price?
en	price	how much will it be
en	price	kids haircut cost?
en	price	How much is the VIP ritual
en	price	what does it cost
en	booking	I want to book a haircut
en	booking	Can I book for tomorrow?
en	booking	Book me in on Friday at 6 pm
en	booking	Do you have any free time on Saturday?
en	booking	I'd like to see Timur tomorrow
en	booking	Can I come today in the evening?
en	booking	Any slot after 7?
en	booking	I want a haircut on Wednesday after work
en	booking	Do you have a manicure slot this week?
en	booking	when can I come for a beard trim
en	booking	I need a clipper cut, what is the earliest time?
en	booking	let's do 5:30
en	booking	Can I come Thursday morning?
en	booking	I want to book my son for a kids haircut
en	booking	Is tomorrow at 12 free?
en	booking	book me for a shave
en	booking	Any openings at the weekend?
en	greeting,price	Hi! How much is a haircut?
en	greeting,booking	Hello, I'd like to book for tomorrow
en	greeting,price,booking	Hello! How much is the VIP ritual? Can I come Wednesday evening?
en	price,booking	How much is a manicure and do you have time on Friday?
en	cancel	I want to cancel my booking
en	cancel	Please cancel my appointment
en	cancel	I can't make it tomorrow
en	cancel	I won't come, please cancel
en	cancel	can I cancel my visit
en	cancel	Plans changed, cancel it please
en	cancel	remove my Friday appointment
en	complaint	You ruined my haircut, I am very unhappy
en	complaint	This is terrible, I want my money back
en	complaint	I want to complain about the barber
en	complaint	I got a burn on my skin after colouring
en	complaint	I have an allergic reaction after the treatment
en	complaint	Awful service
en	complaint	The barber was an hour late, not happy
en	complaint	I want a refund
en	complaint	my nail was broken during the manicure
en	complaint	Why was the receptionist so rude to me?
en	address	Where are you located?
en	address	What is your address
en	address	how do I get to you
en	address	Is there parking nearby?
en	address	send me the location
en	address	Which part of town are you in?
en	hours	What time do you close?
en	hours	What are your opening hours
en	hours	When do you open?
en	hours	are you open on Sunday?
en	hours	Are you open until 9 today?
en	hours,address	Where are you and how late are you open?
en	confirm	Yes
en	confirm	yes, that works
en	confirm	Sure
en	confirm	ok
en	confirm	Great, the first one
en	confirm	Perfect, let's do it
en	confirm	yep
en	confirm	yes the second one please
en	confirm	Sounds good, book it
en	thanks	Thanks
en	thanks	Thank you so much!
en	thanks	thx
en	thanks	Thanks, see you
en	thanks	much appreciated
en	confirm,thanks	yes, thank you
en	other	Do you have wifi?
en	other	Do you sell shampoo?
en	other	Can I bring my dog?
en	other	My name is Aliya
en	other	Daniel
en	other	Can I pay by card?
en	other	Do you have gift cards?
en	other	Which barber is the best?
en	other	I am looking for a job as a barber
ru	greeting	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, \u044D\u0442\u043E \u0431\u0430\u0440\u0431\u0435\u0440\u0448\u043E\u043F?
ru	greeting	\u0445\u0430\u0439
ru	greeting	\u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C, \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430
ru	greeting	\u041F\u0440\u0438\u0432\u0435\u0442, \u043D\u0430 \u0441\u0432\u044F\u0437\u0438?
ru	price	\u0410 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u0443 \u0432\u0430\u0441 \u0431\u0440\u0438\u0442\u044C\u0435 \u043E\u043F\u0430\u0441\u043D\u043E\u0439 \u0431\u0440\u0438\u0442\u0432\u043E\u0439
ru	price	\u0446\u0435\u043D\u044B \u043D\u0430 \u043F\u0435\u0434\u0438\u043A\u044E\u0440 \u043A\u0430\u043A\u0438\u0435
ru	price	\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u043F\u043E\u043A\u0440\u0430\u0441\u0438\u0442\u044C \u0431\u0440\u043E\u0432\u0438
ru	price	\u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0441\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u0443\u0441\u043B\u0443\u0433
ru	price	\u0432\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043E\u0431\u043E\u0439\u0434\u0435\u0442\u0441\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430 \u0441 \u0443\u043A\u043B\u0430\u0434\u043A\u043E\u0439
ru	price	\u044D\u0442\u043E \u0434\u043E\u0440\u043E\u0433\u043E? \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0442\u043E\u0447\u043D\u043E
ru	price	\u041F\u043E\u0434\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u0446\u0435\u043D\u0443 \u043D\u0430 \u043A\u0430\u043C\u0443\u0444\u043B\u044F\u0436 \u0441\u0435\u0434\u0438\u043D\u044B
ru	price	\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0437\u0430 \u0434\u0435\u0442\u0441\u043A\u0443\u044E
ru	price	\u0415\u0441\u0442\u044C \u043B\u0438 \u0441\u043A\u0438\u0434\u043A\u0438 \u0438 \u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u0441\u0442\u0440\u0438\u0436\u043A\u0430
ru	booking	\u041C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043A \u0410\u0440\u043C\u0430\u043D\u0443?
ru	booking	\u0425\u043E\u0447\u0443 \u043F\u0440\u0438\u0439\u0442\u0438 \u0432 \u043F\u043E\u043D\u0435\u0434\u0435\u043B\u044C\u043D\u0438\u043A
ru	booking	\u0415\u0441\u0442\u044C \u0432\u0440\u0435\u043C\u044F \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430 \u043F\u043E\u0441\u043B\u0435 \u043E\u0431\u0435\u0434\u0430?
ru	booking	\u0417\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u043D\u0430 15:00 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430
ru	booking	\u0410 \u043D\u0430 \u043F\u043E\u0441\u043B\u0435\u0437\u0430\u0432\u0442\u0440\u0430 \u0435\u0441\u0442\u044C?
ru	booking	\u0445\u043E\u0447\u0443 \u043D\u0430 \u043C\u0430\u043D\u0438\u043A\u044E\u0440 \u0432 \u0441\u0443\u0431\u0431\u043E\u0442\u0443 \u0443\u0442\u0440\u043E\u043C
ru	booking	\u041A\u043E\u0433\u0434\u0430 \u0431\u043B\u0438\u0436\u0430\u0439\u0448\u0430\u044F \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u0430\u044F \u0437\u0430\u043F\u0438\u0441\u044C?
ru	booking	\u043C\u043E\u0436\u043D\u043E \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u043F\u043E\u0434\u043E\u0439\u0442\u0438?
ru	booking	\u043C\u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u043F\u043E\u0434\u0440\u043E\u0432\u043D\u044F\u0442\u044C \u0431\u043E\u0440\u043E\u0434\u0443 \u0432 \u043F\u044F\u0442\u043D\u0438\u0446\u0443
ru	booking	\u0412 10 \u0443\u0442\u0440\u0430 \u0441\u0432\u043E\u0431\u043E\u0434\u043D\u043E?
ru	booking	\u0425\u043E\u0447\u0443 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u043E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u043D\u0438\u0435 \u043D\u0430 \u0441\u043B\u0435\u0434\u0443\u044E\u0449\u0435\u0439 \u043D\u0435\u0434\u0435\u043B\u0435
ru	booking	\u043C\u043E\u0436\u043D\u043E \u043D\u0430 12.11 \u0432 16:00
ru	booking	\u0414\u0430\u0432\u0430\u0439\u0442\u0435 \u043B\u0443\u0447\u0448\u0435 \u0432 19:00
ru	booking	\u0410 \u0434\u0440\u0443\u0433\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0435\u0441\u0442\u044C?
ru	booking	\u0445\u043E\u0447\u0443 \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F
ru	cancel	\u041E\u0442\u043C\u0435\u043D\u044F\u044E \u0437\u0430\u043F\u0438\u0441\u044C
ru	cancel	\u041C\u043D\u0435 \u043D\u0443\u0436\u043D\u043E \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430
ru	cancel	\u043D\u0435 \u043F\u043E\u043B\u0443\u0447\u0438\u0442\u0441\u044F \u043F\u0440\u0438\u0439\u0442\u0438, \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430
ru	cancel	\u0417\u0430\u0431\u043E\u043B\u0435\u043B, \u043D\u0435 \u043F\u0440\u0438\u0434\u0443
ru	cancel	\u0441\u043D\u0438\u043C\u0438\u0442\u0435 \u0431\u0440\u043E\u043D\u044C
ru	complaint	\u043C\u043D\u0435 \u043D\u0435 \u043F\u043E\u043D\u0440\u0430\u0432\u0438\u043B\u043E\u0441\u044C \u043A\u0430\u043A \u043F\u043E\u0441\u0442\u0440\u0438\u0433\u043B\u0438, \u0445\u043E\u0447\u0443 \u043F\u043E\u0436\u0430\u043B\u043E\u0432\u0430\u0442\u044C\u0441\u044F
ru	complaint	\u0412\u044B \u0441\u043F\u0438\u0441\u0430\u043B\u0438 \u0434\u0435\u043D\u044C\u0433\u0438 \u0434\u0432\u0430\u0436\u0434\u044B, \u0432\u0435\u0440\u043D\u0438\u0442\u0435
ru	complaint	\u0423\u0436\u0430\u0441\u043D\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430, \u043D\u0435\u0440\u043E\u0432\u043D\u043E
ru	complaint	\u041F\u043E\u0441\u043B\u0435 \u043C\u0430\u043D\u0438\u043A\u044E\u0440\u0430 \u043F\u0430\u043B\u0435\u0446 \u043E\u043F\u0443\u0445
ru	complaint	\u041E\u0447\u0435\u043D\u044C \u043D\u0435\u0434\u043E\u0432\u043E\u043B\u0435\u043D \u043C\u0430\u0441\u0442\u0435\u0440\u043E\u043C
ru	complaint	\u043C\u0435\u043D\u044F \u043D\u0435 \u043F\u0440\u0438\u043D\u044F\u043B\u0438 \u0445\u043E\u0442\u044F \u044F \u0431\u044B\u043B \u0437\u0430\u043F\u0438\u0441\u0430\u043D, \u0431\u0435\u0437\u043E\u0431\u0440\u0430\u0437\u0438\u0435
ru	address	\u0413\u0434\u0435 \u0432\u0430\u0441 \u043D\u0430\u0439\u0442\u0438?
ru	address	\u041D\u0430 \u043A\u0430\u043A\u043E\u0439 \u0443\u043B\u0438\u0446\u0435 \u0432\u044B?
ru	address	\u0412\u044B \u0433\u0434\u0435? \u041E\u0442\u043F\u0440\u0430\u0432\u044C\u0442\u0435 \u0430\u0434\u0440\u0435\u0441
ru	address	\u041A\u0430\u043A \u0432\u0430\u0441 \u043D\u0430\u0439\u0442\u0438 \u0432 2\u0413\u0418\u0421
ru	address	\u041A\u0430\u043A\u043E\u0439 \u043E\u0440\u0438\u0435\u043D\u0442\u0438\u0440 \u0440\u044F\u0434\u043E\u043C \u0441 \u0432\u0430\u043C\u0438
ru	hours	\u0412\u044B \u0437\u0430\u0432\u0442\u0440\u0430 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435?
ru	hours	\u0420\u0435\u0436\u0438\u043C \u0440\u0430\u0431\u043E\u0442\u044B \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0438\u0442\u0435
ru	hours	\u0432 \u043A\u0430\u043A\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u0432\u044B \u043E\u0442\u043A\u0440\u044B\u0442\u044B
ru	hours	\u0414\u043E \u043A\u0430\u043A\u043E\u0433\u043E \u0447\u0430\u0441\u0430 \u043C\u043E\u0436\u043D\u043E \u043F\u0440\u0438\u0439\u0442\u0438
ru	hours	\u0412\u044B\u0445\u043E\u0434\u043D\u044B\u0435 \u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C?
ru	confirm	\u0414\u0430, \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0439\u0442\u0435
ru	confirm	\u041E\u043A\u0435\u0439
ru	confirm	\u0433\u043E\u0434\u0438\u0442\u0441\u044F
ru	confirm	\u0421\u0443\u043F\u0435\u0440, \u0434\u0430\u0432\u0430\u0439\u0442\u0435
ru	confirm,booking	\u0434\u0430 18:30 \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442
ru	confirm	\u041F\u043E\u0434\u0442\u0432\u0435\u0440\u0436\u0434\u0430\u044E
ru	thanks	\u0441\u043F\u0430\u0441\u0438\u0431\u043E, \u0432\u0441\u0435 \u043F\u043E\u043D\u044F\u0442\u043D\u043E
ru	thanks	\u0411\u043B\u0430\u0433\u043E\u0434\u0430\u0440\u044E \u0437\u0430 \u043F\u043E\u043C\u043E\u0449\u044C
ru	thanks	\u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0432\u0430\u043C \u043E\u0433\u0440\u043E\u043C\u043D\u043E\u0435
ru	thanks	\u041F\u0430\u0441\u0438\u0431
ru	other	\u041C\u043E\u0436\u043D\u043E \u043F\u0440\u0438\u0439\u0442\u0438 \u0441 \u0440\u0435\u0431\u0435\u043D\u043A\u043E\u043C?
ru	other	\u0443 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u043A\u043E\u0444\u0435
ru	other	\u042F \u0414\u0430\u043D\u0438\u044F\u0440
ru	other	\u041C\u043E\u0439 \u043D\u043E\u043C\u0435\u0440 87015551122
ru	other	\u041A\u0442\u043E \u0443 \u0432\u0430\u0441 \u043B\u0443\u0447\u0448\u0438\u0439 \u043C\u0430\u0441\u0442\u0435\u0440 \u043F\u043E \u0431\u043E\u0440\u043E\u0434\u0435?
ru	other	\u043C\u043E\u0436\u043D\u043E \u043E\u043F\u043B\u0430\u0442\u0438\u0442\u044C \u0447\u0435\u0440\u0435\u0437 Kaspi?
ru	other	\u0423 \u0432\u0430\u0441 \u0435\u0441\u0442\u044C \u043A\u043E\u043D\u0434\u0438\u0446\u0438\u043E\u043D\u0435\u0440?
ru	other	\u0421\u043A\u043E\u043B\u044C\u043A\u043E \u0443 \u0432\u0430\u0441 \u043C\u0430\u0441\u0442\u0435\u0440\u043E\u0432?
kk	greeting	\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437\u0434\u0435\u0440 \u043C\u0435
kk	greeting	\u0421\u04D9\u043B\u0435\u043C, \u0431\u0430\u0440\u0431\u0435\u0440\u0448\u043E\u043F \u043F\u0430?
kk	greeting	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u043A\u04AF\u043D, \u043A\u04E9\u043C\u0435\u043A\u0442\u0435\u0441\u0456\u04A3\u0456\u0437\u0448\u0456
kk	greeting	\u0421\u04D9\u043B\u0435\u043C! \u0411\u0430\u0439\u043B\u0430\u043D\u044B\u0441\u0442\u0430\u0441\u044B\u0437 \u0431\u0430?
kk	greeting	\u0410\u0440\u043C\u044B\u0441\u044B\u0437\u0434\u0430\u0440
kk	price	\u04B0\u0441\u0442\u0430\u0440\u0430\u043C\u0435\u043D \u049B\u044B\u0440\u0443 \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B?
kk	price	\u041F\u0435\u0434\u0438\u043A\u044E\u0440 \u0431\u0430\u0493\u0430\u0441\u044B \u049B\u0430\u043D\u0434\u0430\u0439?
kk	price	\u049A\u0430\u0441\u0442\u044B \u0431\u043E\u044F\u0443 \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B?
kk	price	\u049A\u044B\u0437\u043C\u0435\u0442\u0442\u0435\u0440\u0434\u0456\u04A3 \u0431\u0430\u0493\u0430\u0441\u044B\u043D \u0436\u0430\u0437\u044B\u04A3\u044B\u0437\u0448\u044B
kk	price	\u0428\u0430\u0448 \u049B\u0438\u044E \u043C\u0435\u043D \u0441\u04D9\u043D\u0434\u0435\u0443 \u049B\u0430\u043D\u0448\u0430 \u0431\u043E\u043B\u0430\u0434\u044B?
kk	price	\u049A\u044B\u043C\u0431\u0430\u0442 \u043F\u0430? \u041D\u0430\u049B\u0442\u044B \u049B\u0430\u043D\u0448\u0430?
kk	price	\u0410\u049B \u0448\u0430\u0448\u0442\u044B \u0431\u043E\u044F\u0443\u0434\u044B\u04A3 \u0431\u0430\u0493\u0430\u0441\u044B \u049B\u0430\u043D\u0448\u0430?
kk	price	\u0411\u0430\u043B\u0430\u0493\u0430 \u049B\u0430\u043D\u0448\u0430 \u0442\u04E9\u043B\u0435\u0443 \u043A\u0435\u0440\u0435\u043A?
kk	price	\u0416\u0435\u04A3\u0456\u043B\u0434\u0456\u043A \u0431\u0430\u0440 \u043C\u0430, \u0448\u0430\u0448 \u049B\u0438\u044E \u049B\u0430\u043D\u0448\u0430?
kk	booking	\u0410\u0440\u043C\u0430\u043D\u0493\u0430 \u0436\u0430\u0437\u044B\u043B\u0443\u0493\u0430 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	booking	\u0414\u04AF\u0439\u0441\u0435\u043D\u0431\u0456\u0434\u0435 \u043A\u0435\u043B\u0433\u0456\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0415\u0440\u0442\u0435\u04A3 \u0442\u04AF\u0441\u0442\u0435\u043D \u043A\u0435\u0439\u0456\u043D \u0443\u0430\u049B\u044B\u0442 \u0431\u0430\u0440 \u043C\u0430?
kk	booking	15:00-\u0433\u0435 \u0436\u0430\u0437\u044B\u04A3\u044B\u0437\u0448\u044B
kk	booking	\u0411\u04AF\u0440\u0441\u0456\u0433\u04AF\u043D\u0433\u0435 \u043E\u0440\u044B\u043D \u0431\u0430\u0440 \u043C\u0430?
kk	booking	\u0421\u0435\u043D\u0431\u0456 \u0442\u0430\u04A3\u0435\u0440\u0442\u0435\u04A3 \u043C\u0430\u043D\u0438\u043A\u044E\u0440\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0415\u04A3 \u0436\u0430\u049B\u044B\u043D \u0431\u043E\u0441 \u0436\u0430\u0437\u044B\u043B\u0443 \u049B\u0430\u0448\u0430\u043D?
kk	booking	\u0411\u04AF\u0433\u0456\u043D \u043A\u0435\u043B\u0443\u0433\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	booking	\u0416\u04B1\u043C\u0430 \u043A\u04AF\u043D\u0456 \u0441\u0430\u049B\u0430\u043B\u044B\u043C\u0434\u044B \u0442\u04AF\u0437\u0435\u0442\u043A\u0456\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0422\u0430\u04A3\u0493\u044B 10-\u0434\u0430 \u0431\u043E\u0441 \u043F\u0430?
kk	booking	\u041A\u0435\u043B\u0435\u0441\u0456 \u0430\u043F\u0442\u0430\u0434\u0430 \u0448\u0430\u0448 \u0431\u043E\u044F\u0443\u0493\u0430 \u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	12.11 \u0441\u0430\u0493\u0430\u0442 16:00-\u0433\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430
kk	booking	19:00 \u0436\u0430\u049B\u0441\u044B\u0440\u0430\u049B
kk	booking	\u0411\u0430\u0441\u049B\u0430 \u0443\u0430\u049B\u044B\u0442 \u0431\u0430\u0440 \u043C\u0430?
kk	booking	\u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	cancel	\u0416\u0430\u0437\u044B\u043B\u0443\u044B\u043C\u0434\u044B \u04E9\u0448\u0456\u0440\u0456\u04A3\u0456\u0437\u0448\u0456
kk	cancel	\u0415\u0440\u0442\u0435\u04A3\u0433\u0456 \u0436\u0430\u0437\u0431\u0430\u043C\u0434\u044B \u0431\u043E\u043B\u0434\u044B\u0440\u043C\u0430\u0443 \u043A\u0435\u0440\u0435\u043A
kk	cancel	\u041A\u0435\u043B\u0435 \u0430\u043B\u043C\u0430\u0439\u043C\u044B\u043D, \u0436\u0430\u0437\u0431\u0430\u043D\u044B \u04E9\u0448\u0456\u0440\u0456\u043F \u0442\u0430\u0441\u0442\u0430\u04A3\u044B\u0437
kk	cancel	\u0410\u0443\u044B\u0440\u044B\u043F \u049B\u0430\u043B\u0434\u044B\u043C, \u043A\u0435\u043B\u043C\u0435\u0439\u043C\u0456\u043D
kk	cancel	\u0411\u0440\u043E\u043D\u044C\u0434\u044B \u0430\u043B\u044B\u043F \u0442\u0430\u0441\u0442\u0430\u04A3\u044B\u0437
kk	complaint	\u0428\u0430\u0448\u044B\u043C\u0434\u044B \u0436\u0430\u043C\u0430\u043D \u049B\u0438\u0434\u044B, \u0448\u0430\u0493\u044B\u043C\u0434\u0430\u043D\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	complaint	\u0410\u049B\u0448\u0430\u043D\u044B \u0435\u043A\u0456 \u0440\u0435\u0442 \u0430\u043B\u0434\u044B\u04A3\u044B\u0437\u0434\u0430\u0440, \u049B\u0430\u0439\u0442\u0430\u0440\u044B\u04A3\u044B\u0437
kk	complaint	\u0421\u04B1\u043C\u0434\u044B\u049B \u0448\u0430\u0448 \u049B\u0438\u044E, \u0442\u0435\u0433\u0456\u0441 \u0435\u043C\u0435\u0441
kk	complaint	\u041C\u0430\u043D\u0438\u043A\u044E\u0440\u0434\u0435\u043D \u043A\u0435\u0439\u0456\u043D \u0441\u0430\u0443\u0441\u0430\u0493\u044B\u043C \u0456\u0441\u0456\u043F \u043A\u0435\u0442\u0442\u0456
kk	complaint	\u0428\u0435\u0431\u0435\u0440\u0433\u0435 \u04E9\u0442\u0435 \u043D\u0430\u0440\u0430\u0437\u044B\u043C\u044B\u043D
kk	complaint	\u0416\u0430\u0437\u044B\u043B\u044B\u043F \u0435\u0434\u0456\u043C, \u0431\u0456\u0440\u0430\u049B \u049B\u0430\u0431\u044B\u043B\u0434\u0430\u043C\u0430\u0434\u044B, \u04B1\u044F\u0442
kk	address	\u0421\u0456\u0437\u0434\u0435\u0440\u0434\u0456 \u049B\u0430\u043B\u0430\u0439 \u0442\u0430\u0431\u0443\u0493\u0430 \u0431\u043E\u043B\u0430\u0434\u044B?
kk	address	\u049A\u0430\u0439 \u043A\u04E9\u0448\u0435\u0434\u0435\u0441\u0456\u0437\u0434\u0435\u0440?
kk	address	\u049A\u0430\u0439\u0434\u0430\u0441\u044B\u0437\u0434\u0430\u0440? \u041C\u0435\u043A\u0435\u043D\u0436\u0430\u0439 \u0436\u0456\u0431\u0435\u0440\u0456\u04A3\u0456\u0437
kk	address	2\u0413\u0418\u0421-\u0442\u0435\u043D \u049B\u0430\u043B\u0430\u0439 \u0442\u0430\u0431\u0430\u043C\u044B\u043D
kk	address	\u0416\u0430\u043D\u044B\u04A3\u044B\u0437\u0434\u0430 \u049B\u0430\u043D\u0434\u0430\u0439 \u0431\u0435\u043B\u0433\u0456 \u0431\u0430\u0440
kk	hours	\u0415\u0440\u0442\u0435\u04A3 \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440 \u043C\u0435?
kk	hours	\u0416\u04B1\u043C\u044B\u0441 \u0442\u04D9\u0440\u0442\u0456\u0431\u0456\u043D \u0430\u0439\u0442\u044B\u04A3\u044B\u0437\u0448\u044B
kk	hours	\u049A\u0430\u0439 \u0443\u0430\u049B\u044B\u0442\u0442\u0430 \u0430\u0448\u044B\u049B\u0441\u044B\u0437\u0434\u0430\u0440
kk	hours	\u0421\u0430\u0493\u0430\u0442 \u043D\u0435\u0448\u0435\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u043A\u0435\u043B\u0443\u0433\u0435 \u0431\u043E\u043B\u0430\u0434\u044B
kk	hours	\u0414\u0435\u043C\u0430\u043B\u044B\u0441 \u043A\u04AF\u043D\u0434\u0435\u0440\u0456\u04A3\u0456\u0437 \u0431\u0430\u0440 \u043C\u0430?
kk	confirm	\u0418\u04D9, \u0436\u0430\u0437\u0430 \u0431\u0435\u0440\u0456\u04A3\u0456\u0437
kk	confirm	\u041A\u0435\u043B\u0435\u0434\u0456
kk	confirm	\u041A\u0435\u0440\u0435\u043C\u0435\u0442, \u0441\u043E\u043B\u0430\u0439 \u0431\u043E\u043B\u0441\u044B\u043D
kk	confirm,booking	\u0418\u04D9, 18:30 \u044B\u04A3\u0493\u0430\u0439\u043B\u044B
kk	confirm	\u0420\u0430\u0441\u0442\u0430\u0439\u043C\u044B\u043D
kk	thanks	\u0420\u0430\u0445\u043C\u0435\u0442, \u0431\u04D9\u0440\u0456 \u0442\u04AF\u0441\u0456\u043D\u0456\u043A\u0442\u0456
kk	thanks	\u041A\u04E9\u043C\u0435\u0433\u0456\u04A3\u0456\u0437\u0433\u0435 \u0440\u0430\u0445\u043C\u0435\u0442
kk	thanks	\u04AE\u043B\u043A\u0435\u043D \u0440\u0430\u0445\u043C\u0435\u0442 \u0441\u0456\u0437\u0433\u0435
kk	thanks	\u0440\u0430\u0445\u043C\u0435\u0442 \u043A\u04E9\u043F
kk	other	\u0411\u0430\u043B\u0430\u043C\u043C\u0435\u043D \u043A\u0435\u043B\u0443\u0433\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	other	\u041A\u043E\u0444\u0435 \u0431\u0430\u0440 \u043C\u0430?
kk	other	\u041C\u0435\u043D \u0414\u0430\u043D\u0438\u044F\u0440
kk	other	\u041D\u04E9\u043C\u0456\u0440\u0456\u043C 87015551122
kk	other	\u0421\u0430\u049B\u0430\u043B \u0431\u043E\u0439\u044B\u043D\u0448\u0430 \u0435\u04A3 \u0436\u0430\u049B\u0441\u044B \u0448\u0435\u0431\u0435\u0440 \u043A\u0456\u043C?
kk	other	Kaspi \u0430\u0440\u049B\u044B\u043B\u044B \u0442\u04E9\u043B\u0435\u0443\u0433\u0435 \u0431\u043E\u043B\u0430 \u043C\u0430?
kk	other	\u041A\u043E\u043D\u0434\u0438\u0446\u0438\u043E\u043D\u0435\u0440 \u0431\u0430\u0440 \u043C\u0430?
kk	other	\u049A\u0430\u043D\u0448\u0430 \u0448\u0435\u0431\u0435\u0440 \u0431\u0430\u0440?
en	greeting	Hello, is this the barbershop?
en	greeting	yo
en	greeting	Good day, could you help me
en	greeting	Hi, are you there?
en	price	How much is a straight razor shave
en	price	what are the pedicure prices
en	price	How much to tint eyebrows
en	price	please write the cost of your services
en	price	how much is a haircut with styling
en	price	is it expensive? how much exactly
en	price	What's the price for grey camouflage
en	price	how much do I pay for a kid
en	price	Any discounts, and how much is a haircut
en	booking	Can I book with Arman?
en	booking	I want to come on Monday
en	booking	Is there time tomorrow afternoon?
en	booking	Book me for 3 pm please
en	booking	Anything the day after tomorrow?
en	booking	I'd like a manicure on Saturday morning
en	booking	When is the next free appointment?
en	booking	can I drop by today?
en	booking	I need my beard trimmed on Friday
en	booking	Is 10 am free?
en	booking	I want to book colouring next week
en	booking	can I come on 12.11 at 16:00
en	booking	Let's make it 19:00 instead
en	booking	Do you have another time?
en	booking	i want to book
en	cancel	I'm cancelling my appointment
en	cancel	I need to cancel tomorrow's booking
en	cancel	can't come, please cancel
en	cancel	I'm sick, won't come
en	cancel	drop my reservation
en	complaint	I didn't like my haircut, I want to complain
en	complaint	You charged me twice, give it back
en	complaint	Horrible haircut, it's uneven
en	complaint	My finger is swollen after the manicure
en	complaint	Very unhappy with the barber
en	complaint	I had a booking but you didn't take me, outrageous
en	address	How can I find you?
en	address	What street are you on?
en	address	Where are you? Send the address
en	address	how do I find you on the map
en	address	Any landmark near you
en	hours	Are you working tomorrow?
en	hours	Tell me your schedule
en	hours	what time are you open
en	hours	How late can I come
en	hours	Do you have days off?
en	confirm	Yes, book me
en	confirm	Okay
en	confirm	works for me
en	confirm	Great, go ahead
en	confirm,booking	yes 18:30 is fine
en	confirm	Confirmed
en	thanks	thanks, all clear
en	thanks	Thanks for your help
en	thanks	Thank you very much
en	thanks	ty
en	other	Can I come with my kid?
en	other	do you have coffee
en	other	I'm Daniyar
en	other	My number is 4155550132
en	other	Who is your best beard barber?
en	other	can I pay with Apple Pay?
en	other	Do you have air conditioning?
en	other	How many barbers do you have?
ru	greeting,price	\u0414\u043E\u0431\u0440\u044B\u0439 \u0432\u0435\u0447\u0435\u0440, \u043A\u0430\u043A\u0438\u0435 \u0446\u0435\u043D\u044B \u043D\u0430 \u0441\u0442\u0440\u0438\u0436\u043A\u0443?
ru	greeting,cancel	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, \u0445\u043E\u0447\u0443 \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u044C \u0437\u0430\u043F\u0438\u0441\u044C
ru	greeting,address	\u041F\u0440\u0438\u0432\u0435\u0442! \u0413\u0434\u0435 \u0432\u044B \u043D\u0430\u0445\u043E\u0434\u0438\u0442\u0435\u0441\u044C?
ru	greeting,hours	\u0414\u043E\u0431\u0440\u044B\u0439 \u0434\u0435\u043D\u044C, \u0434\u043E \u0441\u043A\u043E\u043B\u044C\u043A\u0438 \u0432\u044B \u0441\u0435\u0433\u043E\u0434\u043D\u044F?
ru	greeting,complaint	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, \u0443 \u043C\u0435\u043D\u044F \u0436\u0430\u043B\u043E\u0431\u0430 \u043D\u0430 \u043C\u0430\u0441\u0442\u0435\u0440\u0430
ru	price	\u041F\u043E\u0447\u0435\u043C \u0443 \u0432\u0430\u0441 \u0441\u0442\u0440\u0438\u0436\u043A\u0438
ru	price	\u0441\u043A\u043E\u043B\u044C\u043A\u043E \u0441\u0442\u043E\u0438\u0442 \u0443\u043A\u043B\u0430\u0434\u043A\u0430
ru	price	\u0421\u0442\u043E\u0438\u043C\u043E\u0441\u0442\u044C \u043E\u043A\u0440\u0430\u0448\u0438\u0432\u0430\u043D\u0438\u044F \u043A\u0430\u043A\u0430\u044F?
ru	booking	\u041A\u043E\u0433\u0434\u0430 \u043C\u043E\u0436\u043D\u043E \u043A \u0432\u0430\u043C \u043F\u0440\u0438\u0439\u0442\u0438?
ru	booking	\u043D\u0430 \u043A\u0430\u043A\u043E\u0435 \u0432\u0440\u0435\u043C\u044F \u043C\u043E\u0436\u043D\u043E \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F
ru	booking	\u0421\u0432\u043E\u0431\u043E\u0434\u043D\u043E \u0437\u0430\u0432\u0442\u0440\u0430 \u0443\u0442\u0440\u043E\u043C?
ru	booking	\u043C\u043E\u0436\u043D\u043E \u043B\u0438 \u0432 \u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u0435 \u043F\u043E\u0434\u0441\u0442\u0440\u0438\u0447\u044C\u0441\u044F
ru	booking	\u0425\u043E\u0447\u0443 \u043A \u043B\u044E\u0431\u043E\u043C\u0443 \u043C\u0430\u0441\u0442\u0435\u0440\u0443 \u043D\u0430 \u0441\u0435\u0433\u043E\u0434\u043D\u044F
ru	booking	\u0435\u0441\u0442\u044C \u043B\u0438 \u0437\u0430\u043F\u0438\u0441\u044C \u043D\u0430 14:00
ru	booking	\u0425\u043E\u0442\u0435\u043B \u0431\u044B \u0437\u0430\u043F\u0438\u0441\u0430\u0442\u044C\u0441\u044F \u043D\u0430 \u0431\u0440\u0438\u0442\u044C\u0435 \u0432 \u0447\u0435\u0442\u0432\u0435\u0440\u0433
ru	cancel	\u044F \u043F\u0435\u0440\u0435\u0434\u0443\u043C\u0430\u043B, \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435
ru	cancel	\u0417\u0430\u043F\u0438\u0441\u044C \u0431\u043E\u043B\u044C\u0448\u0435 \u043D\u0435 \u043D\u0443\u0436\u043D\u0430
ru	cancel	\u043C\u043E\u0436\u043D\u043E \u0443\u0431\u0440\u0430\u0442\u044C \u0431\u0440\u043E\u043D\u044C \u043D\u0430 \u0437\u0430\u0432\u0442\u0440\u0430
ru	cancel	\u043D\u0435 \u0441\u043C\u043E\u0433\u0443, \u043E\u0442\u043C\u0435\u043D\u0438\u0442\u0435 \u0432\u0438\u0437\u0438\u0442
ru	complaint	\u042D\u0442\u043E \u0431\u0435\u0437\u043E\u0431\u0440\u0430\u0437\u0438\u0435
ru	complaint	\u041C\u043D\u0435 \u0433\u0440\u0443\u0431\u043E \u043E\u0442\u0432\u0435\u0442\u0438\u043B\u0438, \u044F \u0432 \u0448\u043E\u043A\u0435
ru	complaint	\u041F\u043B\u043E\u0445\u0430\u044F \u0441\u0442\u0440\u0438\u0436\u043A\u0430, \u043F\u0435\u0440\u0435\u0434\u0435\u043B\u0430\u0439\u0442\u0435 \u0438\u043B\u0438 \u0432\u0435\u0440\u043D\u0438\u0442\u0435 \u0434\u0435\u043D\u044C\u0433\u0438
ru	complaint	\u042F \u0445\u043E\u0447\u0443 \u043F\u043E\u0434\u0430\u0442\u044C \u0436\u0430\u043B\u043E\u0431\u0443
ru	complaint	\u0443 \u043C\u0435\u043D\u044F \u0440\u0430\u0437\u0434\u0440\u0430\u0436\u0435\u043D\u0438\u0435 \u043F\u043E\u0441\u043B\u0435 \u0431\u0440\u0438\u0442\u044C\u044F
ru	complaint	\u041E\u0431\u0441\u043B\u0443\u0436\u0438\u0432\u0430\u043D\u0438\u0435 \u0443\u0436\u0430\u0441\u043D\u043E\u0435
ru	address	\u043D\u0430\u043F\u0438\u0448\u0438\u0442\u0435 \u0433\u0434\u0435 \u0432\u044B
ru	address	\u0412 \u043A\u0430\u043A\u043E\u043C \u0442\u043E\u0440\u0433\u043E\u0432\u043E\u043C \u0446\u0435\u043D\u0442\u0440\u0435 \u0432\u044B?
ru	hours	\u0412\u044B \u0441\u0435\u0433\u043E\u0434\u043D\u044F \u043E\u0442\u043A\u0440\u044B\u0442\u044B?
ru	hours	\u0421 \u043A\u0430\u043A\u043E\u0433\u043E \u0432\u0440\u0435\u043C\u0435\u043D\u0438 \u0440\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435?
ru	hours	\u0420\u0430\u0431\u043E\u0442\u0430\u0435\u0442\u0435 \u043F\u043E \u0432\u043E\u0441\u043A\u0440\u0435\u0441\u0435\u043D\u044C\u044F\u043C?
ru	hours	\u043A\u043E\u0433\u0434\u0430 \u0432\u044B \u0437\u0430\u043A\u0440\u044B\u0432\u0430\u0435\u0442\u0435\u0441\u044C
ru	confirm	\u0414\u0430\u0432\u0430\u0439\u0442\u0435 \u043F\u0435\u0440\u0432\u043E\u0435 \u0432\u0440\u0435\u043C\u044F
ru	confirm	\u0425\u043E\u0440\u043E\u0448\u043E, \u0434\u043E\u0433\u043E\u0432\u043E\u0440\u0438\u043B\u0438\u0441\u044C
ru	confirm	\u041E\u0442\u043B\u0438\u0447\u043D\u043E, \u0432\u0442\u043E\u0440\u043E\u0439 \u0432\u0430\u0440\u0438\u0430\u043D\u0442
ru	confirm	\u0414\u0430, \u044D\u0442\u043E \u0432\u0440\u0435\u043C\u044F \u043F\u043E\u0434\u0445\u043E\u0434\u0438\u0442
ru	confirm	\u0418\u0434\u0435\u0442
ru	confirm	\u041D\u043E\u0440\u043C, \u0437\u0430\u043F\u0438\u0441\u044B\u0432\u0430\u0439\u0442\u0435
ru	thanks	\u0441\u043F\u0430\u0441\u0438\u0431\u043E, \u0436\u0434\u0443
ru	thanks	\u0421\u043F\u0430\u0441\u0438\u0431\u043E \u0437\u0430 \u043E\u0442\u0432\u0435\u0442
ru	other	\u0447\u0442\u043E \u0442\u0430\u043A\u043E\u0435 VIP \u0440\u0438\u0442\u0443\u0430\u043B?
ru	other	\u0443 \u0432\u0430\u0441 \u043C\u0443\u0436\u0441\u043A\u043E\u0439 \u0438\u043B\u0438 \u0436\u0435\u043D\u0441\u043A\u0438\u0439 \u0441\u0430\u043B\u043E\u043D?
ru	other	\u0410\u043B\u0438\u044F, 87071234567
ru	other	\u043A\u0430\u043A \u0437\u043E\u0432\u0443\u0442 \u043C\u0430\u0441\u0442\u0435\u0440\u0430?
kk	greeting,price	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u043A\u0435\u0448, \u0448\u0430\u0448 \u049B\u0438\u044E\u0434\u044B\u04A3 \u0431\u0430\u0493\u0430\u0441\u044B \u049B\u0430\u043D\u0434\u0430\u0439?
kk	greeting,cancel	\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437 \u0431\u0435, \u0436\u0430\u0437\u044B\u043B\u0443\u044B\u043C\u0434\u044B \u04E9\u0448\u0456\u0440\u0433\u0456\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	greeting,address	\u0421\u04D9\u043B\u0435\u043C! \u049A\u0430\u0439\u0434\u0430\u0441\u044B\u0437\u0434\u0430\u0440?
kk	greeting,hours	\u049A\u0430\u0439\u044B\u0440\u043B\u044B \u043A\u04AF\u043D, \u0431\u04AF\u0433\u0456\u043D \u043D\u0435\u0448\u0435\u0433\u0435 \u0434\u0435\u0439\u0456\u043D \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440?
kk	greeting,complaint	\u0421\u04D9\u043B\u0435\u043C\u0435\u0442\u0441\u0456\u0437 \u0431\u0435, \u0448\u0435\u0431\u0435\u0440 \u0442\u0443\u0440\u0430\u043B\u044B \u0448\u0430\u0493\u044B\u043C\u044B\u043C \u0431\u0430\u0440
kk	price	\u0428\u0430\u0448 \u049B\u0438\u044E \u049B\u0430\u043D\u0448\u0430
kk	price	\u0421\u04D9\u043D\u0434\u0435\u0443 \u049B\u0430\u043D\u0448\u0430 \u0442\u04B1\u0440\u0430\u0434\u044B
kk	price	\u0411\u043E\u044F\u0443\u0434\u044B\u04A3 \u049B\u04B1\u043D\u044B \u049B\u0430\u043D\u0434\u0430\u0439?
kk	price	\u0448\u0430\u0448 \u043A\u0438\u044E \u043A\u0430\u043D\u0448\u0430 \u0442\u0443\u0440\u0430\u0434\u044B
kk	price	\u0431\u0430\u0433\u0430\u0441\u044B \u043A\u0430\u043D\u0448\u0430
kk	booking	\u0421\u0456\u0437\u0434\u0435\u0440\u0433\u0435 \u049B\u0430\u0448\u0430\u043D \u043A\u0435\u043B\u0443\u0433\u0435 \u0431\u043E\u043B\u0430\u0434\u044B?
kk	booking	\u049A\u0430\u0439 \u0443\u0430\u049B\u044B\u0442\u049B\u0430 \u0436\u0430\u0437\u044B\u043B\u0443\u0493\u0430 \u0431\u043E\u043B\u0430\u0434\u044B
kk	booking	\u0415\u0440\u0442\u0435\u04A3 \u0442\u0430\u04A3\u0435\u0440\u0442\u0435\u04A3 \u0431\u043E\u0441 \u043F\u0430?
kk	booking	\u0416\u0435\u043A\u0441\u0435\u043D\u0431\u0456\u0434\u0435 \u0448\u0430\u0448 \u049B\u0438\u044E\u0493\u0430 \u0431\u043E\u043B\u0430 \u043C\u0430
kk	booking	\u0411\u04AF\u0433\u0456\u043D\u0433\u0435 \u043A\u0435\u0437 \u043A\u0435\u043B\u0433\u0435\u043D \u0448\u0435\u0431\u0435\u0440\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	14:00-\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0443 \u0431\u0430\u0440 \u043C\u0430
kk	booking	\u0411\u0435\u0439\u0441\u0435\u043D\u0431\u0456\u0434\u0435 \u049B\u044B\u0440\u044B\u043D\u0443\u0493\u0430 \u0436\u0430\u0437\u044B\u043B\u0493\u044B\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	booking	\u0435\u0440\u0442\u0435\u043D\u0433\u0435 \u0436\u0430\u0437\u044B\u043B\u0443\u0433\u0430 \u0431\u043E\u043B\u0430 \u043C\u0430
kk	booking	\u0431\u043E\u0441 \u0443\u0430\u043A\u044B\u0442 \u0431\u0430\u0440 \u043C\u0430
kk	cancel	\u041E\u0439\u044B\u043C\u043D\u0430\u043D \u0430\u0439\u043D\u044B\u0434\u044B\u043C, \u04E9\u0448\u0456\u0440\u0456\u04A3\u0456\u0437
kk	cancel	\u0416\u0430\u0437\u044B\u043B\u0443 \u0435\u043D\u0434\u0456 \u043A\u0435\u0440\u0435\u043A \u0435\u043C\u0435\u0441
kk	cancel	\u0415\u0440\u0442\u0435\u04A3\u0433\u0456 \u0431\u0440\u043E\u043D\u044C\u0434\u044B \u0430\u043B\u044B\u043F \u0442\u0430\u0441\u0442\u0430\u0443\u0493\u0430 \u0431\u043E\u043B\u0430 \u043C\u0430
kk	cancel	\u041A\u0435\u043B\u0435 \u0430\u043B\u043C\u0430\u0439\u043C\u044B\u043D, \u0436\u0430\u0437\u044B\u043B\u0443\u0434\u044B \u0431\u043E\u043B\u0434\u044B\u0440\u043C\u0430\u04A3\u044B\u0437
kk	cancel	\u0436\u0430\u0437\u044B\u043B\u0443\u0434\u044B \u043E\u0448\u0438\u0440\u0438\u043D\u0438\u0437
kk	complaint	\u0411\u04B1\u043B \u043C\u0430\u0441\u049B\u0430\u0440\u0430
kk	complaint	\u041C\u0430\u0493\u0430\u043D \u0434\u04E9\u0440\u0435\u043A\u0456 \u0436\u0430\u0443\u0430\u043F \u0431\u0435\u0440\u0434\u0456, \u0442\u0430\u04A3\u0493\u0430\u043B\u0434\u044B\u043C
kk	complaint	\u041D\u0430\u0448\u0430\u0440 \u0448\u0430\u0448 \u049B\u0438\u044E, \u049B\u0430\u0439\u0442\u0430 \u0436\u0430\u0441\u0430\u04A3\u044B\u0437 \u043D\u0435\u043C\u0435\u0441\u0435 \u0430\u049B\u0448\u0430\u043D\u044B \u049B\u0430\u0439\u0442\u0430\u0440\u044B\u04A3\u044B\u0437
kk	complaint	\u0428\u0430\u0493\u044B\u043C \u0431\u0435\u0440\u0433\u0456\u043C \u043A\u0435\u043B\u0435\u0434\u0456
kk	complaint	\u049A\u044B\u0440\u044B\u043D\u0443\u0434\u0430\u043D \u043A\u0435\u0439\u0456\u043D \u0442\u0435\u0440\u0456\u043C \u0442\u0456\u0442\u0456\u0440\u043A\u0435\u043D\u0434\u0456
kk	complaint	\u049A\u044B\u0437\u043C\u0435\u0442 \u043A\u04E9\u0440\u0441\u0435\u0442\u0443 \u0441\u04B1\u043C\u0434\u044B\u049B
kk	address	\u049A\u0430\u0439\u0434\u0430 \u0435\u043A\u0435\u043D\u0456\u04A3\u0456\u0437\u0434\u0456 \u0436\u0430\u0437\u044B\u04A3\u044B\u0437\u0448\u044B
kk	address	\u049A\u0430\u0439 \u0441\u0430\u0443\u0434\u0430 \u043E\u0440\u0442\u0430\u043B\u044B\u0493\u044B\u043D\u0434\u0430\u0441\u044B\u0437\u0434\u0430\u0440?
kk	address	\u043C\u0435\u043A\u0435\u043D\u0436\u0430\u0439\u044B\u043D\u044B\u0437 \u043A\u0430\u043D\u0434\u0430\u0439
kk	hours	\u0411\u04AF\u0433\u0456\u043D \u0430\u0448\u044B\u049B\u0441\u044B\u0437\u0434\u0430\u0440 \u043C\u0430?
kk	hours	\u041D\u0435\u0448\u0435\u0434\u0435\u043D \u0431\u0430\u0441\u0442\u0430\u043F \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440?
kk	hours	\u0416\u0435\u043A\u0441\u0435\u043D\u0431\u0456 \u0441\u0430\u0439\u044B\u043D \u0436\u04B1\u043C\u044B\u0441 \u0456\u0441\u0442\u0435\u0439\u0441\u0456\u0437\u0434\u0435\u0440 \u043C\u0435?
kk	hours	\u049A\u0430\u0448\u0430\u043D \u0436\u0430\u0431\u044B\u043B\u0430\u0441\u044B\u0437\u0434\u0430\u0440
kk	hours	\u043D\u0435\u0448\u0435\u0433\u0435 \u0434\u0435\u0439\u0438\u043D \u0436\u0443\u043C\u044B\u0441 \u0438\u0441\u0442\u0435\u0439\u0441\u0438\u0437\u0434\u0435\u0440
kk	confirm	\u0411\u0456\u0440\u0456\u043D\u0448\u0456 \u0443\u0430\u049B\u044B\u0442 \u0431\u043E\u043B\u0441\u044B\u043D
kk	confirm	\u0416\u0430\u049B\u0441\u044B, \u043A\u0435\u043B\u0456\u0441\u0442\u0456\u043A
kk	confirm	\u041A\u0435\u0440\u0435\u043C\u0435\u0442, \u0435\u043A\u0456\u043D\u0448\u0456 \u043D\u04B1\u0441\u049B\u0430
kk	confirm	\u0418\u04D9, \u0431\u04B1\u043B \u0443\u0430\u049B\u044B\u0442 \u044B\u04A3\u0493\u0430\u0439\u043B\u044B
kk	confirm	\u0416\u0430\u0440\u0430\u0439\u0434\u044B, \u0436\u0430\u0437\u044B\u04A3\u044B\u0437
kk	confirm	\u0438\u044F
kk	thanks	\u0420\u0430\u0445\u043C\u0435\u0442, \u043A\u04AF\u0442\u0435\u043C\u0456\u043D
kk	thanks	\u0416\u0430\u0443\u0430\u0431\u044B\u04A3\u044B\u0437\u0493\u0430 \u0440\u0430\u0445\u043C\u0435\u0442
kk	other	VIP \u0440\u0438\u0442\u0443\u0430\u043B \u0434\u0435\u0433\u0435\u043D \u043D\u0435?
kk	other	\u0415\u0440\u043B\u0435\u0440 \u0441\u0430\u043B\u043E\u043D\u044B \u043C\u0430, \u04D9\u0439\u0435\u043B\u0434\u0435\u0440 \u0441\u0430\u043B\u043E\u043D\u044B \u043C\u0430?
kk	other	\u04D8\u043B\u0438\u044F, 87071234567
kk	other	\u0428\u0435\u0431\u0435\u0440\u0434\u0456\u04A3 \u0430\u0442\u044B \u043A\u0456\u043C?
en	greeting,price	Good evening, what are your haircut prices?
en	greeting,cancel	Hello, I want to cancel my booking
en	greeting,address	Hi! Where are you located?
en	greeting,hours	Good afternoon, how late are you open today?
en	greeting,complaint	Hello, I have a complaint about the barber
en	price	How much are your haircuts
en	price	how much is styling
en	price	What does colouring cost?
en	booking	When can I come to you?
en	booking	what time can I book
en	booking	Free tomorrow morning?
en	booking	can I get a haircut on Sunday
en	booking	I want any barber today
en	booking	is 14:00 available
en	booking	I'd like to book a shave on Thursday
en	cancel	I changed my mind, cancel it
en	cancel	I don't need the booking anymore
en	cancel	can you remove tomorrow's reservation
en	cancel	can't make it, cancel the visit
en	complaint	This is outrageous
en	complaint	Your staff was rude to me, I'm shocked
en	complaint	Bad haircut, fix it or refund me
en	complaint	I want to file a complaint
en	complaint	my skin is irritated after the shave
en	complaint	The service is horrible
en	address	write where you are
en	address	Which mall are you in?
en	hours	Are you open today?
en	hours	From what time do you work?
en	hours	Do you work on Sundays?
en	hours	when do you close
en	confirm	The first time please
en	confirm	Alright, deal
en	confirm	Great, the second option
en	confirm	Yes, that time works
en	confirm	Fine, book me in
en	confirm	yeah
en	thanks	thanks, waiting
en	thanks	Thanks for the answer
en	other	what is the VIP ritual?
en	other	is it a men's or women's salon?
en	other	Aliya, 4155551234
en	other	what is the barber's name?
ru	greeting	\u0417\u0434\u0440\u0430\u0432\u0441\u0442\u0432\u0443\u0439\u0442\u0435, \u043F\u043E\u0434\u0441\u043A\u0430\u0436\u0438\u0442\u0435 \u043F\u043E\u0436\u0430\u043B\u0443\u0439\u0441\u0442\u0430!
kk	other	\u041C\u0435\u043D\u0456\u04A3 \u043D\u04E9\u043C\u0456\u0440\u0456\u043C 8 777 123 45 67
en	other	my phone is 415 555 0132 if needed
kk	thanks	\u0440\u0430\u0445\u043C\u0435\u0442 \u0441\u0456\u0437\u0433\u0435 \u043A\u04E9\u043F
en	greeting	Hello, anyone here?
kk	confirm	\u041E\u043A, \u043A\u0435\u043B\u0456\u0441\u0442\u0456\u043A
`);return await e.load(n),e}};window.VoronixBrain=ot;})();
