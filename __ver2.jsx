import React from 'react';
import { createRoot } from 'react-dom/client';
import TechPackPagePreview from './src/components/techpack/TechPackPagePreview.jsx';
import { STEPS } from './src/components/techpack/techPackConstants.js';
const ph=(l,w,h,bg)=>'data:image/svg+xml;base64,'+btoa(`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' font-family='sans-serif' font-size='${Math.round(Math.min(w,h)/7)}' fill='rgba(58,58,58,0.5)' text-anchor='middle' dominant-baseline='middle'>${l}</text></svg>`);
const images=[
  { slot:'seam-stitch-callout-page1', data: ph('STITCH MAP',200,380,'#E6E0D2') },
  { slot:'seam-stitch-1', data: ph('RENDER 1',640,360,'#D9D2C3') },
  { slot:'seam-stitch-1-support', data: ph('REF',360,360,'#E4DECF') },
  { slot:'seam-stitch-2', data: ph('RENDER 2',640,360,'#D9D2C3') },
];
const data={ styleNumber:'FW26-BB-ZH-0001', collection:'Borderless Basics', season:'FW26', revision:'V1.0',
  colorways:[{name:'Slate'}], sizeRange:'S / M / L / XL',
  seamStitchBlocks:[{num:1,label:'Neckline'},{num:2,label:'Hoodie Seam'},{num:3,label:'Shoulder Seam'},{num:4,label:''}],
  seams:[
    {seamType:'2 Needle Coverstitch',stitchType:'406',spiSpcm:'12 SPI',threadColor:'PFD',threadType:'Tex 40'},
    {seamType:'2 Needle Coverstitch',stitchType:'406',spiSpcm:'12 SPI',threadColor:'PFD',threadType:'Tex 40'},
    {seamType:'2 Needle Coverstitch',stitchType:'406',spiSpcm:'12 SPI',threadColor:'PFD',threadType:'Tex 40'},
    {seamType:'2 Needle Coverstitch',stitchType:'406',spiSpcm:'12 SPI',threadColor:'PFD',threadType:'Tex 40'},
  ],
};
const step = STEPS.findIndex(s => s.id === 'construction');
createRoot(document.getElementById('root')).render(React.createElement('div',{style:{width:1123,padding:16,background:'#F5F0E8'}},
  React.createElement(TechPackPagePreview,{data,images,step,skippedSteps:[]})));
