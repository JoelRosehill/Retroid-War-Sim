/**
 * Map Studio — the copy-out / paste-back workflow.
 *
 * Press M. Copy the prompt, paste it into whatever model you like, paste the
 * json back, load it. No API key, no network call, no provider lock-in.
 *
 * Built from DOM rather than Pixi on purpose: this needs a real textarea,
 * clipboard access, text selection and file drops, all of which the browser
 * gives for free and a canvas UI would have to reimplement badly.
 */
import { buildMapPrompt } from '../map/MapPrompt';
import { parsePlanText } from '../map/PlanValidator';
import { clearStoredPlan, hasStoredPlan, saveStoredPlan } from '../map/PlanSource';

const CSS = `
.ms-root {
  position: fixed; inset: 0; z-index: 50; display: none;
  background: rgba(5, 7, 10, 0.86); backdrop-filter: blur(2px);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  color: #9fb4c7;
}
.ms-root.open { display: grid; place-items: center; }
.ms-panel {
  width: min(1100px, 94vw); max-height: 92vh; overflow: auto;
  background: #0d1218; border: 1px solid #2c3a48; padding: 22px 24px 20px;
  box-shadow: 0 18px 60px rgba(0,0,0,.6);
}
.ms-panel h2 {
  font-size: 15px; letter-spacing: 4px; color: #e8c46a;
  text-transform: uppercase; margin-bottom: 4px;
}
.ms-sub { font-size: 11px; color: #54687a; margin-bottom: 18px; line-height: 1.6; }
.ms-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
@media (max-width: 860px) { .ms-grid { grid-template-columns: 1fr; } }
.ms-col h3 {
  font-size: 11px; letter-spacing: 2px; color: #7f97ab;
  text-transform: uppercase; margin-bottom: 8px;
}
.ms-col textarea {
  width: 100%; height: 260px; resize: vertical;
  background: #070a0e; color: #9fb4c7; border: 1px solid #23303c;
  padding: 10px; font: 11px/1.5 ui-monospace, Menlo, Consolas, monospace;
  outline: none;
}
.ms-col textarea:focus { border-color: #3d5062; }
.ms-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.ms-btn {
  background: #16202a; color: #cfe0ee; border: 1px solid #2c3a48;
  padding: 8px 14px; font: 11px ui-monospace, Menlo, monospace;
  letter-spacing: 1.5px; text-transform: uppercase; cursor: pointer;
}
.ms-btn:hover { background: #1e2b38; border-color: #3d5062; }
.ms-btn.primary { background: #2a4260; border-color: #3f6ea8; color: #dbeaf8; }
.ms-btn.primary:hover { background: #34527a; }
.ms-btn:disabled { opacity: .4; cursor: default; }
.ms-brief {
  width: 100%; background: #070a0e; color: #cfe0ee; border: 1px solid #23303c;
  padding: 9px 10px; font: 12px ui-monospace, Menlo, monospace; outline: none;
  margin-bottom: 12px;
}
.ms-status { margin-top: 12px; font-size: 11px; line-height: 1.7; min-height: 18px; }
.ms-ok { color: #7fc98a; }
.ms-warn { color: #e0b040; }
.ms-err { color: #e0705c; }
.ms-foot {
  margin-top: 18px; padding-top: 14px; border-top: 1px solid #1d2833;
  display: flex; justify-content: space-between; align-items: center;
  font-size: 10px; color: #45566604; flex-wrap: wrap; gap: 10px;
}
.ms-hint { color: #455666; font-size: 10px; }
.ms-drop { border-color: #e8c46a !important; }
`;

export class MapStudio {
  private readonly root: HTMLDivElement;
  private readonly briefInput: HTMLInputElement;
  private readonly promptArea: HTMLTextAreaElement;
  private readonly planArea: HTMLTextAreaElement;
  private readonly status: HTMLDivElement;
  private open = false;

  /** Called when the overlay opens or closes, so the sim can pause. */
  onVisibilityChange: ((open: boolean) => void) | null = null;

