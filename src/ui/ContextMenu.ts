import { Body } from '../BodySystem.js';
import { Vec2 } from '../utils/math.js';
import { ROCKET_INITIAL_FUEL } from '../utils/constants.js';

export interface ContextMenuAction {
  label?: string;
  icon?: string;
  separator?: boolean;
  disabled?: boolean;
  action?: () => void;
}

export interface ContextMenuCallbacks {
  onAddBody:    (type: Body['type'], worldPos: Vec2) => void;
  onFocusBody:  (body: Body) => void;
  onDeleteBody: (id: string) => void;
  onPinBody:    (id: string, pinned: boolean) => void;
  screenToWorld: (sx: number, sy: number) => Vec2;
}

export class ContextMenu {
  private el: HTMLElement;
  private visible = false;
  private worldPos: Vec2 = [0, 0];

  constructor(private callbacks: ContextMenuCallbacks) {
    this.el = document.createElement('div');
    this.el.className = 'context-menu';
    this.el.style.display = 'none';
    document.body.appendChild(this.el);

    // Hide on any click outside
    document.addEventListener('click', (e) => {
      if (!this.el.contains(e.target as Node)) this.hide();
    });
    document.addEventListener('contextmenu', (e) => {
      if (!this.el.contains(e.target as Node)) this.hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hide();
    });
  }

  /** Show context menu for a right-click on empty canvas space. */
  showForCanvas(sx: number, sy: number): void {
    this.worldPos = this.callbacks.screenToWorld(sx, sy);
    const items: ContextMenuAction[] = [
      { label: 'Add here…', icon: '✦', disabled: true },
      { separator: true },
      ...(['star','planet','moon','asteroid','rocket'] as Body['type'][]).map(t => ({
        label: `Add ${t}`,
        icon: typeIcon(t),
        action: () => this.callbacks.onAddBody(t, this.worldPos),
      })),
    ];
    this._show(sx, sy, items);
  }

  /** Show context menu for a right-click on an existing body. */
  showForBody(sx: number, sy: number, body: Body): void {
    this.worldPos = [...body.position] as Vec2;
    const items: ContextMenuAction[] = [
      { label: body.name, icon: typeIcon(body.type), disabled: true },
      { separator: true },
      { label: 'Focus camera', icon: '🎯', action: () => this.callbacks.onFocusBody(body) },
      { label: body.pinned ? 'Unpin' : 'Pin (fix position)', icon: '📍',
        action: () => this.callbacks.onPinBody(body.id, !body.pinned) },
      { separator: true },
      { label: 'Delete body', icon: '🗑', action: () => this.callbacks.onDeleteBody(body.id) },
    ];
    this._show(sx, sy, items);
  }

  private _show(sx: number, sy: number, items: ContextMenuAction[]): void {
    this.el.innerHTML = '';
    for (const item of items) {
      if (item.separator) {
        const sep = document.createElement('div');
        sep.className = 'ctx-separator';
        this.el.appendChild(sep);
        continue;
      }
      const btn = document.createElement('button');
      btn.className = 'ctx-item' + (item.disabled ? ' ctx-disabled' : '');
      btn.innerHTML = `<span class="ctx-icon">${item.icon ?? ''}</span><span class="ctx-label">${item.label}</span>`;
      if (!item.disabled && item.action) {
        btn.addEventListener('click', () => {
          item.action!();
          this.hide();
        });
      }
      this.el.appendChild(btn);
    }

    // Position within viewport
    this.el.style.display = 'block';
    this.visible = true;
    const rect = this.el.getBoundingClientRect();
    const vw   = window.innerWidth, vh = window.innerHeight;
    const left = sx + rect.width  > vw ? sx - rect.width  : sx;
    const top  = sy + rect.height > vh ? sy - rect.height : sy;
    this.el.style.left = `${Math.max(0, left)}px`;
    this.el.style.top  = `${Math.max(0, top)}px`;
  }

  hide(): void {
    this.el.style.display = 'none';
    this.visible = false;
  }

  isVisible(): boolean { return this.visible; }
}

function typeIcon(t: Body['type']): string {
  switch (t) {
    case 'star':     return '★';
    case 'planet':   return '◉';
    case 'moon':     return '◌';
    case 'asteroid': return '⬡';
    case 'rocket':   return '🚀';
  }
}
