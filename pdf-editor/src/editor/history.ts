export interface Step {
  label: string;
  undo(): void | Promise<void>;
  redo(): void | Promise<void>;
}

export class History {
  private steps: Step[] = [];
  private index = 0;
  /** while replaying we must not record new steps */
  replaying = false;
  onChange: () => void = () => {};

  push(step: Step) {
    if (this.replaying) return;
    this.steps.length = this.index;
    this.steps.push(step);
    if (this.steps.length > 150) this.steps.shift();
    this.index = this.steps.length;
    this.onChange();
  }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.steps.length; }
  async undo() {
    if (!this.canUndo) return;
    this.replaying = true;
    try { await this.steps[--this.index].undo(); } finally { this.replaying = false; }
    this.onChange();
  }
  async redo() {
    if (!this.canRedo) return;
    this.replaying = true;
    try { await this.steps[this.index++].redo(); } finally { this.replaying = false; }
    this.onChange();
  }
  clear() {
    this.steps = [];
    this.index = 0;
    this.onChange();
  }
}
