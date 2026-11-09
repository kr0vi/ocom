import { CanvasError, createCanvas, joinSession } from "@github/copilot-sdk/extension";
import { closeExplainer, openExplainer, selectSection } from "./canvas.mjs";

let extensionSession;

const canvas = createCanvas({
  id: "open-code-mobile-canvas-explainer",
  displayName: "Canvas explainer",
  description: "An interactive explanation of what a Copilot canvas is and when to use one.",
  actions: [
    {
      name: "select-section",
      description: "Return the selected explanation section.",
      inputSchema: {
        type: "object",
        properties: {
          sectionId: { type: "string", enum: ["definition", "how-it-works", "when-to-use"] },
        },
        required: ["sectionId"],
        additionalProperties: false,
      },
      handler: async ({ input }) => {
        try {
          return selectSection(input, extensionSession);
        } catch (error) {
          throw new CanvasError("invalid-section", error instanceof Error ? error.message : "Invalid section");
        }
      },
    },
  ],
  open: async ({ instanceId }) => ({
    title: "What is a canvas?",
    url: await openExplainer(instanceId, extensionSession),
  }),
  onClose: async ({ instanceId }) => {
    closeExplainer(instanceId);
  },
});

extensionSession = await joinSession({ canvases: [canvas] });
