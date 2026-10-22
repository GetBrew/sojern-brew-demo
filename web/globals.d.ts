import type {
  CanvasSavedEvent,
  CanvasSelectedEmail,
  EmailCanvasController,
} from "@brew.new/sdk/embed";
import type { GetEmailResponse } from "@brew.new/sdk";
declare global {
  const __BREW_AGENT_PROMPTS__: {
    number: string;
    title: string;
    text: string;
  }[];
  const __BREW_AGENT_BRIEF__: string;
  interface Window {
    demoCanvas?: EmailCanvasController | null;
    demoReady?: boolean;
    demoSaved?: CanvasSavedEvent | null;
    demoSelection?: CanvasSelectedEmail | null;
    demoHtml?: GetEmailResponse | null;
  }
}
