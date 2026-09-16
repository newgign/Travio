// Geometry only: no guest/search state or network operations.
export function guestPanelLayout(anchor, parent, viewportHeight) {
  const gap=8;
  const below=Math.max(0,viewportHeight-anchor.bottom-gap*2);
  const above=Math.max(0,anchor.top-gap*2);
  if(below<160 && above>below) {
    const bottom=Math.min(viewportHeight-gap,Math.max(gap,anchor.top-gap));
    return {top:'auto',bottom:`${parent.bottom-bottom}px`,maxHeight:`${Math.max(0,bottom-gap)}px`};
  }
  const top=Math.max(gap,Math.min(anchor.bottom+gap,viewportHeight-56));
  return {top:`${top-parent.top}px`,bottom:'auto',maxHeight:`${Math.max(0,viewportHeight-top-gap)}px`};
}
