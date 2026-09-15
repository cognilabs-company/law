// Shared by the server layout (inline script) and lib/theme.ts. No "use client":
// a server component importing from a client module would get a reference,
// not the string.

export const THEME_KEY = "lexgo_theme";
export const DARK_MQ = "(prefers-color-scheme: dark)";

// Runs in <head> before the body renders, so a dark page never flashes white.
// Keep it dependency-free and in step with resolve() in lib/theme.ts.
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}");var d=p==="dark"||(p!=="light"&&window.matchMedia("${DARK_MQ}").matches);var r=document.documentElement;r.setAttribute("data-theme",d?"dark":"light");r.style.colorScheme=d?"dark":"light"}catch(e){}})();`;
