// Mock-only: switch between the two accent options (?accent=green or the topbar toggle).
(function () {
  var root = document.documentElement;
  var q = new URLSearchParams(location.search).get("accent");
  var saved = null;
  try { saved = localStorage.getItem("fixer-accent"); } catch (e) {}
  function set(a) {
    if (a === "green") root.setAttribute("data-accent", "green"); else root.removeAttribute("data-accent");
    document.querySelectorAll("[data-accent-set]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-accent-set") === (a === "green" ? "green" : "red")));
    });
  }
  var current = q || saved || "red";
  set(current);
  document.addEventListener("DOMContentLoaded", function () {
    set(current);
    document.querySelectorAll("[data-accent-set]").forEach(function (b) {
      b.addEventListener("click", function () {
        current = b.getAttribute("data-accent-set");
        try { localStorage.setItem("fixer-accent", current); } catch (e) {}
        set(current);
      });
    });
  });
})();
