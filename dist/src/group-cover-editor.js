// The group photo uses exactly the same chooser, crop geometry, zoom,
// gestures, rotation and preview component as the profile photo.
import { mountProfileAvatarEditor } from "./avatar-crop-editor.js?build=a11088ce9a105311";

export function editGroupCover(file=null){
  return new Promise(resolve=>{
    let editor=null,settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      resolve(value);
      queueMicrotask(()=>editor?.dispose());
    };
    editor=mountProfileAvatarEditor({
      root:document.body,contextLabel:"grupo",
      onOutput:async cropped=>finish(cropped),
      onCancelled:()=>finish(null)
    });
    if(file)void editor.openFile(file);
    else editor.open();
  });
}
