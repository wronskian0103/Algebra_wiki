/* Keep MathJax labels inside the scrollable area after their real size is known. */
(() => {
  'use strict';
  let frame=0;
  function fit(root){
    for(const diagram of root.querySelectorAll('.diagram')){
      const bounds=diagram.getBoundingClientRect();
      // Closed proofs have no layout box; their toggle event schedules a new fit.
      if(!bounds.width||!bounds.height)continue;
      let left=bounds.left,right=bounds.right,top=bounds.top,bottom=bounds.bottom;
      for(const label of diagram.querySelectorAll('.diagram-node, .diagram-label')){
        const box=label.getBoundingClientRect();
        left=Math.min(left,box.left-8);right=Math.max(right,box.right+8);
        top=Math.min(top,box.top-8);bottom=Math.max(bottom,box.bottom+8);
      }
      const extraLeft=Math.ceil(bounds.left-left),extraRight=Math.ceil(right-bounds.right);
      // A positive left margin makes negative label overflow reachable even on
      // small screens. When space permits, center the complete painted bounds.
      diagram.style.marginLeft=`max(${extraLeft}px, calc((100% - ${bounds.width+extraRight-extraLeft}px) / 2))`;
      diagram.style.marginRight=`${extraRight}px`;
      diagram.style.marginTop=`${Math.ceil(bounds.top-top)}px`;
      diagram.style.marginBottom=`${Math.ceil(bottom-bounds.bottom)}px`;
    }
  }
  function schedule(root){
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{frame=0;fit(root);});
  }
  window.AlgebraDiagramLayout={fit,schedule};
})();
