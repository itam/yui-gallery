if (typeof __coverage__ === 'undefined') { __coverage__ = {}; }
if (!__coverage__['build/gallery-sm-editor/gallery-sm-editor.js']) {
   __coverage__['build/gallery-sm-editor/gallery-sm-editor.js'] = {"path":"build/gallery-sm-editor/gallery-sm-editor.js","s":{"1":0,"2":0},"b":{},"f":{"1":0},"fnMap":{"1":{"name":"(anonymous_1)","line":1,"loc":{"start":{"line":1,"column":29},"end":{"line":1,"column":48}}}},"statementMap":{"1":{"start":{"line":1,"column":0},"end":{"line":54,"column":3}},"2":{"start":{"line":26,"column":0},"end":{"line":38,"column":2}}},"branchMap":{},"code":["(function () { YUI.add('gallery-sm-editor', function (Y, NAME) {","","/*jshint expr:true, onevar:false */","","/**","Provides `Y.Editor`, a simple but powerful WYSIWYG editor.","","@module gallery-sm-editor","@main gallery-sm-editor","**/","","/**","A simple but powerful WYSIWYG editor.","","@class Editor","@constructor","@extends Editor.Base","@uses Editor.Delete","@uses Editor.Keys","@uses Editor.Link","@uses Editor.Queue","@uses Editor.Block","@uses Editor.Style","@uses Editor.Format","**/","Y.Editor = Y.mix(","    Y.Base.create('editor', Y.Editor.Base, [","        Y.Editor.Delete,","        Y.Editor.Keys,","        Y.Editor.Link,","        Y.Editor.Queue,","        Y.Editor.Block,","        Y.Editor.Style,","        Y.Editor.Format","//        Y.Editor.Undo","    ], {}),","    Y.Editor",");","","","}, '@VERSION@', {","    \"use\": [","        \"gallery-sm-editor-base\",","        \"gallery-sm-editor-block\",","        \"gallery-sm-editor-delete\",","        \"gallery-sm-editor-format\",","        \"gallery-sm-editor-keys\",","        \"gallery-sm-editor-link\",","        \"gallery-sm-editor-queue\",","        \"gallery-sm-editor-style\",","        \"gallery-sm-editor-undo\"","    ],","    \"skinnable\": true","});","","}());"]};
}
var __cov_6$k7CRdpNHlFXT$AnznS2g = __coverage__['build/gallery-sm-editor/gallery-sm-editor.js'];
__cov_6$k7CRdpNHlFXT$AnznS2g.s['1']++;YUI.add('gallery-sm-editor',function(Y,NAME){__cov_6$k7CRdpNHlFXT$AnznS2g.f['1']++;__cov_6$k7CRdpNHlFXT$AnznS2g.s['2']++;Y.Editor=Y.mix(Y.Base.create('editor',Y.Editor.Base,[Y.Editor.Delete,Y.Editor.Keys,Y.Editor.Link,Y.Editor.Queue,Y.Editor.Block,Y.Editor.Style,Y.Editor.Format],{}),Y.Editor);},'@VERSION@',{'use':['gallery-sm-editor-base','gallery-sm-editor-block','gallery-sm-editor-delete','gallery-sm-editor-format','gallery-sm-editor-keys','gallery-sm-editor-link','gallery-sm-editor-queue','gallery-sm-editor-style','gallery-sm-editor-undo'],'skinnable':true});
