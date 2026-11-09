import { createServer } from "node:http";

const sections = [
  {
    id: "definition",
    title: "What is a canvas?",
    body: "A canvas is an interactive view that an extension provides to Copilot. It can show live information, collect input, and expose actions an agent can call.",
  },
  {
    id: "how-it-works",
    title: "How does it work?",
    body: "The extension starts a small local web server when the canvas opens. Copilot embeds the returned URL, while actions connect the agent and the view to the same extension.",
  },
  {
    id: "when-to-use",
    title: "When should I use one?",
    body: "Use a canvas when a chat response is not enough: dashboards, review queues, forms, timelines, diagrams, and other tasks benefit from a focused interactive surface.",
  },
];

const instances = new Map();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function pageHtml(activeSectionId) {
  const activeSection = sections.find((section) => section.id === activeSectionId) ?? sections[0];
  const navigation = sections
    .map(
      (section) =>
        `<button type="button" class="section-button${section.id === activeSection.id ? " active" : ""}" data-section="${escapeHtml(section.id)}">${escapeHtml(section.title)}</button>`,
    )
    .join("");

  const sectionData = JSON.stringify(sections).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>What is a canvas?</title>
    <style>
      :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
      body { margin: 0; background: #f6f8fa; color: #1f2328; }
      main { max-width: 720px; margin: 0 auto; padding: 28px 20px 36px; }
      .eyebrow { color: #0969da; font-size: .78rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
      h1 { margin: 8px 0 10px; font-size: clamp(1.8rem, 6vw, 2.8rem); }
      .intro { color: #59636e; line-height: 1.6; margin-bottom: 24px; }
      .layout { display: grid; gap: 16px; }
      nav { display: flex; flex-wrap: wrap; gap: 8px; }
      button { font: inherit; }
      .section-button { border: 1px solid #d0d7de; border-radius: 999px; background: white; color: #1f2328; cursor: pointer; padding: 9px 13px; }
      .section-button:hover, .section-button:focus-visible { border-color: #0969da; outline: 3px solid #54aeff66; outline-offset: 1px; }
      .section-button.active { background: #0969da; border-color: #0969da; color: white; }
      article { background: white; border: 1px solid #d0d7de; border-radius: 14px; padding: 20px; box-shadow: 0 2px 6px #1f23280d; }
      article h2 { margin-top: 0; }
      article p { color: #59636e; line-height: 1.7; margin-bottom: 0; }
      #status { min-height: 1.4em; color: #1a7f37; font-size: .9rem; }
      @media (prefers-color-scheme: dark) {
        body { background: #0d1117; color: #e6edf3; }
        .intro, article p { color: #8b949e; }
        .section-button, article { background: #161b22; border-color: #30363d; color: #e6edf3; }
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">Copilot extension</div>
      <h1>What is a canvas?</h1>
      <p class="intro">A canvas gives Copilot a dedicated, interactive surface for work that is easier to understand or complete visually.</p>
      <div class="layout">
        <nav aria-label="Canvas explanation sections">${navigation}</nav>
        <article aria-live="polite">
          <h2 id="section-title">${escapeHtml(activeSection.title)}</h2>
          <p id="section-body">${escapeHtml(activeSection.body)}</p>
        </article>
        <div id="status" role="status"></div>
      </div>
    </main>
    <script>
      const sections = ${sectionData};
      const title = document.querySelector("#section-title");
      const body = document.querySelector("#section-body");
      const status = document.querySelector("#status");
      for (const button of document.querySelectorAll("[data-section]")) {
        button.addEventListener("click", () => {
          const section = sections.find((item) => item.id === button.dataset.section);
          if (!section) return;
          title.textContent = section.title;
          body.textContent = section.body;
          for (const item of document.querySelectorAll("[data-section]")) item.classList.toggle("active", item === button);
          status.textContent = "Showing " + section.title;
        });
      }
    </script>
  </body>
</html>`;
}

export function openExplainer(instanceId, session) {
  const existing = instances.get(instanceId);
  if (existing) return existing.url;

  const server = createServer((request, response) => {
    if (request.url !== "/") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(pageHtml("definition"));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Canvas server did not provide an ephemeral port"));
        return;
      }
      const url = `http://127.0.0.1:${address.port}/`;
      instances.set(instanceId, { server, url });
      session.log(`Canvas explainer opened at ${url}`);
      resolve(url);
    });
  });
}

export function closeExplainer(instanceId) {
  const instance = instances.get(instanceId);
  if (!instance) return;
  instances.delete(instanceId);
  instance.server.close();
}

export function selectSection(input, session) {
  const section = sections.find((item) => item.id === input?.sectionId);
  if (!section) throw new Error(`Unknown section: ${input?.sectionId}`);
  session.log(`Canvas explainer selected section: ${section.id}`);
  return { sectionId: section.id, title: section.title, body: section.body };
}
