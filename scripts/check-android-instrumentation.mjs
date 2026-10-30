// Fail closed: Gradle 9's connectedDebugAndroidTest can print BUILD SUCCESSFUL
// even when AndroidTestRunner failed before installing the test APK.
// Require JUnit XML proving all three actual Android WebView tests executed.
import {existsSync,readdirSync,readFileSync} from "node:fs";
import path from "node:path";

const roots=[
  "android/app/build/outputs/androidTest-results/connected",
  "android/app/build/reports/androidTests/connected",
  "android/app/build/outputs/connected_android_test_additional_output"
];
function walk(base){
  if(!existsSync(base))return [];
  const paths=[];
  for(const entry of readdirSync(base,{withFileTypes:true})){
    const file=path.join(base,entry.name);
    if(entry.isDirectory())paths.push(...walk(file));
    else if(/\.xml$/i.test(entry.name))paths.push(file);
  }
  return paths;
}
const reports=roots.flatMap(walk);
const targets=[
  "bundledWebViewActuallyLoadsARealPage",
  "AndroidWebViewCanRecordCameraAndMicrophoneTogether",
  "VideoMimeSharesheetWithOnlyInstagramUrlStaysInsideLooply"
];
let successes=new Set(),foundReports=0,failed=[];
for(const filename of reports){
  const xml=readFileSync(filename,"utf8");
  if(!xml.includes("RealWebViewIntegrationTest"))continue;
  foundReports++;
  if(/<(failure|error)\b/i.test(xml))failed.push(filename+": failure/error element");
  for(const match of xml.matchAll(/<testsuite\b[^>]*>/g)){
    const tag=match[0];
    const failure=Number(tag.match(/\bfailures="(\d+)"/)?.[1]||"0");
    const error=Number(tag.match(/\berrors="(\d+)"/)?.[1]||"0");
    const skipped=Number(tag.match(/\bskipped="(\d+)"/)?.[1]||"0");
    if(failure||error||skipped)failed.push(filename+": "+tag.slice(0,250));
  }
  for(const name of targets){
    if(new RegExp('<testcase\\b[^>]*\\bname="'+name+'"').test(xml))
      successes.add(name);
  }
}
console.log(JSON.stringify({reports:foundReports,executed:[...successes],failed},null,2));
const absent=targets.filter(name=>!successes.has(name));
if(!foundReports || absent.length || failed.length){
  console.error("Looply Android instrumentation NOT passed: "+
    JSON.stringify({absent,failed,xmlReports:reports.length}));
  process.exitCode=1;
}
