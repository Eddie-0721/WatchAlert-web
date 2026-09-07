import {useLayoutEffect} from 'react';

// Keep URL+tenant-scoped scroll offsets, not alert data. Lazy route children
// arrive after the shell, so observe both replacement and subsequent resizing.
export function useWorkspaceScroll(ref, location, ready = true) {
  const params = new URLSearchParams(location.search); params.delete('event');
  const routeKey = `${location.pathname}?${params}`;
  useLayoutEffect(() => {
    const node = ref.current; if(!node || !ready) return;
    const key = `wa-scroll:${localStorage.getItem('TenantID')}:${routeKey}`;
    let target = 0; try { target = Math.max(0, Number(sessionStorage.getItem(key)) || 0); } catch {}
    let lastOffset=target, restored=target===0;
    const persist=()=>{try{sessionStorage.setItem(key,String(lastOffset))}catch{}};
    const restore=()=>{
      if(restored)return;
      node.scrollTop=target;
      if(Math.abs(node.scrollTop-target)<2) {restored=true;lastOffset=target;}
    };
    node.scrollTop=target;
    const observer=new ResizeObserver(restore);
    const observeChildren=()=>{observer.disconnect();for(const child of node.children)observer.observe(child);restore()};
    const mutation=new MutationObserver(observeChildren);
    mutation.observe(node,{childList:true});
    observeChildren();
    const onScroll=()=>{if(restored){lastOffset=node.scrollTop;persist()}};
    const cancel=()=>{restored=true;lastOffset=node.scrollTop;persist()};
    node.addEventListener('scroll',onScroll,{passive:true});
    node.addEventListener('wheel',cancel,{passive:true});
    node.addEventListener('touchstart',cancel,{passive:true});
    node.addEventListener('keydown',cancel);
    return ()=>{
      observer.disconnect();mutation.disconnect();
      node.removeEventListener('scroll',onScroll);node.removeEventListener('wheel',cancel);
      node.removeEventListener('touchstart',cancel);node.removeEventListener('keydown',cancel);
      // The next route can already have shortened this node. Persist the last
      // observed offset rather than its now-clamped scrollTop.
      persist();
    };
  }, [ref,routeKey,ready]);
}