  constructor(initialBrief: string) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.root = document.createElement('div');
    this.root.className = 'ms-root';
    this.root.innerHTML = `
      <div class="ms-panel">
        <h2>Map Studio</h2>
        <div class="ms-sub">
          Describe the battlefield, copy the prompt, paste it into any AI
          (DeepSeek, ChatGPT, Claude, a local model — it doesn't matter), then
          paste the json it returns back here. No API key required.
        </div>

        <input class="ms-brief" id="ms-brief" placeholder="Describe the battlefield…" />

        <div class="ms-grid">
          <div class="ms-col">
            <h3>1 — Copy this prompt</h3>
            <textarea id="ms-prompt" readonly spellcheck="false"></textarea>
            <div class="ms-row">
              <button class="ms-btn primary" id="ms-copy">Copy prompt</button>
              <button class="ms-btn" id="ms-download">Save as .txt</button>
            </div>
          </div>

          <div class="ms-col">
            <h3>2 — Paste the json back</h3>
            <textarea id="ms-plan" spellcheck="false"
              placeholder="Paste the model's json here, or drop a .json file anywhere on this panel."></textarea>
            <div class="ms-row">
              <button class="ms-btn primary" id="ms-load">Load map &amp; restart</button>
              <button class="ms-btn" id="ms-check">Check only</button>
              <button class="ms-btn" id="ms-reset">Use procedural</button>
            </div>
          </div>
        </div>

        <div class="ms-status" id="ms-status"></div>

        <div class="ms-foot">
          <span class="ms-hint">Loading a map reloads the page so the terrain can be rebuilt and re-baked.</span>
          <button class="ms-btn" id="ms-close">Close (M)</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    this.briefInput = this.root.querySelector('#ms-brief') as HTMLInputElement;
    this.promptArea = this.root.querySelector('#ms-prompt') as HTMLTextAreaElement;
    this.planArea = this.root.querySelector('#ms-plan') as HTMLTextAreaElement;
    this.status = this.root.querySelector('#ms-status') as HTMLDivElement;

    this.briefInput.value = initialBrief;
    this.refreshPrompt();

    this.briefInput.addEventListener('input', () => this.refreshPrompt());
    this.root.querySelector('#ms-copy')!.addEventListener('click', () => void this.copyPrompt());
    this.root.querySelector('#ms-download')!.addEventListener('click', () => this.downloadPrompt());
    this.root.querySelector('#ms-load')!.addEventListener('click', () => this.loadPlan(true));
    this.root.querySelector('#ms-check')!.addEventListener('click', () => this.loadPlan(false));
    this.root.querySelector('#ms-reset')!.addEventListener('click', () => this.useProcedural());
    this.root.querySelector('#ms-close')!.addEventListener('click', () => this.hide());

    // Click the backdrop to dismiss.
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) this.hide();
    });

    this.wireFileDrop();

    if (hasStoredPlan()) {
      this.setStatus([{ kind: 'ok', text: 'A saved map is currently in use. "Use procedural" clears it.' }]);
    }
  }

  private refreshPrompt(): void {
    this.promptArea.value = buildMapPrompt({ brief: this.briefInput.value });
  }

  private async copyPrompt(): Promise<void> {
    const text = this.promptArea.value;
    try {
      await navigator.clipboard.writeText(text);
      this.setStatus([{ kind: 'ok', text: 'Prompt copied. Paste it into your model of choice.' }]);
    } catch {
      // Clipboard API needs a secure context; fall back to selection.
      this.promptArea.select();
      const copied = document.execCommand?.('copy');
      this.setStatus([copied
        ? { kind: 'ok', text: 'Prompt copied.' }
        : { kind: 'warn', text: 'Could not reach the clipboard — the prompt is selected, press Ctrl/Cmd+C.' }]);
    }
  }

  private downloadPrompt(): void {
    const blob = new Blob([this.promptArea.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'retroid-map-prompt.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  /** Validate the pasted json; optionally save it and restart. */
  private loadPlan(commit: boolean): void {
    const { plan, warnings, errors } = parsePlanText(this.planArea.value);

    if (!plan) {
      this.setStatus([
        ...errors.map((text) => ({ kind: 'err' as const, text })),
        { kind: 'warn', text: 'Fix the json and try again, or paste the errors back to the model and ask it to correct them.' },
      ]);
      return;
    }

    const lines = [
      { kind: 'ok' as const, text: `"${plan.name}" — ${plan.coarse.width}x${plan.coarse.height} matrix, ${plan.ridges.length} ridge(s), ${plan.rivers.length} river(s).` },
      ...warnings.map((text) => ({ kind: 'warn' as const, text: `repaired: ${text}` })),
    ];

    if (!commit) {
      lines.push({ kind: 'ok', text: 'Valid. Press "Load map & restart" to play it.' });
      this.setStatus(lines);
      return;
    }

    saveStoredPlan(plan);
    lines.push({ kind: 'ok', text: 'Saved. Reloading…' });
    this.setStatus(lines);
    setTimeout(() => window.location.reload(), 450);
  }

  private useProcedural(): void {
    clearStoredPlan();
    this.setStatus([{ kind: 'ok', text: 'Cleared the saved map. Reloading…' }]);
    setTimeout(() => window.location.reload(), 400);
  }

  private wireFileDrop(): void {
    const panel = this.root.querySelector('.ms-panel') as HTMLElement;

    panel.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.planArea.classList.add('ms-drop');
    });
    panel.addEventListener('dragleave', () => this.planArea.classList.remove('ms-drop'));
    panel.addEventListener('drop', (e) => {
      e.preventDefault();
      this.planArea.classList.remove('ms-drop');
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      void file.text().then((text) => {
        this.planArea.value = text;
        this.loadPlan(false);
      });
    });
  }

  private setStatus(lines: { kind: 'ok' | 'warn' | 'err'; text: string }[]): void {
    this.status.innerHTML = lines
      .map((l) => `<div class="ms-${l.kind}">${escapeHtml(l.text)}</div>`)
      .join('');
  }

  show(): void {
    this.open = true;
    this.root.classList.add('open');
    this.onVisibilityChange?.(true);
  }

  hide(): void {
    this.open = false;
    this.root.classList.remove('open');
    this.onVisibilityChange?.(false);
  }

  toggle(): void {
    if (this.open) this.hide(); else this.show();
  }

  get isOpen(): boolean { return this.open; }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
