/***************************************************************************/
/*                                                                         */
/*  This obfuscated code was created by Javascript Obfuscator Free Version.*/
/*  Javascript Obfuscator Free Version can be downloaded here              */
/*  http://javascriptobfuscator.com                                        */
/*                                                                         */
/***************************************************************************/
var _$_2b4c=["AIzaSyA-legWlCgjMDEy70rsaTTwLK39F4ZCKhM","n2shop-69e37.firebaseapp.com","n2shop-69e37","n2shop-69e37.appspot.com","598906493303","1:598906493303:web:46d6236a1fdc2eff33e972","G-TEJH3S2T1D","initializeApp","firestore","ref","storage","ib","collection","all","\xC1o","Qu\u1ea7n","Set v\xE0 \u0110\u1ea7m","PKGD","tbody","querySelector","id","","0","padStart","getDate","getMonth","getFullYear","/","filterCategory","getElementById","change","addEventListener","value","tr","querySelectorAll","td:nth-child(3)","textContent","display","style","none","forEach","admin","td:not(:last-child)","catch","exists","slice","data","innerText","Hi\u1ec7n","cellShow","\u1ea8n","then","update","doc","get","B\u1ea1n kh\xF4ng \u0111\u1ee7 quy\u1ec1n \u0111\u1ec3 th\u1ef1c hi\u1ec7n thao t\xE1c n\xE0y","tr[style=\"display: ;\"]","from","td:first-child","dataForm","submit","preventDefault","phanLoai","hinhAnhInput","tenSanPham","hinhKhachHangInput","length","files","Vui l\xF2ng \u0111i\u1ec1n \u0111\u1ea7y \u0111\u1ee7 th\xF4ng tin.","Vui l\xF2ng nh\u1eadp URL h\xECnh \u1ea3nh s\u1ea3n ph\u1ea9m.","https://","startsWith","Sai \u0111\u1ecbnh d\u1ea1ng link","name","ib/kh/","child","put","state_changed","error","T\u1ea3i l\xEAn th\xE0nh c\xF4ng!","log","URL c\u1ee7a h\xECnh \u1ea3nh:","vi-VN","numeric","2-digit","toLocaleDateString","L\u1ed7i khi ki\u1ec3m tra t\xE0i li\u1ec7u t\u1ed3n t\u1ea1i: ","L\u1ed7i khi t\u1ea3i document l\xEAn: ","Document t\u1ea3i l\xEAn th\xE0nh c\xF4ng","reload","arrayUnion","FieldValue","set","getDownloadURL","snapshot","on","clearDataButton","click",".product-image","pop","split",".","join","src","DOMContentLoaded","toggleFormButton","block","\u1ea8n bi\u1ec3u m\u1eabu","Hi\u1ec7n bi\u1ec3u m\u1eabu","productForm","reset","dotLive","-","product-row","firstChild","removeChild","L\u1ed7i khi l\u1ea5y d\u1eef li\u1ec7u:","innerHTML","insertRow","insertCell","thoiGianUpload","sp","\" alt=\"","\" class=\"product-image\">","kh","\" alt=\"H\xECnh \u1ea3nh kh\xE1ch h\xE0ng\">\x0D\x0A\x09\x09\x09\x09\x09\x09\x09\x09\x09\x09</div>\x0D\x0A\x09\x09\x09\x09\x09\x09\x09\x09\x09","button","createElement","className","toggle-visibility","onclick","appendChild","T\xE0i li\u1ec7u kh\xF4ng t\u1ed3n t\u1ea1i.","\\]","replace","\\[","[\\?&]","=([^&#]*)","search","exec"," "];const firebaseConfig={apiKey:_$_2b4c[0],authDomain:_$_2b4c[1],projectId:_$_2b4c[2],storageBucket:_$_2b4c[3],messagingSenderId:_$_2b4c[4],appId:_$_2b4c[5],measurementId:_$_2b4c[6]};const app=firebase[_$_2b4c[7]](firebaseConfig);const db=firebase[_$_2b4c[8]]();const storageRef=firebase[_$_2b4c[10]]()[_$_2b4c[9]]();const collectionRef=db[_$_2b4c[12]](_$_2b4c[11]);const ALL_CATEGORIES=_$_2b4c[13];const CATEGORY_AO=_$_2b4c[14];const CATEGORY_QUAN=_$_2b4c[15];const CATEGORY_SET_DAM=_$_2b4c[16];const CATEGORY_PKGD=_$_2b4c[17];const tbody=document[_$_2b4c[19]](_$_2b4c[18]);const idParam=getURLParameter(_$_2b4c[20]);function formatDate(_0xC7BD){if(!_0xC7BD){return _$_2b4c[21]};const _0xC80E=String(_0xC7BD[_$_2b4c[24]]())[_$_2b4c[23]](2,_$_2b4c[22]);const _0xC85F=String(_0xC7BD[_$_2b4c[25]]()+ 1)[_$_2b4c[23]](2,_$_2b4c[22]);const _0xC8B0=_0xC7BD[_$_2b4c[26]]();return (""+_0xC80E+_$_2b4c[27]+_0xC85F+_$_2b4c[27]+_0xC8B0+_$_2b4c[21])}const filterCategoryDropdown=document[_$_2b4c[29]](_$_2b4c[28]);filterCategoryDropdown[_$_2b4c[31]](_$_2b4c[30],applyCategoryFilter);function applyCategoryFilter(){const _0xC679=filterCategoryDropdown[_$_2b4c[32]];const _0xC628=tbody[_$_2b4c[34]](_$_2b4c[33]);_0xC628[_$_2b4c[40]]((_0xC3F1)=>{const _0xC6CA=_0xC3F1[_$_2b4c[19]](_$_2b4c[35]);if(_0xC679=== ALL_CATEGORIES|| _0xC6CA[_$_2b4c[36]]=== _0xC679){_0xC3F1[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21]}else {_0xC3F1[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39]}})}function toggleRowVisibility(_0xC3F1,_0xC9F4){if(idParam=== _$_2b4c[41]){const _0xCA45=_0xC3F1[_$_2b4c[34]](_$_2b4c[42]);collectionRef[_$_2b4c[53]](_$_2b4c[11])[_$_2b4c[54]]()[_$_2b4c[51]]((_0xBE90)=>{if(_0xBE90[_$_2b4c[44]]){const _0xC25C=_0xBE90[_$_2b4c[46]]()[_$_2b4c[46]][_$_2b4c[45]]();const _0xCA96=_0xCA45[0][_$_2b4c[36]]- 1;if(_0xCA45[0][_$_2b4c[38]][_$_2b4c[37]]!== _$_2b4c[39]){_0xCA45[_$_2b4c[40]]((_0xCAE7)=>{return _0xCAE7[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39]});_0xC9F4[_$_2b4c[47]]= _$_2b4c[48];_0xC25C[_0xCA96][_$_2b4c[49]]= false}else {_0xCA45[_$_2b4c[40]]((_0xCAE7)=>{return _0xCAE7[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21]});_0xC9F4[_$_2b4c[47]]= _$_2b4c[50];updateRowIndexes();_0xC25C[_0xCA96][_$_2b4c[49]]= true};collectionRef[_$_2b4c[53]](_$_2b4c[11])[_$_2b4c[52]]({data})[_$_2b4c[51]](function(){})[_$_2b4c[43]](function(_0xBCFB){})}})[_$_2b4c[43]]((_0xBCFB)=>{})}else {alert(_$_2b4c[55])}}function updateRowIndexes(){let _0xCB38=Array[_$_2b4c[57]](tbody[_$_2b4c[34]](_$_2b4c[56]));_0xCB38[_$_2b4c[40]]((_0xC3F1,_0xCB89)=>{_0xC3F1[_$_2b4c[19]](_$_2b4c[58])[_$_2b4c[36]]= _0xCB89+ 1})}const dataForm=document[_$_2b4c[29]](_$_2b4c[59]);dataForm[_$_2b4c[31]](_$_2b4c[60],function(_0xB980){_0xB980[_$_2b4c[61]]();const _0xBBB7=document[_$_2b4c[29]](_$_2b4c[62])[_$_2b4c[32]];const hinhAnhInput=document[_$_2b4c[29]](_$_2b4c[63]);const _0xBC08=document[_$_2b4c[29]](_$_2b4c[64])[_$_2b4c[32]];const _0xBAC4=document[_$_2b4c[29]](_$_2b4c[65]);const _0xBA22=hinhAnhInput[_$_2b4c[32]];if(!_0xBBB7||  !_0xBC08 ||  !_0xBAC4[_$_2b4c[67]][_$_2b4c[66]]){alert(_$_2b4c[68]);return};if(!hinhAnhInput[_$_2b4c[32]]){alert(_$_2b4c[69]);return};if(!_0xBA22[_$_2b4c[71]](_$_2b4c[70])){alert(_$_2b4c[72]);return};const _0xBA73=_0xBAC4[_$_2b4c[67]][0][_$_2b4c[73]];const _0xBB66=_0xBA22;const _0xB9D1=_0xBAC4[_$_2b4c[67]][0];var _0xBB15=storageRef[_$_2b4c[75]](_$_2b4c[74]+ _0xB9D1[_$_2b4c[73]]);var _0xBC59=_0xBB15[_$_2b4c[76]](_0xB9D1);_0xBC59[_$_2b4c[95]](_$_2b4c[77],(_0xBCAA)=>{},(_0xBCFB)=>{console[_$_2b4c[78]](_0xBCFB)},()=>{console[_$_2b4c[80]](_$_2b4c[79]);_0xBC59[_$_2b4c[94]][_$_2b4c[9]][_$_2b4c[93]]()[_$_2b4c[51]]((_0xBD9D)=>{console[_$_2b4c[80]](_$_2b4c[81],_0xBD9D);var _0xBE3F= new Date();var _0xBDEE=_0xBE3F[_$_2b4c[85]](_$_2b4c[82],{year:_$_2b4c[83],month:_$_2b4c[84],day:_$_2b4c[84],hour:_$_2b4c[84],minute:_$_2b4c[84]});var _0xBD4C={cellShow:true,phanLoai:_0xBBB7,tenSanPham:_0xBC08,thoiGianUpload:_0xBDEE,sp:_0xBB66,kh:_0xBD9D};collectionRef[_$_2b4c[53]](_$_2b4c[11])[_$_2b4c[54]]()[_$_2b4c[51]]((_0xBE90)=>{if(_0xBE90[_$_2b4c[44]]){collectionRef[_$_2b4c[53]](_$_2b4c[11])[_$_2b4c[52]]({[_$_2b4c[46]]:firebase[_$_2b4c[8]][_$_2b4c[91]][_$_2b4c[90]](_0xBD4C)})[_$_2b4c[51]](function(){console[_$_2b4c[80]](_$_2b4c[88]);location[_$_2b4c[89]]()})[_$_2b4c[43]](function(_0xBCFB){console[_$_2b4c[78]](_$_2b4c[87],_0xBCFB)})}else {collectionRef[_$_2b4c[53]](_$_2b4c[11])[_$_2b4c[92]]({[_$_2b4c[46]]:firebase[_$_2b4c[8]][_$_2b4c[91]][_$_2b4c[90]](_0xBD4C)})[_$_2b4c[51]](function(){console[_$_2b4c[80]](_$_2b4c[88]);location[_$_2b4c[89]]()})[_$_2b4c[43]](function(_0xBCFB){console[_$_2b4c[78]](_$_2b4c[87],_0xBCFB)})}})[_$_2b4c[43]](function(_0xBCFB){console[_$_2b4c[78]](_$_2b4c[86],_0xBCFB)})})});document[_$_2b4c[29]](_$_2b4c[62])[_$_2b4c[32]]= _$_2b4c[21];document[_$_2b4c[29]](_$_2b4c[63])[_$_2b4c[32]]= _$_2b4c[21];document[_$_2b4c[29]](_$_2b4c[64])[_$_2b4c[32]]= _$_2b4c[21];document[_$_2b4c[29]](_$_2b4c[65])[_$_2b4c[32]]= _$_2b4c[21]});const clearDataButton=document[_$_2b4c[29]](_$_2b4c[96]);clearDataButton[_$_2b4c[31]](_$_2b4c[97],clearFormData);function clearFormData(){document[_$_2b4c[29]](_$_2b4c[62])[_$_2b4c[32]]= _$_2b4c[21];document[_$_2b4c[29]](_$_2b4c[63])[_$_2b4c[32]]= _$_2b4c[21];document[_$_2b4c[29]](_$_2b4c[64])[_$_2b4c[32]]= _$_2b4c[21];document[_$_2b4c[29]](_$_2b4c[65])[_$_2b4c[32]]= _$_2b4c[21]}const hinhAnhInput=document[_$_2b4c[29]](_$_2b4c[63]);hinhAnhInput[_$_2b4c[31]](_$_2b4c[30],function(){const _0xBF32=document[_$_2b4c[29]](_$_2b4c[64]);const _0xBEE1=document[_$_2b4c[19]](_$_2b4c[98]);if(hinhAnhInput[_$_2b4c[32]]){const _0xBFD4=hinhAnhInput[_$_2b4c[32]][_$_2b4c[100]](_$_2b4c[27])[_$_2b4c[99]]();const _0xBF83=_0xBFD4[_$_2b4c[100]](_$_2b4c[101])[_$_2b4c[45]](0,-1)[_$_2b4c[102]](_$_2b4c[101]);_0xBF32[_$_2b4c[32]]= _0xBF83}else {_0xBF32[_$_2b4c[32]]= _$_2b4c[21];_0xBEE1[_$_2b4c[103]]= _$_2b4c[21]}});document[_$_2b4c[31]](_$_2b4c[104],function(){const _0xC025=document[_$_2b4c[29]](_$_2b4c[105]);const dataForm=document[_$_2b4c[29]](_$_2b4c[59]);_0xC025[_$_2b4c[31]](_$_2b4c[97],function(){if(dataForm[_$_2b4c[38]][_$_2b4c[37]]=== _$_2b4c[39]|| dataForm[_$_2b4c[38]][_$_2b4c[37]]=== _$_2b4c[21]){dataForm[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[106];_0xC025[_$_2b4c[36]]= _$_2b4c[107]}else {dataForm[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39];_0xC025[_$_2b4c[36]]= _$_2b4c[108]}})});clearDataButton[_$_2b4c[31]](_$_2b4c[97],function(){const _0xC169=document[_$_2b4c[29]](_$_2b4c[109]);_0xC169[_$_2b4c[110]]();const _0xC0C7=document[_$_2b4c[29]](_$_2b4c[111]);const _0xC1BA= new Date();const _0xC20B=_0xC1BA[_$_2b4c[26]]();const _0xC118=String(_0xC1BA[_$_2b4c[25]]()+ 1)[_$_2b4c[23]](2,_$_2b4c[22]);const _0xC076=String(_0xC1BA[_$_2b4c[24]]())[_$_2b4c[23]](2,_$_2b4c[22]);_0xC0C7[_$_2b4c[32]]= (""+_0xC20B+_$_2b4c[112]+_0xC118+_$_2b4c[112]+_0xC076+_$_2b4c[21])});function clearImageContainer(_0xC71B){var _0xC76C=document[_$_2b4c[19]](_$_2b4c[101]+ _0xC71B+ _$_2b4c[113]);while(_0xC76C[_$_2b4c[114]]){_0xC76C[_$_2b4c[115]](_0xC76C[_$_2b4c[114]])}}function addImagesFromStorage(){collectionRef[_$_2b4c[53]](_$_2b4c[11])[_$_2b4c[54]]()[_$_2b4c[51]]((_0xBE90)=>{if(_0xBE90[_$_2b4c[44]]){const _0xC25C=_0xBE90[_$_2b4c[46]]();tbody[_$_2b4c[117]]= _$_2b4c[21];let _0xC442=0;for(let _0xC34F=0;_0xC34F< _0xC25C[_$_2b4c[46]][_$_2b4c[66]];_0xC34F++){const _0xC3F1=tbody[_$_2b4c[118]]();const _0xC586=_0xC3F1[_$_2b4c[119]]();const _0xC4E4=_0xC3F1[_$_2b4c[119]]();const _0xC3A0=_0xC3F1[_$_2b4c[119]]();const _0xC2FE=_0xC3F1[_$_2b4c[119]]();const _0xC493=_0xC3F1[_$_2b4c[119]]();const _0xC535=_0xC3F1[_$_2b4c[119]]();const _0xC5D7=_0xC3F1[_$_2b4c[119]]();if(_0xC25C[_$_2b4c[46]][_0xC34F]){_0xC442++;_0xC586[_$_2b4c[36]]= _0xC442;_0xC4E4[_$_2b4c[36]]= _0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[120]];_0xC3A0[_$_2b4c[36]]= _0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[62]];_0xC2FE[_$_2b4c[117]]= ("<img src=\""+_0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[121]]+_$_2b4c[122]+_0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[64]]+_$_2b4c[123]);_0xC493[_$_2b4c[36]]= _0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[64]];_0xC535[_$_2b4c[117]]= ("\x0D\x0A\x09\x09\x09\x09\x09\x09\x09\x09\x09\x09<div class=\"customer-image-cell\">\x0D\x0A\x09\x09\x09\x09\x09\x09\x09\x09\x09\x09\x09<img src=\""+_0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[124]]+_$_2b4c[125]);const _0xC2AD=document[_$_2b4c[127]](_$_2b4c[126]);_0xC2AD[_$_2b4c[128]]= _$_2b4c[129];_0xC2AD[_$_2b4c[130]]= ()=>{return toggleRowVisibility(_0xC3F1,_0xC2AD)};_0xC5D7[_$_2b4c[131]](_0xC2AD);if(_0xC25C[_$_2b4c[46]][_0xC34F][_$_2b4c[49]]== false){_0xC2AD[_$_2b4c[47]]= _$_2b4c[48];_0xC586[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39];_0xC4E4[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39];_0xC3A0[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39];_0xC2FE[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39];_0xC493[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39];_0xC535[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[39]}else {_0xC2AD[_$_2b4c[47]]= _$_2b4c[50];_0xC586[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21];_0xC4E4[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21];_0xC3A0[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21];_0xC2FE[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21];_0xC493[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21];_0xC535[_$_2b4c[38]][_$_2b4c[37]]= _$_2b4c[21]}}else {_0xC586[_$_2b4c[36]]= _$_2b4c[21];_0xC4E4[_$_2b4c[36]]= _$_2b4c[21];_0xC3A0[_$_2b4c[36]]= _$_2b4c[21];_0xC2FE[_$_2b4c[117]]= _$_2b4c[21];_0xC493[_$_2b4c[36]]= _$_2b4c[21];_0xC535[_$_2b4c[117]]= _$_2b4c[21]}}}else {console[_$_2b4c[80]](_$_2b4c[132])}})[_$_2b4c[43]]((_0xBCFB)=>{console[_$_2b4c[78]](_$_2b4c[116],_0xBCFB)})}function getURLParameter(_0xC901){_0xC901= _0xC901[_$_2b4c[134]](/[\[]/,_$_2b4c[135])[_$_2b4c[134]](/[\]]/,_$_2b4c[133]);var _0xC952= new RegExp(_$_2b4c[136]+ _0xC901+ _$_2b4c[137]);var _0xC9A3=_0xC952[_$_2b4c[139]](location[_$_2b4c[138]]);return _0xC9A3=== null?_$_2b4c[21]:decodeURIComponent(_0xC9A3[1][_$_2b4c[134]](/\+/g,_$_2b4c[140]))}function displayAll(){addImagesFromStorage()}displayAll()