/* NOVA FX — debug.js: mostra na tela qualquer erro que deixaria o canvas preto.
   Incluir como <script src="debug.js"></script> ANTES dos módulos. */
(function () {
  function show(msg) {
    let d = document.getElementById("nfx-err");
    if (!d) {
      d = document.createElement("div");
      d.id = "nfx-err";
      d.style.cssText =
        "position:fixed;bottom:10px;left:10px;right:10px;z-index:9999;background:#c0392b;color:#fff;font:12px/1.5 monospace;padding:12px;border-radius:8px;white-space:pre-wrap;max-height:40vh;overflow:auto";
      (document.body || document.documentElement).appendChild(d);
    }
    d.textContent += msg + "\n";
  }

  addEventListener("error", (e) =>
    show("ERRO: " + e.message + (e.filename ? " @ " + e.filename.split("/").pop() + ":" + e.lineno : ""))
  );
  addEventListener("unhandledrejection", (e) =>
    show("PROMISE: " + (e.reason && e.reason.message ? e.reason.message : e.reason))
  );

  // falha de carregamento de <script type=module> não chega no window.onerror
  addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("script").forEach((s) =>
      s.addEventListener("error", () => show("FALHA AO CARREGAR SCRIPT: " + (s.src || "(inline)")))
    );

    // preflight WebGL2 — causa nº1 de canvas preto
    const test = document.createElement("canvas");
    const gl = test.getContext("webgl2");
    if (!gl) {
      show(
        "WebGL2 INDISPONÍVEL neste navegador.\n" +
        "Chrome → Configurações → Sistema → ativar 'Usar aceleração de hardware' e reiniciar o Chrome.\n" +
        "Ou teste em chrome://gpu"
      );
    } else {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : "?";
      if (/swiftshader|software/i.test(String(renderer)))
        show("AVISO: WebGL rodando em SOFTWARE (" + renderer + ") — vai ficar lento. Ative aceleração de hardware no Chrome.");
    }
  });
})();
