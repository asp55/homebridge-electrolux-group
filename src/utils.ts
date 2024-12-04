/* eslint-disable  @typescript-eslint/no-explicit-any */
export function AlphabatizeKeys(arg:any):typeof arg {
  if(arg instanceof Array) {
    return arg.map(v=>v instanceof Object ? AlphabatizeKeys(v) : v);
  }
  else if (typeof arg === "object"){
    const keys = Object.keys(arg).sort((a,b)=>a<b?-1:a>b?1:0);
  
    return keys.reduce((a,c)=>{
      const output = { ...a };
      if(arg[c] instanceof Object) {
        output[c] = AlphabatizeKeys(arg[c]);
      }
      else {
        output[c] = arg[c];
      }
      return output;
    }, {} as typeof arg);
  }
  else {
    return arg;
  }

}