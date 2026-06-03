const fs=require('fs');
let html=fs.readFileSync('dashboard/public/index.html','utf8');
const sm=html.match(/<script>([\s\S]*?)<\/script>/);
if(sm){
  const js=sm[1];
  const backticks=(js.match(/`/g)||[]).length;
  console.log('Backticks:', backticks, '(even:', backticks%2===0,')');

  // Find unbalanced backticks
  let count=0, lineNum=1, col=0;
  for(let i=0;i<js.length;i++){
    if(js[i]==='\n'){lineNum++;col=0}
    else col++;
    if(js[i]==='`')count++;
  }

  // Try to find the error
  try{new Function(js)}catch(e){
    console.log('Error:', e.message);
    // Try to narrow down
    for(let chunk=2000;chunk<js.length;chunk+=2000){
      try{new Function(js.substring(0,chunk))}catch(e2){
        console.log('First error around position', chunk-2000, '-', chunk);
        console.log('Context:', JSON.stringify(js.substring(Math.max(0,chunk-2100), chunk+100)).substring(0,300));
        break;
      }
    }
  }
}
