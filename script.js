document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("currentYear");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  const header = document.getElementById("siteHeader");

  const updateHeaderState = () => {
    if (!header) return;

    if (window.scrollY > 12) {
      header.classList.add("is-scrolled");
    } else {
      header.classList.remove("is-scrolled");
    }
  };

  updateHeaderState();
  window.addEventListener("scroll", updateHeaderState, { passive: true });

  const comingSoonLinks = document.querySelectorAll("[data-coming-soon='true']");
  comingSoonLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      window.alert("このページはまだ準備中です。少しずつ追加していきます。");
    });
  });

  console.log("site loaded");
});