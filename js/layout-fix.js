"use strict";

(function () {
  function fitIdeLayout() {
    var app = document.querySelector(".app");
    var topbar = document.querySelector(".topbar");
    var toolbar = document.querySelector(".toolbar");
    var main = document.querySelector(".main");
    var side = document.querySelector(".side");
    var sideHead = document.querySelector(".side-head");
    var results = document.querySelector(".results");
    var left = document.querySelector(".left");
    var editorWrap = document.querySelector(".editor-wrap");

    if (!app || !topbar || !toolbar || !main || !side || !sideHead || !results) return;

    var viewportH = window.innerHeight || document.documentElement.clientHeight;
    var usedTop = topbar.offsetHeight + toolbar.offsetHeight;
    var mainH = Math.max(260, viewportH - usedTop);
    var resultsH = Math.max(160, mainH - sideHead.offsetHeight);

    app.style.height = viewportH + "px";
    app.style.maxHeight = viewportH + "px";
    main.style.height = mainH + "px";
    main.style.maxHeight = mainH + "px";
    side.style.height = mainH + "px";
    side.style.maxHeight = mainH + "px";
    results.style.height = resultsH + "px";
    results.style.maxHeight = resultsH + "px";
    results.style.overflowY = "scroll";
    results.style.overflowX = "hidden";

    if (left && editorWrap) {
      left.style.height = mainH + "px";
      left.style.maxHeight = mainH + "px";
      var tabs = document.querySelector(".tabs");
      var editorH = Math.max(220, mainH - (tabs ? tabs.offsetHeight : 0));
      editorWrap.style.height = editorH + "px";
      editorWrap.style.maxHeight = editorH + "px";
    }

    if (window.editor && typeof window.editor.layout === "function") {
      window.editor.layout();
    }
  }

  window.fitIdeLayout = fitIdeLayout;
  window.addEventListener("resize", fitIdeLayout);
  window.addEventListener("load", function () {
    fitIdeLayout();
    setTimeout(fitIdeLayout, 300);
    setTimeout(fitIdeLayout, 1000);
  });
  document.addEventListener("DOMContentLoaded", function () {
    fitIdeLayout();
    setTimeout(fitIdeLayout, 300);
    setTimeout(fitIdeLayout, 1000);
  });
  document.addEventListener("click", function () {
    setTimeout(fitIdeLayout, 50);
  });
})();
